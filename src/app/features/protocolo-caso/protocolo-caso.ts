import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import {
  GrafoProtocolo,
  NodoGrafo,
  AristaGrafo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';
import { MedidasProteccion } from '../../shared/components/medidas-proteccion/medidas-proteccion';
import { MedidasDisciplinarias } from '../../shared/components/medidas-disciplinarias/medidas-disciplinarias';
import { ExpedienteService } from '../../core/services/expediente.service';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';

/**
 * Un protocolo en ejecución sobre un caso.
 *
 * La pantalla se organiza alrededor del paso en curso, no de la lista completa:
 * lo que alguien necesita saber al abrirla es qué le toca hacer ahora y hasta
 * cuándo. Los demás pasos quedan como línea de tiempo debajo, con el estado en
 * que están.
 *
 * El formulario del paso se arma con los campos que vienen del backend (el
 * schema congelado al activar), no con campos escritos a mano acá: son los
 * mismos que alimentan las condiciones de las transiciones, y duplicarlos en el
 * front significaría que un protocolo nuevo no se puede ejecutar sin desplegar.
 */
@Component({
  selector: 'app-protocolo-caso',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe,
    MedidasProteccion, MedidasDisciplinarias, CerrarConEsc,
  ],
  templateUrl: './protocolo-caso.html',
  styleUrl: './protocolo-caso.scss',
})
export class ProtocoloCaso implements OnInit {
  protected readonly Permiso = Permiso;

  id = 0;
  caso = signal<any | null>(null);
  bitacora = signal<any[]>([]);
  usuarios = signal<any[]>([]);
  loading = signal(true);
  guardando = signal(false);
  error = signal('');
  success = signal('');

  /** Respuestas del paso en curso, indexadas por código de campo. */
  datos: Record<string, any> = {};
  aprobado: boolean | null = null;
  comentario = '';
  nota = '';
  mostrarBitacora = signal(false);

  // Exportar el expediente no descarga directo: se ofrece imprimir o descargar,
  // porque en la mayoría de los casos lo que se necesita es el papel firmado y
  // no un archivo suelto.
  mostrarExportar = signal(false);
  exportando = signal(false);
  /** Sin datos personales: es el modo que se le entrega a un tercero. */
  exportarRedactado = false;
  mostrarReasignar = signal(false);
  reasignarA: number | null = null;

  pasoActual = computed(() =>
    this.caso()?.pasos?.find((p: any) => ['en_curso', 'vencido'].includes(p.estado)) ?? null,
  );

  /** El campo 'aprobado' lo decide el botón, no el formulario. */
  camposEditables = computed(() =>
    (this.pasoActual()?.campos ?? []).filter((c: any) => c.codigo !== 'aprobado'),
  );

  /**
   * ¿Corresponde preguntar este campo con lo respondido hasta ahora?
   *
   * Un campo puede depender de otro del mismo paso (`depende_de: 'campo=valor'`,
   * la misma sintaxis que las condiciones del flujo). "Descargos presentados"
   * solo tiene sentido si antes se dijo que sí los presentó: mostrarlo igual
   * invita a escribir algo que contradice la respuesta anterior, y eso queda en
   * el expediente. Mientras el campo del que depende esté sin responder, el
   * dependiente no se muestra: no se puede afirmar que corresponda.
   */
  campoVisible(campo: any) {
    const m = /^([a-z][a-z0-9_]*)\s*(!?=)\s*(.+)$/.exec(campo?.depende_de ?? '');
    if (!m) return true;

    const [, codigo, operador, valor] = m;
    const respuesta = this.datos[codigo];
    if (respuesta === null || respuesta === undefined || String(respuesta).trim() === '') return false;

    return operador === '='
      ? String(respuesta) === valor.trim()
      : String(respuesta) !== valor.trim();
  }

  /**
   * Los campos que se pintan ahora mismo. Es un método y no un `computed`
   * a propósito: depende de `datos`, que es un objeto plano que muta con cada
   * tecla; un computed sobre signals no se enteraría y el campo dependiente
   * no aparecería hasta recargar.
   */
  camposVisibles() {
    return this.camposEditables().filter((c: any) => this.campoVisible(c));
  }

  activo = computed(() => this.caso()?.estado === 'activo');

  mostrarGrafo = signal(false);

