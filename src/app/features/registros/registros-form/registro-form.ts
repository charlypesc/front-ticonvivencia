import { Component, OnInit, Output, EventEmitter, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EtiquetaPipe } from '../../../shared/pipes/etiqueta.pipe';
import { hoyIso } from '../../../shared/utils/fecha';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { AuthService } from '../../../core/services/auth.service';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../../shared/directives/permiso.directive';
import { CursoNombrePipe } from '../../../shared/pipes/curso-nombre.pipe';
import { Buscador } from '../../../shared/components/buscador/buscador';
import { ordenarPorCoincidencia } from '../../../shared/utils/coincidencia';
import { CerrarConEsc } from '../../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../../shared/directives/guardar-con-cmd-enter.directive';
import { FechaPipe } from '../../../shared/pipes/fecha.pipe';

@Component({
  selector: 'app-registro-form',
  standalone: true,
  imports: [EtiquetaPipe, CommonModule, FormsModule, Puede, CursoNombrePipe, Buscador, CerrarConEsc, GuardarConCmdEnter, FechaPipe],
  templateUrl: './registro-form.html',
  styleUrl: './registro-form.scss',
})
export class RegistroForm implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  /**
   * Emite el mensaje de éxito cuando el cierre viene de un guardado, y nada
   * cuando la persona cancela o cierra el modal. La pantalla de atrás usa eso
   * para dos cosas: mostrar el aviso de "guardado" y decidir si vale la pena
   * recargar la lista (cancelar no cambió nada, no hay qué recargar).
   */
  @Output() cerrar = new EventEmitter<string | undefined>();
  @Input() registro: any | null;
  @Input() estudiantePreseleccionado: number | null = null;
  tiposFalta = signal<any[]>([]);
  estudiantes = signal<any[]>([]);
  loading = signal(false);
  error = signal('');
  /** Causas concretas que acompañan a un error, cuando el backend las manda
   *  (hoy: los problemas de coherencia de un flujo que no se pudo activar). */
  errorDetalle = signal<string[]>([]);

  // En edición lo decide el backend (autor del registro o permiso
  // registro.editar_confidencialidad — ver getRegistro() en ngOnInit). Al
  // crear todavía no hay autor guardado, así que la única puerta es el
  // permiso: se precarga en ngOnInit y no queda en `true` fijo, porque el
  // backend ya no respeta un es_confidencial que mande alguien sin el
  // permiso — dejar el checkbox habilitado igual solo confundía.
  puedeEditarConfidencialidad = signal(false);

  // Activación de protocolo junto con el registro.
  //
  // El protocolo se activa SOBRE EL REGISTRO (PROTOCOLO_ACTIVADO.id_registro),
  // no sobre un estudiante suelto: los involucrados ya cuelgan del registro, así
  // que activar acá es lo mismo que activárselo al alumno del caso.
  //
  // Va como paso aparte después de guardar porque son dos endpoints distintos:
  // si la activación falla (flujo del protocolo incoherente, por ejemplo), el
  // registro igual quedó guardado y hay que decirlo en vez de simular un error
  // de guardado.
  puedeActivarProtocolo = false;
  protocolos = signal<any[]>([]);
  activarProtocolo = false;
  idProtocoloEstablecimiento: number | null = null;
  /** Protocolos ya activados sobre este registro (solo en edición). */
  protocolosActivados = signal<any[]>([]);

  /** El backend rechaza activar dos veces el mismo protocolo sobre un registro. */
  protocolosDisponibles() {
    const yaActivados = new Set(
      this.protocolosActivados().map((p) => p.id_protocolo_establecimiento)
    );
    return this.protocolos().filter((p) => !yaActivados.has(p.id_protocolo_establecimiento));
  }

  /**
   * Son getters y no `computed()` porque `form` es un objeto plano que mueve
   * ngModel, no una señal: un computed no se enteraría del cambio.
   */
  get tipoFaltaSeleccionado(): any | null {
    return this.tiposFalta().find((t) => t.id_tipo_falta === this.form.id_tipo_falta) ?? null;
  }

  get gravedadSeleccionada(): string | null {
    return this.tipoFaltaSeleccionado?.gravedad ?? null;
  }

  /**
   * Protocolos que el tipo de falta elegido manda activar (Ley 21.809).
   *
   * Antes esto era un heurístico por gravedad: se sugería activar algo si la
   * falta era grave o gravísima, y la persona elegía cuál de una lista plana.
   * Ahora el vínculo es explícito y lo configura el establecimiento en el
   * mantenedor de tipos de falta, que es donde vive su reglamento interno.
   *
   * El heurístico sigue vivo como respaldo para las faltas que todavía no
   * tienen ningún protocolo vinculado: quitarlo dejaría sin ningún aviso a los
   * colegios que aún no cargaron el mapeo.
   */
  get protocolosDeLaFalta(): any[] {
    return this.tipoFaltaSeleccionado?.protocolos ?? [];
  }

  get protocolosObligatorios(): any[] {
    return this.protocolosDeLaFalta.filter((p) => p.obligatorio);
  }

  /** Obligatorios de esta falta que todavía no están activados en el registro. */
  get obligatoriosPendientes(): any[] {
    const yaActivados = new Set(
      this.protocolosActivados().map((p) => p.id_protocolo_establecimiento),
    );
    return this.protocolosObligatorios.filter(
      (p) => !yaActivados.has(p.id_protocolo_establecimiento),
    );
  }

  /**
   * No se muestra si ya marcó activar protocolo, si el registro ya tiene uno
   * activado o si no hay ninguno disponible: en esos casos el aviso no le pide
   * nada que pueda hacer, y un aviso que no se puede atender se vuelve ruido
   * que se aprende a ignorar.
   */
  get sugerirProtocolo(): boolean {
    if (!this.puedeActivarProtocolo || this.activarProtocolo) return false;
    if (this.protocolosDisponibles().length === 0) return false;

    // Con mapeo explícito el aviso depende de él, no de la gravedad. Y un
    // obligatorio pendiente se avisa aunque el registro ya tenga otro protocolo
    // activado: son protocolos distintos, activar uno no cubre al otro.
    if (this.protocolosDeLaFalta.length > 0) return this.obligatoriosPendientes.length > 0
      || (this.protocolosActivados().length === 0 && this.protocolosDeLaFalta.length > 0);

    // Respaldo por gravedad para las faltas sin vínculo configurado.
    const g = this.gravedadSeleccionada;
    if (g !== 'grave' && g !== 'gravísima') return false;
    return this.protocolosActivados().length === 0;
  }

  /** El aviso cambia de tono si el protocolo es obligatorio: no es una sugerencia. */
  get protocoloEsObligatorio(): boolean {
    return this.obligatoriosPendientes.length > 0;
  }

  get mensajeSugerencia(): string {
    // El texto decía que sin activarlo "el registro no se va a poder validar",
    // y eso nunca fue cierto: nada en el backend lo impide, el vínculo
    // obligatorio solo cambia el tono del aviso. Se dice lo que realmente pasa
    // —queda pendiente y a la vista— porque un aviso que amenaza con un bloqueo
    // que no ocurre enseña a no creerle al resto de los avisos.
    if (this.protocoloEsObligatorio)
      return (
        'El reglamento del establecimiento asocia esta falta a ' +
        this.obligatoriosPendientes.map((p) => `"${p.protocolo_nombre}"`).join(' y ') +
        '. Si no corresponde al caso, podés dejarlo sin activar: queda como pendiente en el registro.'
      );
    if (this.protocolosDeLaFalta.length > 0)
      return (
        'Para este tipo de falta el establecimiento tiene definido el protocolo ' +
        this.protocolosDeLaFalta.map((p) => `"${p.protocolo_nombre}"`).join(' o ') +
        '.'
      );
    return 'Por la gravedad de la falta, evaluá si corresponde activar un protocolo.';
  }

  /**
   * Si el protocolo tildado lo puso el formulario solo (y no la persona), se
   * puede volver atrás al cambiar el tipo de falta. Una elección manual, en
   * cambio, es una decisión sobre el caso y no se pisa: puede haber un motivo
   * que el reglamento no cubre.
   */
  private protocoloAutoSeleccionado = false;

  /**
   * Al elegir el tipo de falta se preselecciona su protocolo. Es el cambio de
   * fondo: la persona ya no tiene que saber cuál corresponde, el reglamento del
   * colegio lo dice. Igual puede desmarcarlo si el caso no lo amerita, salvo
   * que el bloqueo de la validación lo obligue después.
   *
   * Y al revés: corregir la falta tiene que poder deshacer la sugerencia. Si se
   * eligió una gravísima con protocolo y después resulta que era una leve, el
   * tilde de la gravísima quedaba puesto y se activaba un protocolo que ya no
   * correspondía. Por eso lo primero es limpiar la preselección anterior.
   */
  onTipoFaltaChange() {
    if (!this.puedeActivarProtocolo) return;

    if (this.protocoloAutoSeleccionado) {
      this.activarProtocolo = false;
      this.idProtocoloEstablecimiento = null;
      this.protocoloAutoSeleccionado = false;
    }

    const pendiente = this.obligatoriosPendientes[0] ?? this.protocolosDeLaFalta[0];
    if (!pendiente) return;
    if (!this.protocolosDisponibles().some(
      (p) => p.id_protocolo_establecimiento === pendiente.id_protocolo_establecimiento)) return;

    this.activarProtocolo = true;
    this.idProtocoloEstablecimiento = pendiente.id_protocolo_establecimiento;
    this.protocoloAutoSeleccionado = true;
  }

  /**
   * Tocar el tilde o el desplegable convierte la preselección en una decisión
   * propia: desde acá el cambio de tipo de falta ya no la toca.
   */
  onActivarProtocoloChange() {
    this.protocoloAutoSeleccionado = false;
    if (!this.activarProtocolo) this.idProtocoloEstablecimiento = null;
  }

  // Selección múltiple de estudiantes
  estudiantesSeleccionados: { id_estudiante: number; rol_en_incidente: string }[] = [];

  // Buscador para agregar estudiantes a la lista de involucrados. El desplegable,
  // el teclado y el cierre por blur los resuelve <app-buscador>; acá solo queda
  // el texto escrito y el criterio de filtrado.
  busquedaEstudiante = signal('');

  involucrados() {
    return this.estudiantes().filter((e) => this.isSeleccionado(e.id_estudiante));
  }

  sugerenciasEstudiante() {
    const q = this.busquedaEstudiante().toLowerCase().trim();
    if (q.length < 2) return [];

    // Mismo criterio que el buscador de Estudiantes: cada palabra escrita se
    // busca por separado, sin importar el orden ni qué haya en el medio, y
    // después se ordena por parecido para que Enter caiga sobre la mejor.
    const tokens = q.split(/\s+/);
    const coincidencias = this.estudiantes()
      .filter((e) => !this.isSeleccionado(e.id_estudiante))
      .filter((e) => {
        const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
        return tokens.every((t) => nombreCompleto.includes(t)) || e.run?.includes(q);
      });

    return ordenarPorCoincidencia(coincidencias, q, (e) => `${e.nombre} ${e.apellido}`).slice(0, 8);
  }

  seleccionarEstudianteSugerido(e: any) {
    this.toggleEstudiante(e.id_estudiante);
  }

  form = {
    // Un registro nuevo abre con la fecha de hoy; en edición la pisa cargarForm().
    fecha_incidente: hoyIso(),
    asunto: '',
    antecedentes: '',
    acuerdos: '',
    id_tipo_falta: null as number | null,
    es_confidencial: false,
    nota_confidencial: '',
  };

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit() {
    // Carga tipos de falta y estudiantes en paralelo
    this.api.getTiposFalta().subscribe((data) => this.tiposFalta.set(data));
    this.api.getEstudiantes().subscribe((data) => this.estudiantes.set(data));
    // Para elegir un funcionario de la lista en vez de escribirlo a mano. Es
    // una lista larga que no hace falta para mostrar el formulario, y si la
    // persona no tiene permiso para verla (usuario.ver) el <select> queda
    // vacío y se sigue pudiendo escribir el nombre a mano — mismo criterio
    // que usa protocolo-caso para lo mismo.
    this.api.getUsuarios().subscribe({ next: (data) => this.usuarios.set(data), error: () => {} });

    // Punto de partida para un registro NUEVO: todavía no hay autor guardado
    // contra quien comparar, así que la única puerta es el permiso. En edición
    // esto se pisa abajo con lo que responde el backend (autor O el permiso).
    this.puedeEditarConfidencialidad.set(this.auth.can(Permiso.RegistroEditarConfidencialidad));

    // El catálogo del colegio solo se pide si la persona puede activar: sin el
    // permiso la sección ni se muestra, y sería una llamada que devuelve 403.
    this.puedeActivarProtocolo = this.auth.can(Permiso.ProtocoloActivadoCrear);
    if (this.puedeActivarProtocolo) {
      this.api.getProtocolosEstablecimiento().subscribe((data) => this.protocolos.set(data));
      if (this.registro) {
        this.api
          .getProtocolosActivadosByRegistro(this.registro.id_registro)
          .subscribe((data) => this.protocolosActivados.set(data));
      }
    }

    if (this.registro) {
      this.api.getRegistro(this.registro.id_registro).subscribe({
        next: (data) => {
          this.registro = data;
          this.estudiantesSeleccionados = data.estudiantes;
          this.involucradosPersonal = data.involucrados_personal ?? [];
          this.puedeEditarConfidencialidad.set(data.puede_editar_confidencialidad !== false);
          // El detalle manda: quien abre desde el dashboard solo pasa el id, así
          // que sin este segundo llenado el formulario quedaría en blanco.
          this.cargarForm(data);
        },
        // Si el detalle no se pudo cargar (403 por confidencial, por ejemplo),
        // el formulario queda con datos incompletos: se cierra en vez de
        // dejarlo editable y que un guardado pise el registro con lo que haya.
        error: (err) => {
          this.error.set(err.error?.message ?? 'No se pudo cargar el registro');
          this.puedeEditarConfidencialidad.set(false);
          setTimeout(() => this.cerrar.emit(), 1500);
        },
      });
      this.cargarForm(this.registro);
    } else if (this.estudiantePreseleccionado) {
      this.toggleEstudiante(this.estudiantePreseleccionado);
    }
  }
  private cargarForm(reg: any) {
    this.form = {
      ...this.form,
      ...reg,
      fecha_incidente: reg.fecha_incidente
        ? String(reg.fecha_incidente).slice(0, 10) // Formato YYYY-MM-DD cortamos con el slice y tomamos los primeros 10 caracteres para que el inpunt lo lea correctamte
        : '',
      es_confidencial: !!reg.es_confidencial, // llega como 0/1 desde MySQL
      nota_confidencial: reg.nota_confidencial ?? '',
    };
  }

  //Es el toggle: si el estudiante ya está en la lista de seleccionados, splice lo saca (deselecciona); si no esta, lo agrega con push.
  toggleEstudiante(id: number) {
    const idx = this.estudiantesSeleccionados.findIndex((e) => e.id_estudiante === id);
    if (idx >= 0) {
      this.estudiantesSeleccionados.splice(idx, 1);
    } else {
      // Sin rol por defecto: dejarlo en 'afectado' hacía que el usuario
      // guardara roles que nunca eligió y eso cambia el orden con que los
      // involucrados aparecen en protocolos activados. Queda vacío y se valida
      // como obligatorio en guardar().
      this.estudiantesSeleccionados.push({ id_estudiante: id, rol_en_incidente: '' });
    }
  }

  setRol(id: number, rol: string) {
    const e = this.estudiantesSeleccionados.find((e) => e.id_estudiante === id);
    if (e) e.rol_en_incidente = rol;
  }

  isSeleccionado(id: number) {
    return this.estudiantesSeleccionados.some((e) => e.id_estudiante === id);
  }

  getRol(id: number) {
    return (
      this.estudiantesSeleccionados.find((e) => e.id_estudiante === id)?.rol_en_incidente ?? ''
    );
  }

  // Estos cuatro son exactamente los valores del enum de la columna
  // REGISTRO_ESTUDIANTE.rol_en_incidente. No son etiquetas: 'afectado' y
  // 'senalado' se eligieron en vez de 'víctima' y 'agresor' porque esas son
  // calificaciones jurídicas que el establecimiento no puede hacer antes de
  // investigar, y el rol se asigna al registrar el hecho. Mandar cualquier otra
  // cosa hace que MySQL rechace el INSERT.
  rolesConocidos = ['afectado', 'senalado', 'testigo', 'denunciante'];
  esRolConocido(rol: string) {
    return this.rolesConocidos.includes(rol);
  }

  // ── Involucrados que no son estudiantes ──────────────────────────────────
  //
  // El denunciante muchas veces no es un estudiante: es un inspector o un
  // profesor que reporta lo que vio. La lista de arriba solo busca entre
  // estudiantes (REGISTRO_ESTUDIANTE), así que sin esto ese dato no tenía
  // dónde quedar — el registro "no lo registraba".

  usuarios = signal<any[]>([]);
  /** Centinela del <select>: un funcionario sin cuenta en el sistema se
   *  escribe a mano. Mismo patrón que protocolo-caso al incorporar a alguien
   *  al caso. */
  readonly SIN_CUENTA = '__sin_cuenta__';

  involucradosPersonal: {
    tipo_persona: 'funcionario' | 'externo';
    id_usuario: number | null;
    nombre: string;
    rut: string;
    rol_en_incidente: string;
  }[] = [];

  // id_usuario es number | string | null y no solo number|null: el <select>
  // también puede llevar el centinela SIN_CUENTA mientras se elige.
  formPersonal: {
    tipo_persona: 'funcionario' | 'externo';
    id_usuario: number | string | null;
    nombre: string;
    rut: string;
    rol_en_incidente: string;
  } = {
    tipo_persona: 'funcionario',
    id_usuario: null,
    nombre: '',
    rut: '',
    rol_en_incidente: 'denunciante',
  };

  /**
   * Si el formulario para sumar a un funcionario/externo está desplegado.
   *
   * Arranca cerrado: la mayoría de los registros son solo entre estudiantes, y
   * dejar dos selects, dos inputs y un botón siempre abiertos empujaba el
   * asunto y el relato —que sí se llenan siempre— más abajo de lo que entra en
   * pantalla. La lista de los ya agregados no se esconde nunca: eso es dato del
   * registro, no un formulario.
   */
  mostrarFormPersonal = signal(false);

  abrirFormPersonal() {
    this.limpiarFormPersonal();
    this.error.set('');
    this.mostrarFormPersonal.set(true);
  }

  /** Cierra y descarta lo tipeado: si no, al reabrir aparece a medio llenar. */
  cerrarFormPersonal() {
    this.limpiarFormPersonal();
    this.mostrarFormPersonal.set(false);
  }

  private limpiarFormPersonal() {
    this.formPersonal = {
      tipo_persona: this.formPersonal.tipo_persona,
      id_usuario: null,
      nombre: '',
      rut: '',
      rol_en_incidente: 'denunciante',
    };
  }

  agregarInvolucradoPersonal() {
    const f = this.formPersonal;
    const funcionarioSinCuenta = f.tipo_persona === 'funcionario' && f.id_usuario === this.SIN_CUENTA;

    if (f.tipo_persona === 'funcionario' && !f.id_usuario) {
      this.error.set('Elige al funcionario');
      return;
    }
    if ((funcionarioSinCuenta || f.tipo_persona === 'externo') && !f.nombre.trim()) {
      this.error.set('Escribe el nombre de la persona');
      return;
    }
    this.error.set('');

    // Con cuenta elegida de la lista, el nombre lo pone el sistema (es el
    // mismo criterio que protocolo-caso): lo que la persona haya escrito a
    // mano en ese momento no se usa, para no terminar con un nombre distinto
    // al de la cuenta que en realidad quedó vinculada.
    const usuarioElegido = !funcionarioSinCuenta && f.tipo_persona === 'funcionario'
      ? this.usuarios().find((u) => u.id_usuario === f.id_usuario)
      : null;
    const idUsuario = usuarioElegido ? (f.id_usuario as number) : null;

    this.involucradosPersonal.push({
      tipo_persona: f.tipo_persona,
      id_usuario: idUsuario,
      nombre: usuarioElegido ? (usuarioElegido.nombre || usuarioElegido.correo) : f.nombre.trim(),
      rut: f.rut.trim(),
      rol_en_incidente: f.rol_en_incidente,
    });
    this.limpiarFormPersonal();
  }

  quitarInvolucradoPersonal(i: number) {
    this.involucradosPersonal.splice(i, 1);
  }

  guardar() {
    this.error.set('');
    this.errorDetalle.set([]);
    const { fecha_incidente, asunto, antecedentes, id_tipo_falta } = this.form;

    if (!fecha_incidente || !asunto || !antecedentes || !id_tipo_falta) {
      this.error.set('Complete todos los campos requeridos');
      return;
    }

    if (this.estudiantesSeleccionados.some((e) => !e.rol_en_incidente)) {
      this.error.set('Indique el rol de cada estudiante involucrado');
      return;
    }

    if (this.form.es_confidencial && !this.form.nota_confidencial.trim()) {
      this.error.set('Indique la nota de confidencialidad');
      return;
    }

    if (this.activarProtocolo && !this.idProtocoloEstablecimiento) {
      this.error.set('Seleccione el protocolo a activar');
      return;
    }

    this.loading.set(true);
    if (this.registro === null) {
      this.api
        .createRegistro({
          ...this.form,
          estudiantes: this.estudiantesSeleccionados,
          involucrados_personal: this.involucradosPersonal,
        })
        .subscribe({
          next: (res: any) => this.activarYCerrar(res?.id_registro, 'Registro creado'),
          // El backend rechaza guardados que el formulario no puede anticipar
          // (un tipo de falta que otro usuario eliminó mientras esto estaba
          // abierto, por ejemplo) y explica el motivo. Descartar ese mensaje
          // deja al usuario con un "error al guardar" que no dice qué corregir.
          error: (err) => {
            this.loading.set(false);
            this.error.set(err.error?.message ?? 'Error al guardar el registro');
          },
        });
    } else {
      this.api
        .updateRegistro({
          ...this.form,
          estudiantes: this.estudiantesSeleccionados,
          involucrados_personal: this.involucradosPersonal,
        })
        .subscribe({
          next: () => this.activarYCerrar(this.registro.id_registro, 'Registro actualizado'),
          error: (err) => {
            this.loading.set(false);
            this.error.set(err.error?.message ?? 'Error al guardar el registro');
          },
        });
    }
  }

  /** El registro ya está guardado: acá solo falta el protocolo, si lo pidieron. */
  private activarYCerrar(idRegistro: number | undefined, mensaje: string) {
    // Se cierra apenas el backend confirma, sin espera artificial: el aviso de
    // éxito lo muestra la pantalla de atrás, que es la que queda a la vista.
    if (!this.activarProtocolo || !this.idProtocoloEstablecimiento || !idRegistro) {
      this.cerrar.emit(mensaje);
      return;
    }

    this.api
      .createProtocoloActivado({
        id_protocolo_establecimiento: this.idProtocoloEstablecimiento,
        id_registro: idRegistro,
      })
      .subscribe({
        next: () => this.cerrar.emit(`${mensaje} y protocolo activado`),
        // El registro quedó guardado igual: el mensaje tiene que decirlo, o la
        // persona lo vuelve a crear y termina con dos registros del mismo caso.
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            `Registro guardado, pero no se pudo activar el protocolo: ${
              err.error?.message ?? 'error del servidor'
            }`
          );
          // Un flujo mal armado se rechaza con la causa exacta en `problemas`
          // (qué paso y qué campo). Sin mostrarla, el mensaje genérico obliga a
          // ir a mirar la plantilla a ciegas para saber qué hay que corregir.
          this.errorDetalle.set(
            Array.isArray(err.error?.problemas) ? err.error.problemas : [],
          );
        },
      });
  }
}