  mostrarDetalle = signal(false);
  /** Paso que muestra el modal de detalle. Se guarda el id: tras completar un
   *  paso el caso se recarga entero y el objeto viejo quedaría mostrando el
   *  estado anterior. */
  pasoSeleccionadoId = signal<number | null>(null);
  pasoSeleccionado = computed(
    () =>
      (this.caso()?.pasos ?? []).find(
        (p: any) => p.id_activado_paso === this.pasoSeleccionadoId(),
      ) ?? null,
  );

  seleccionarDelGrafo(nodo: NodoGrafo) {
    this.pasoSeleccionadoId.set(nodo.id);
    this.mostrarDetalle.set(true);
  }

  // El mismo diagrama que el editor, pero con `estado`: el color muestra por
  // dónde pasó el caso y dónde está detenido, que es lo que se pregunta quien
  // llega a revisarlo.
  nodosGrafo = computed<NodoGrafo[]>(() =>
    this.pasosVisibles().map((p: any) => ({
      id: p.id_activado_paso,
      nombre: p.nombre,
      tipo_paso: p.tipo_paso,
      es_paso_inicial: p.es_paso_inicial,
      es_paso_final: p.es_paso_final,
      estado: p.estado,
    })),
  );

  aristasGrafo = computed<AristaGrafo[]>(() => {
    // Sin el nodo de la rama descartada, su flecha apuntaría al vacío.
    const visibles = new Set(this.pasosVisibles().map((p: any) => p.id_activado_paso));
    return (this.caso()?.transiciones ?? [])
      .filter((t: any) => visibles.has(t.id_paso_origen) && visibles.has(t.id_paso_destino))
      .map((t: any) => ({
        origen: t.id_paso_origen,
        destino: t.id_paso_destino,
        condicion: t.condicion,
        condicion_legible: this.condicionLegible(t.condicion),
        etiqueta: t.etiqueta,
        es_default: t.es_default,
      }));
  });

  /** La condición se guarda como `codigo=valor`, que es lo que se evalúa; en
   *  pantalla va la etiqueta del campo. `aprobado` no es un campo del
   *  formulario: es el resultado de un paso de aprobación. */
  private etiquetasCampo = computed<Map<string, string>>(() => {
    const mapa = new Map<string, string>([['aprobado', '¿Aprobado?']]);
    for (const p of this.caso()?.pasos ?? [])
      for (const c of p.campos ?? [])
        if (c.codigo) mapa.set(c.codigo, c.etiqueta || humanizar(c.codigo));
    return mapa;
  });

  condicionLegible(condicion?: string | null): string {
    if (!condicion) return '';
    const [codigo, valor] = condicion.split('=');
    const campo = this.etiquetasCampo().get(codigo?.trim()) ?? humanizar(codigo ?? '');
    const v = (valor ?? '').trim();
    if (!v) return campo;
    return `${campo} = ${v === 'si' ? 'Sí' : v === 'no' ? 'No' : v}`;
  }

  /**
   * Los pasos que se muestran: el recorrido real del caso.
   *
   * Un protocolo se materializa entero al activarse, ramas incluidas. El
   * backend marca con `descartado` los pasos colgados de la rama que no se
   * tomó — quedarían pendientes para siempre y se leen como una tarea que
   * alguien olvidó hacer. La regla vive allá (utils/flujoProtocolo) porque es
   * la misma que usa el motor para elegir por dónde sigue el caso.
   */
  pasosVisibles = computed<any[]>(() =>
    (this.caso()?.pasos ?? []).filter((p: any) => !p.descartado),
  );

  /** "4 de 9 pasos" — un caso con ramas nunca recorre todos, así que se cuenta
   *  lo cerrado (completado u omitido) sobre los pasos que siguen en juego. */
  get avance() {
    const pasos = this.pasosVisibles();
    const hechos = pasos.filter((p: any) => ['completado', 'omitido'].includes(p.estado)).length;
    return `${hechos} de ${pasos.length} pasos`;
  }

  constructor(
    private expedienteService: ExpedienteService,
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private confirmService: ConfirmService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
    // Solo alimenta el selector de "reasignar". Quien no tenga usuario.ver
    // recibe 403 acá y no pasa nada: el botón ya está bloqueado por su permiso.
    this.api.getUsuarios().subscribe({ next: (data) => this.usuarios.set(data), error: () => {} });
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocoloActivado(this.id).subscribe({
      next: (data) => {
        this.caso.set(data);
        this.prepararFormulario();
        this.prepararGestiones();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo cargar el protocolo');
        this.loading.set(false);
      },
    });
  }

  /** Precarga lo ya respondido: un paso reabierto conserva lo que se llenó antes. */
  private prepararFormulario() {
    const paso = this.pasoActual();
    this.datos = {};
    this.aprobado = null;
    this.comentario = '';
    if (!paso) return;
    for (const campo of paso.campos ?? []) {
      if (campo.codigo === 'aprobado') continue;
      this.datos[campo.codigo] = paso.datos_salida?.[campo.codigo] ?? '';
    }
  }

  verBitacora() {
    this.mostrarBitacora.set(true);
    this.api.getBitacoraProtocolo(this.id).subscribe({
      next: (data) => this.bitacora.set(data),
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar la bitácora'),
    });
  }

  // Los campos vacíos no se envían: el backend distingue "sin responder" de
  // cadena vacía para decidir si falta un obligatorio.
  private datosLimpios() {
    // Solo lo que de verdad se preguntó: si alguien respondió 'sí', llenó el
    // campo dependiente y después cambió a 'no', ese texto no se manda. No se
    // borra de `datos` al ocultarse para que volver atrás no lo pierda.
    const visibles = new Set(this.camposVisibles().map((c: any) => c.codigo));
    const salida: Record<string, any> = {};
    for (const [k, v] of Object.entries(this.datos))
      if (visibles.has(k) && v !== null && v !== undefined && String(v).trim() !== '') salida[k] = v;
    return salida;
  }

  /**
   * Por qué el botón está deshabilitado, para el tooltip. Solo aplica al caso
   * de "el paso es de otro rol y no puedes tomarlo": el resto de los motivos
   * (falta el permiso, el protocolo está cerrado) los explica la directiva.
   */
  motivoPasoAjeno(paso: any, tipo: 'ejecutor' | 'aprobador') {
    const titulo = tipo === 'ejecutor' ? paso.puede_ejecutar : paso.puede_aprobar;
    if (titulo) return '';
    const rol = tipo === 'ejecutor' ? paso.rol_ejecutor_nombre : paso.rol_aprobador_nombre;
    return rol
      ? `Este paso está asignado a: ${rol}`
      : 'Este paso no tiene asignado un rol que pueda realizarlo';
  }

  /**
   * Aviso previo cuando el paso está asignado a otro rol y aun así se puede
   * tomar. No es un trámite: el acto queda firmado a nombre de quien lo hace y
   * la bitácora anota en lugar de quién, así que conviene que lo sepa antes y
   * no después de leer el expediente.
   *
   * Devuelve true cuando el paso sí le toca (no hay nada que confirmar) o
   * cuando la persona confirmó.
   */
  private async confirmarSiEsAjeno(paso: any, titulo: string, rolTitular: string, accion: string) {
    if (titulo !== 'en_lugar_de') return true;
    return this.confirmService.confirmarAccion(
      `Este paso está asignado a: ${rolTitular || 'otro rol'}.\n\n` +
        `Puedes ${accion} igual, pero quedará firmado a tu nombre en el expediente, ` +
        `indicando que actuaste en su lugar.`,
    );
  }

  async completar() {
    const paso = this.pasoActual();
    if (!paso) return;
    if (!(await this.confirmarSiEsAjeno(paso, paso.puede_ejecutar, paso.rol_ejecutor_nombre, 'completarlo')))
      return;
    if (!(await this.guardarGestionesDelPaso(paso))) return;
    this.ejecutar(this.api.completarPaso(this.id, paso.id_activado_paso, this.datosLimpios()));
  }

  /**
   * Persiste lo registrado con cada persona antes de dar el paso por cumplido.
   *
   * Si una falla se corta acá y el paso NO se completa: completarlo igual
   * dejaría el caso avanzando con una notificación que en la base no existe, y
   * esa constancia es justamente la prueba que se pide después.
   */
  private async guardarGestionesDelPaso(paso: any) {
    const pendientes = this.gestionesModificadas(paso);
    if (pendientes.length === 0) return true;

    this.error.set('');
    this.guardando.set(true);
    try {
      for (const g of pendientes) await this.guardarGestion(g);
      return true;
    } catch (err: any) {
      this.error.set(
        err?.error?.message ??
          `No se pudo registrar la gestión con ${pendientes[0].involucrado_nombre}: el paso no se completó.`,
      );
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  async aprobar(decision: boolean) {
    const paso = this.pasoActual();
    if (!paso) return;
    const accion = decision ? 'aprobarlo' : 'rechazarlo';
    if (!(await this.confirmarSiEsAjeno(paso, paso.puede_aprobar, paso.rol_aprobador_nombre, accion)))
      return;
    if (!(await this.guardarGestionesDelPaso(paso))) return;
    this.ejecutar(
      this.api.aprobarPaso(this.id, paso.id_activado_paso, {
        aprobado: decision,
        comentario: this.comentario,
        datos_salida: this.datosLimpios(),
      }),
    );
  }

  async omitir() {
    const paso = this.pasoActual();
    if (!paso) return;
    const motivo = this.comentario.trim();
    // El motivo es obligatorio en el backend, pero pedirlo acá evita el viaje
    // y deja claro que omitir un paso deja rastro.
    if (!motivo) {
      this.error.set('Para omitir un paso hay que indicar el motivo en el comentario.');
      return;
    }
    // Omitir ya pedía confirmación: el aviso de paso ajeno se suma al mismo
    // mensaje en vez de encadenar dos modales seguidos.
    const ajeno = paso.puede_ejecutar === 'en_lugar_de'
      ? `\n\nOjo: este paso está asignado a ${paso.rol_ejecutor_nombre || 'otro rol'}. ` +
        'Quedará anotado que lo omitiste en su lugar.'
      : '';
    const ok = await this.confirmService.confirmarAccion(
      `¿Omitir el paso "${paso.nombre}"? Queda registrado en la bitácora con tu nombre.${ajeno}`,
    );
    if (!ok) return;
    this.ejecutar(this.api.omitirPaso(this.id, paso.id_activado_paso, motivo));
  }

  reasignar() {
    const paso = this.pasoActual();
    if (!paso || !this.reasignarA) return;
    this.api.reasignarPaso(this.id, paso.id_activado_paso, this.reasignarA).subscribe({
      next: () => {
        this.mostrarReasignar.set(false);
        this.success.set('Responsable asignado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo reasignar'),
    });
  }

  async cerrar() {
    const pendientes = this.pasosVisibles().filter((p: any) =>
      ['pendiente', 'en_curso', 'vencido'].includes(p.estado),
    ).length;
    const sinFirma = this.acusesPendientes();
    const motivo = this.comentario.trim();
    if (pendientes > 0 && !motivo) {
      this.error.set(
        `Quedan ${pendientes} paso(s) sin completar. Para cerrar igual, escribe el motivo en el comentario.`,
      );
      return;
    }
    // Una firma pendiente no detiene el protocolo mientras corre, pero el
    // cierre es la última oportunidad de dejar dicho por qué se cerró sin ella.
    if (sinFirma > 0 && !motivo) {
      this.error.set(
        `Hay ${sinFirma} notificación(es) sin firma de recepción. Para cerrar igual, escribe el motivo en el comentario.`,
      );
      return;
    }
    const faltantes = [
      pendientes > 0 ? `${pendientes} paso(s) sin completar` : '',
      sinFirma > 0 ? `${sinFirma} firma(s) pendiente(s)` : '',
    ].filter(Boolean);
    const ok = await this.confirmService.confirmarAccion(
      faltantes.length
        ? `¿Cerrar el protocolo con ${faltantes.join(' y ')}?`
        : '¿Cerrar el protocolo?',
    );
    if (!ok) return;
    this.ejecutar(this.api.cerrarProtocoloActivado(this.id, motivo), 'Protocolo cerrado');
  }

  async anular() {
    const motivo = this.comentario.trim();
    if (!motivo) {
      this.error.set('Para anular hay que indicar el motivo en el comentario.');
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      '¿Anular este protocolo? El caso deja de avanzar, pero la bitácora se conserva.',
    );
    if (!ok) return;
    this.ejecutar(this.api.anularProtocoloActivado(this.id, motivo), 'Protocolo anulado');
  }

  // ── Involucrados ─────────────────────────────────────────────────────────
  //
  // Un caso se instruye contra alguien y a favor de alguien. Los pasos que
  // alcanzan a varias personas (notificar, aplicar una medida, derivar) traen
  // una fila por cada una: el paso avanza igual, pero acá se ve a quién ya se
  // le cumplió y a quién falta.

  readonly ROLES_INVOLUCRADO = ['afectado', 'senalado', 'testigo', 'denunciante'];
  readonly MEDIOS_ACUSE = ['presencial', 'correo', 'telefono', 'plataforma', 'carta'];

  involucrados = computed<any[]>(() => this.caso()?.involucrados ?? []);

  /**
   * Un involucrado lleva a su ficha solo si es estudiante del establecimiento y
   * quedó registrado con RUT: la ficha se abre por RUT (`/estudiantes?rut=`) y
   * un apoderado o un funcionario no tiene ninguna a la que ir.
   *
   * También se pide el permiso de ver estudiantes: sin él, el guard de la ruta
   * mandaría a "no autorizado", así que es mejor no ofrecer el camino.
   */
  puedeVerFicha(i: any): boolean {
    return (
      i?.tipo_persona === 'estudiante' &&
      !!i?.rut &&
      this.auth.can(Permiso.EstudianteVer)
    );
  }

  /**
   * Ir a la ficha del estudiante desde la lista de involucrados.
   *
   * Va con confirmación porque se sale del caso: quien está tramitando un
   * protocolo tiene el formulario de un paso a medio llenar más veces que no, y
   * un clic de más sobre un nombre no puede costarle esos datos.
   */
  async abrirFichaEstudiante(i: any) {
    if (!this.puedeVerFicha(i)) return;
    const ok = await this.confirmService.confirmarAccion(
      `¿Salir del caso e ir a la ficha de ${i.nombre}? Se perderá lo que no hayas guardado en este paso.`,
    );
    if (ok) this.router.navigate(['/estudiantes'], { queryParams: { rut: i.rut } });
  }

  /** El hecho que se está tramitando, tal como quedó en el registro. */
  registro = computed<any | null>(() => this.caso()?.registro ?? null);

  /** Lo que se pinta en rojo y lo que el cierre exige explicar. */
  acusesPendientes = computed(() =>
    (this.caso()?.pasos ?? []).reduce((n: number, p: any) => n + (p.acuses_pendientes ?? 0), 0),
  );

  mostrarInvolucrados = signal(false);
  formInvolucrado: any = { tipo_persona: 'estudiante', id_estudiante: null, id_usuario: null, nombre: '', rut: '', rol: 'afectado' };
  estudiantes = signal<any[]>([]);

  abrirInvolucrados() {
    this.error.set('');
    this.formInvolucrado = { tipo_persona: 'estudiante', id_estudiante: null, id_usuario: null, nombre: '', rut: '', rol: 'afectado' };
    this.mostrarInvolucrados.set(true);
    // Se pide recién acá: es una lista larga que la pantalla no necesita para
    // mostrar el caso.
    if (this.estudiantes().length === 0)
      this.api.getEstudiantes().subscribe({ next: (d: any) => this.estudiantes.set(d), error: () => {} });
  }

  agregarInvolucrado() {
    const f = this.formInvolucrado;
    if (f.tipo_persona === 'estudiante' && !f.id_estudiante) return this.error.set('Elige al estudiante');
    if (f.tipo_persona === 'funcionario' && !f.id_usuario) return this.error.set('Elige al funcionario');
    if (f.tipo_persona === 'externo' && !f.nombre.trim()) return this.error.set('Escribe el nombre de la persona');
    this.error.set('');
    this.api.agregarInvolucrado(this.id, f).subscribe({
      next: () => {
        this.success.set('Involucrado incorporado al caso');
        this.formInvolucrado = { ...f, id_estudiante: null, id_usuario: null, nombre: '', rut: '' };
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo incorporar'),
    });
  }

  cambiarRol(inv: any, rol: string) {
    if (inv.rol === rol) return;
    this.api.cambiarRolInvolucrado(this.id, inv.id_involucrado, rol).subscribe({
      next: () => {
        this.success.set(`${inv.nombre}: rol actualizado`);
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo cambiar el rol'),
    });
  }

  async quitarInvolucrado(inv: any) {
    const ok = await this.confirmService.confirmarAccion(`¿Quitar a ${inv.nombre} del caso?`);
    if (!ok) return;
    this.api.quitarInvolucrado(this.id, inv.id_involucrado).subscribe({
      next: () => {
        this.success.set('Involucrado quitado del caso');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo quitar'),
    });
  }

  // ── Gestión con una persona dentro de un paso ────────────────────────────

  /**
   * Un formulario por persona, indexado por `id_paso_involucrado`. Están todos
   * armados desde que carga el caso y todos visibles a la vez: el paso se
   * cumple persona por persona, y esconder cada uno detrás de un modal
   * obligaba a abrirlos de a uno solo para ver en qué estaba cada quien.
   */
  formsGestion: Record<number, any> = {};

  /**
   * Copia de cómo venían las gestiones al cargar. Al completar el paso solo se
   * envían las que el usuario tocó: mandarlas todas le pondría fecha de hoy a
   * una gestión pendiente que nadie miró.
   */
  private gestionesOriginales: Record<number, string> = {};

  /**
   * Estado y firma viajan juntos en un solo control: preguntar "¿se cumplió?"
   * y aparte "¿firmó?" era la misma pregunta dos veces, porque no hay firma sin
   * gestión cumplida. 'cumplido_firmado' existe solo en la UI; al backend
   * siguen yendo `estado` y el acuse por separado.
   */
  private estadoUi(g: any) {
    if (g.fecha_acuse) return 'cumplido_firmado';
    return g.estado ?? 'pendiente';
  }

  private prepararGestiones() {
    const hoy = new Date().toISOString().slice(0, 10);
    const forms: Record<number, any> = {};
    const originales: Record<number, string> = {};
    for (const paso of this.caso()?.pasos ?? [])
      for (const g of paso.involucrados ?? [])
        forms[g.id_paso_involucrado] = {
          estado_ui: this.estadoUi(g),
          // La fecha real del hecho, no la de digitación: la entrevista fue el
          // martes y se registra el jueves. Puede venir como datetime ISO, y en
          // un <input type="date"> cualquier cosa que no sea YYYY-MM-DD queda
          // en blanco.
          fecha_gestion: g.fecha_gestion ? String(g.fecha_gestion).slice(0, 10) : hoy,
          observacion: g.observacion ?? '',
          medio_acuse: g.medio_acuse ?? 'presencial',
        };
    for (const [id, form] of Object.entries(forms)) originales[Number(id)] = JSON.stringify(form);
    this.formsGestion = forms;
    this.gestionesOriginales = originales;
  }

  /**
   * Registra la gestión de una persona. Devuelve una promesa y no recarga por
   * su cuenta: se dispara desde 'Completar paso', que guarda todas juntas y
   * recarga una sola vez al final. No hay botón propio por persona — el paso se
   * cumple de una vez, y un guardado aparte invitaba a completar el paso
   * creyendo que la firma ya estaba registrada cuando no lo estaba.
   */
  private guardarGestion(g: any) {
    const f = this.formsGestion[g.id_paso_involucrado];
    const firmo = f.estado_ui === 'cumplido_firmado';
    const data: any = {
      estado: firmo ? 'cumplido' : f.estado_ui,
      fecha_gestion: f.fecha_gestion || null,
      observacion: f.observacion?.trim() || null,
    };
    if (firmo) {
      // La fecha de la firma se sella una sola vez: si ya la tenía, no se pisa.
      // El medio sí viaja siempre, para poder corregir un "presencial" que en
      // realidad fue por teléfono sin tener que deshacer la firma.
      if (!g.fecha_acuse)
        data.fecha_acuse = new Date().toISOString().slice(0, 19).replace('T', ' ');
      data.medio_acuse = f.medio_acuse;
    }
    return firstValueFrom(this.api.registrarGestion(this.id, g.id_paso_involucrado, data));
  }

  /** Las gestiones del paso que el usuario modificó en esta pantalla. */
  private gestionesModificadas(paso: any) {
    return (paso?.involucrados ?? []).filter((g: any) => {
      const f = this.formsGestion[g.id_paso_involucrado];
      return f && JSON.stringify(f) !== this.gestionesOriginales[g.id_paso_involucrado];
    });
  }

  /** Rojo: el paso pide firma y esta persona todavía no la dio. */
  faltaFirma(paso: any, g: any) {
    return !!paso.requiere_acuse && g.estado !== 'no_aplica' && !g.fecha_acuse;
  }

  agregarNota() {
    if (!this.nota.trim()) return;
    this.api.agregarNotaProtocolo(this.id, this.nota.trim()).subscribe({
      next: () => {
        this.nota = '';
        this.success.set('Nota registrada en la bitácora');
        if (this.mostrarBitacora()) this.verBitacora();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar la nota'),
    });
  }

  /** Todas las acciones del motor terminan igual: mensaje, recarga, error a la vista. */
  private ejecutar(request: any, mensajeOk?: string) {
    this.error.set('');
    this.success.set('');
    this.guardando.set(true);
    request.subscribe({
      next: (r: any) => {
        this.guardando.set(false);
        this.comentario = '';
        this.success.set(
          mensajeOk ??
            (r?.cerrado
              ? 'Paso completado: el protocolo quedó cerrado'
              : r?.siguiente
                ? `Paso completado. Sigue: ${r.siguiente.nombre}`
                : (r?.message ?? 'Listo')),
        );
        this.cargar();
      },
      error: (err: any) => {
        this.guardando.set(false);
        this.error.set(err.error?.message ?? 'No se pudo completar la acción');
      },
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  icono(paso: any) {
    return (
      {
        pendiente: 'ti-circle',
        en_curso: 'ti-player-play',
        completado: 'ti-circle-check',
        omitido: 'ti-circle-minus',
        vencido: 'ti-alert-triangle',
      }[paso.estado as string] ?? 'ti-circle'
    );
  }

  rolesDe(paso: any, tipo: string) {
    return (paso.roles ?? [])
      .filter((r: any) => r.tipo_participacion === tipo)
      .map((r: any) => r.rol_nombre)
      .join(', ');
  }

  /** Las respuestas guardadas se muestran con la etiqueta del campo, no con su código. */
  respuestas(paso: any) {
    if (!paso.datos_salida) return [];
    return Object.entries(paso.datos_salida).map(([codigo, valor]) => {
      const campo = (paso.campos ?? []).find((c: any) => c.codigo === codigo);
      // Solo se traduce lo que salió de una lista cerrada. Un campo de texto
      // libre se muestra tal cual lo escribieron: humanizarlo le sacaría los
      // guiones bajos y le cambiaría la mayúscula a lo que dijo la persona.
      const esCodigo = campo?.tipo_campo === 'seleccion' || campo?.tipo_campo === 'booleano';
      return {
        etiqueta: campo?.etiqueta ?? codigo,
        valor: esCodigo ? etiquetaDe(String(valor), 'opcion_campo') : valor,
      };
    });
  }

  opciones(campo: any): string[] {
    const o = campo.opciones;
    if (Array.isArray(o)) return o;
    if (typeof o === 'string') {
      try {
        const parsed = JSON.parse(o);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  volver() {
    this.router.navigate(['/protocolos-activados']);
  }

  abrirExportar() {
    this.error.set('');
    this.exportarRedactado = false;
    this.mostrarExportar.set(true);
  }

  cerrarExportar() {
    this.mostrarExportar.set(false);
  }

  /**
   * Trae el expediente y lo manda a imprimir o a descargar. Se pide al momento
   * de exportar y no al abrir la pantalla: es una consulta pesada y además
   * queda anotada en la bitácora, así que pedirla sin que nadie la haya
   * exportado ensuciaría el rastro con exportaciones que no ocurrieron.
   */
  private exportar(accion: 'imprimir' | 'descargar') {
    this.exportando.set(true);
    this.api.getExpediente(this.id, this.exportarRedactado).subscribe({
      next: (e) => {
        this.exportando.set(false);
        this.cerrarExportar();
        if (accion === 'imprimir') this.expedienteService.imprimir(e);
        else this.expedienteService.descargar(e);
      },
      error: (err) => {
        this.exportando.set(false);
        this.error.set(err.error?.message ?? 'No se pudo generar el expediente');
      },
    });
  }

  imprimirExpediente() {
    this.exportar('imprimir');
  }

  descargarExpediente() {
    this.exportar('descargar');
  }
}
