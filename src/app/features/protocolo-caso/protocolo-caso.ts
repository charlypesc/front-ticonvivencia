import { Component, OnInit, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hoyIso, ahoraIso, formatearFecha } from '../../shared/utils/fecha';
import { FechaPipe, FechasEnTextoPipe } from '../../shared/pipes/fecha.pipe';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { Permiso } from '../../core/constants/permisos';
import { esPasoDeAprobacion, PasoQueOrdenaMedida } from '../../core/constants/pasos';
import { Puede } from '../../shared/directives/permiso.directive';
import {
  GrafoProtocolo,
  NodoGrafo,
  AristaGrafo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';
import { MedidasProteccion } from '../../shared/components/medidas-proteccion/medidas-proteccion';
import { MedidasDisciplinarias } from '../../shared/components/medidas-disciplinarias/medidas-disciplinarias';
import { descargarPdf, imprimirPdf, mensajeDeErrorPdf, nombreDelPdf } from '../../shared/utils/pdf-salida';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';
import { Buscador } from '../../shared/components/buscador/buscador';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';
import { ordenarPorCoincidencia } from '../../shared/utils/coincidencia';

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
    FechaPipe, FechasEnTextoPipe, CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe,
    MedidasProteccion, MedidasDisciplinarias, CerrarConEsc, GuardarConCmdEnter, Buscador, CursoNombrePipe,
  ],
  templateUrl: './protocolo-caso.html',
  styleUrl: './protocolo-caso.scss',
})
export class ProtocoloCaso implements OnInit {
  protected readonly Permiso = Permiso;
  /** Un paso de aprobación se aprueba o se rechaza; el resto se completa. */
  protected readonly esPasoDeAprobacion = esPasoDeAprobacion;

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
      por_involucrado_rol: p.por_involucrado_rol,
      requiere_notificacion: p.requiere_notificacion,
      accion_al_vencer: p.accion_al_vencer,
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
    // Mismo criterio que en el editor del flujo: el valor es un código de
    // `opcion_campo` (`tipo_objeto=arma_de_fuego`), no solo un sí/no.
    return `${campo} = ${etiquetaDe(v, 'opcion_campo')}`;
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

  /** @param irAlPaso lleva la vista al paso en curso una vez repintado (tras
   *  completar/aprobar/omitir el anterior, para no dejar al usuario arriba). */
  cargar(irAlPaso = false) {
    this.loading.set(true);
    this.api.getProtocoloActivado(this.id).subscribe({
      next: (data) => {
        this.caso.set(data);
        this.prepararFormulario();
        this.prepararGestiones();
        this.loading.set(false);
        if (irAlPaso) this.irAlPasoActual();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo cargar el protocolo');
        this.loading.set(false);
      },
    });
  }

  /** Deja a la vista la tarjeta del paso en curso. El `setTimeout` espera a que
   *  Angular repinte con el caso recién cargado; si el protocolo quedó cerrado
   *  no hay tarjeta y no pasa nada. */
  private irAlPasoActual() {
    setTimeout(() => {
      document
        .getElementById('paso-actual')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** Precarga lo ya respondido: un paso reabierto conserva lo que se llenó antes. */
  private prepararFormulario() {
    const paso = this.pasoActual();
    this.datos = {};
    this.aprobado = null;
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
      (rolTitular
        ? `Este paso está asignado a: ${rolTitular}.\n\n` +
          `Puedes ${accion} igual, pero quedará firmado a tu nombre en el expediente, ` +
          `indicando que actuaste en su lugar.`
        : // Un paso guardado sin ningún rol responsable. Se puede avanzar igual
          // —si no, el caso queda trabado— pero conviene arreglar el protocolo,
          // porque el paso no le aparece en la bandeja a nadie.
          `Este paso no tiene ningún rol responsable asignado.\n\n` +
          `Puedes ${accion} igual y quedará firmado a tu nombre, pero conviene ` +
          `corregir el protocolo: así como está, no le aparece a nadie por hacer.`),
    );
  }

  async completar() {
    const paso = this.pasoActual();
    if (!paso) return;
    if (!this.actasListas(paso)) return;
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
    // Sólo al aprobar: un rechazo devuelve el paso, y para eso no hace falta
    // que las actas estén.
    if (decision && !this.actasListas(paso)) return;
    if (!(await this.confirmarSiEsAjeno(paso, paso.puede_aprobar, paso.rol_aprobador_nombre, accion)))
      return;

    // El comentario se pide en el modal, junto con la decisión: es su
    // fundamento, no un dato del paso. Al rechazar es obligatorio — un rechazo
    // sin motivo deja al siguiente sin saber qué corregir. También lo es al
    // aprobar en lugar del rol titular (el director, típicamente): el
    // expediente tiene que decir por qué la firmó otro.
    const ajeno = paso.puede_aprobar === 'en_lugar_de';
    const titular = paso.rol_aprobador_nombre || 'otro rol';
    const comentario = await this.confirmService.pedirTexto(
      decision
        ? `¿Aprobar el paso "${paso.nombre}"? El caso avanza al paso siguiente.`
        : `¿Rechazar el paso "${paso.nombre}"? Queda registrado en la bitácora con tu nombre.`,
      {
        etiqueta: decision
          ? ajeno
            ? `Motivo de aprobar en lugar de ${titular}`
            : 'Comentario de la aprobación'
          : 'Motivo del rechazo',
        placeholder: decision
          ? ajeno
            ? `Qué se revisó y por qué apruebas tú y no ${titular}`
            : 'Qué se revisó, si corresponde'
          : 'Qué falta o qué hay que corregir',
        obligatorio: !decision || ajeno,
      },
    );
    if (comentario === null) return;

    if (!(await this.guardarGestionesDelPaso(paso))) return;
    this.ejecutar(
      this.api.aprobarPaso(this.id, paso.id_activado_paso, {
        aprobado: decision,
        comentario,
        datos_salida: this.datosLimpios(),
      }),
    );
  }

  async omitir() {
    const paso = this.pasoActual();
    if (!paso) return;
    // El aviso de paso ajeno se suma al mismo mensaje en vez de encadenar dos
    // modales seguidos.
    const ajeno = paso.puede_ejecutar === 'en_lugar_de'
      ? `\n\nOjo: este paso está asignado a ${paso.rol_ejecutor_nombre || 'otro rol'}. ` +
        'Quedará anotado que lo omitiste en su lugar.'
      : '';
    // El motivo es obligatorio también en el backend; pedirlo en el modal evita
    // el viaje y deja claro que omitir un paso deja rastro.
    const motivo = await this.confirmService.pedirTexto(
      `¿Omitir el paso "${paso.nombre}"? Queda registrado en la bitácora con tu nombre.${ajeno}`,
      {
        etiqueta: 'Motivo de la omisión',
        placeholder: 'Por qué este paso no corresponde en este caso',
        obligatorio: true,
      },
    );
    if (motivo === null) return;
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
    const sinNotificar = this.notificacionesPendientes();
    const sinMedida = this.medidasPendientes();
    const sinResultado = this.medidasSinResultado();
    const vencidasSinCerrar = this.medidasVencidasSinCerrar();
    // Un cierre limpio no necesita explicación; uno anticipado sí. Una
    // notificación sin constancia no detiene el protocolo mientras corre, pero
    // el cierre es la última oportunidad de dejar dicho por qué se cerró sin
    // ella, así que también vuelve obligatorio el motivo. Mismo mecanismo para
    // las medidas disciplinarias: espeja exactamente lo que valida `cerrar()`
    // en el backend, para que el motivo sea obligatorio desde el primer
    // intento y no recién después de un 400.
    const faltantes = [
      pendientes > 0 ? `${pendientes} paso(s) sin completar` : '',
      sinNotificar > 0 ? `${sinNotificar} notificación(es) pendiente(s)` : '',
      sinMedida > 0 ? `${sinMedida} paso(s) sin medida registrada` : '',
      sinResultado > 0 ? `${sinResultado} medida(s) sin resultado` : '',
      vencidasSinCerrar > 0 ? `${vencidasSinCerrar} medida(s) vencida(s) sin cerrar` : '',
    ].filter(Boolean);
    const motivo = await this.confirmService.pedirTexto(
      faltantes.length
        ? `¿Cerrar el protocolo con ${faltantes.join(' y ')}?`
        : '¿Cerrar el protocolo?',
      {
        etiqueta: faltantes.length ? 'Motivo del cierre anticipado' : 'Comentario del cierre',
        placeholder: faltantes.length
          ? 'Por qué se cierra sin completar lo que falta'
          : 'Cómo terminó el caso, si corresponde',
        obligatorio: faltantes.length > 0,
      },
    );
    if (motivo === null) return;
    this.ejecutar(this.api.cerrarProtocoloActivado(this.id, motivo), 'Protocolo cerrado');
  }

  async anular() {
    const motivo = await this.confirmService.pedirTexto(
      '¿Anular este protocolo? El caso deja de avanzar, pero la bitácora se conserva.',
      {
        etiqueta: 'Motivo de la anulación',
        placeholder: 'Por qué este protocolo no debió activarse',
        obligatorio: true,
      },
    );
    if (motivo === null) return;
    this.ejecutar(this.api.anularProtocoloActivado(this.id, motivo), 'Protocolo anulado');
  }

  /**
   * Acceso al informe previo de expulsión desde la cabecera del caso.
   *
   * Apagado a propósito: el botón salía en TODOS los casos, y la enorme mayoría
   * no termina ni cerca de una expulsión — ofrecerlo siempre lo hace parecer un
   * paso más del protocolo. Se vuelve a encender cuando el sistema sepa a qué
   * caso le corresponde de verdad (el trámite previo del art. 6 d) del DFL
   * 2/1998, VACÍO 2 del plan de adecuación), y entonces esto pasa a ser una
   * condición sobre el caso en vez de una constante.
   *
   * La ruta y la pantalla siguen montadas: se llega por URL directa.
   */
  readonly mostrarInformeExpulsion = false;

  // ── Involucrados ─────────────────────────────────────────────────────────
  //
  // Un caso se instruye contra alguien y a favor de alguien. Los pasos que
  // alcanzan a varias personas (notificar, aplicar una medida, derivar) traen
  // una fila por cada una: el paso avanza igual, pero acá se ve a quién ya se
  // le cumplió y a quién falta.

  readonly ROLES_INVOLUCRADO = ['afectado', 'senalado', 'testigo', 'denunciante'];
  readonly MEDIOS_NOTIFICACION = ['presencial', 'correo', 'telefono', 'plataforma', 'carta'];

  involucrados = computed<any[]>(() => this.caso()?.involucrados ?? []);

  /**
   * A quién se le puede aplicar una medida o una cautelar dentro de este caso.
   *
   * Los bloques de medidas esperaban `caso().estudiantes`, que el detalle del
   * caso nunca devolvió: lo que devuelve son `involucrados`. El desplegable de
   * estudiante quedaba con la sola opción "No aplica" y toda medida se
   * guardaba sin persona, que es justo el dato que después el informe previo de
   * expulsión necesita.
   *
   * Solo los involucrados estudiante: a un funcionario o a un externo no se le
   * aplica una medida disciplinaria del reglamento interno. Se deduplica porque
   * el mismo estudiante puede figurar dos veces con roles distintos (la
   * agresión mutua) y no tiene sentido ofrecerlo dos veces en la lista.
   */
  estudiantesDelCaso = computed<any[]>(() => {
    const vistos = new Map<number, any>();
    for (const i of this.involucrados())
      if (i.id_estudiante && !vistos.has(i.id_estudiante))
        // `apellido` va vacío porque el involucrado guarda el nombre completo
        // en un solo campo; los desplegables pintan "nombre apellido".
        vistos.set(i.id_estudiante, { id_estudiante: i.id_estudiante, nombre: i.nombre, apellido: '' });
    return [...vistos.values()];
  });

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
  notificacionesPendientes = computed(() =>
    (this.caso()?.pasos ?? []).reduce((n: number, p: any) => n + (p.notificaciones_pendientes ?? 0), 0),
  );

  /** Pasos que ordenan una medida y todavía no la tienen registrada — de
   *  cualquiera de las tres clases: el paso de resguardo se cumple con una
   *  medida de protección o una cautelar, el de resolución con una disciplinaria. */
  medidasPendientes = computed(() =>
    (this.caso()?.pasos ?? []).filter((p: any) => p.medida_pendiente).length,
  );

  /** Los pasos que ordenan una medida, para que el formulario de la medida
   *  pueda decir de cuál salió. Los pendientes primero: es el que se va a
   *  elegir casi siempre. */
  pasosConMedida = computed(() =>
    (this.caso()?.pasos ?? [])
      .filter((p: any) => p.requiere_medida && !p.descartado)
      .map((p: any): PasoQueOrdenaMedida => ({
        id_activado_paso: p.id_activado_paso,
        nombre: p.nombre,
        pendiente: !!p.medida_pendiente,
        // Qué clase de medida lo cumple: cada tarjeta ofrece solo los pasos que
        // ella puede cumplir, para que nadie ate una medida de protección al
        // paso que espera la sanción.
        tipo: p.tipo_medida_requerida ?? null,
      }))
      .sort((a: PasoQueOrdenaMedida, b: PasoQueOrdenaMedida) =>
        Number(b.pendiente) - Number(a.pendiente)),
  );

  // Las tarjetas de medidas, para poder abrirles el formulario desde el aviso
  // del paso. Es lo que convierte "cargala más abajo" en un botón: el paso sabe
  // qué medida espera, así que la pantalla puede abrir la correcta con el paso
  // ya elegido en vez de dejar al usuario buscando.
  @ViewChild(MedidasProteccion) tarjetaProteccion?: MedidasProteccion;
  @ViewChild(MedidasDisciplinarias) tarjetaDisciplinarias?: MedidasDisciplinarias;

  /**
   * Abre el formulario que corresponde al paso, con el paso ya puesto.
   *
   * Cada clase tiene el suyo y no hay elección que hacer: el paso ya dice qué
   * medida espera. El paso sin clase declarada abre el de protección, que es la
   * medida ordinaria y la única que se puede adoptar desde que se toma
   * conocimiento de los hechos; las otras dos quedan a un clic en su tarjeta.
   *
   * Los @ViewChild no existen hasta que la tarjeta está en pantalla, y las dos
   * viven dentro de un @if: sin la guarda, un caso recién abierto rompía el
   * botón.
   */
  registrarMedidaDe(paso: any) {
    const clase = paso?.tipo_medida_requerida;
    if (clase === 'disciplinaria') this.tarjetaDisciplinarias?.abrirParaPaso(paso.id_activado_paso);
    else if (clase === 'cautelar')
      this.tarjetaDisciplinarias?.abrirCautelarParaPaso(paso.id_activado_paso);
    else this.tarjetaProteccion?.abrirParaPaso(paso.id_activado_paso);
  }
  /** El mismo par que valida `cerrar()` en el backend: resultado sin registrar
   *  (lo que el informe de expulsión exige) y suspensiones vencidas sin cerrar
   *  (la infracción real del art. 16 E letra j / Circular 482). */
  medidasSinResultado = computed(() => this.caso()?.medidas_sin_resultado ?? 0);
  medidasVencidasSinCerrar = computed(() => this.caso()?.medidas_vencidas_sin_cerrar ?? 0);

  mostrarInvolucrados = signal(false);
  /** Opción "no está en la lista" del selector de funcionario: no es un id real,
   *  solo destraba los campos de nombre y RUT escritos a mano. */
  readonly SIN_CUENTA = '__sin_cuenta__';
  formInvolucrado: any = { tipo_persona: 'estudiante', id_estudiante: null, id_usuario: null, nombre: '', rut: '', rol: 'afectado' };
  estudiantes = signal<any[]>([]);

  /**
   * Búsqueda del estudiante a incorporar. Antes era un <select> con la matrícula
   * completa: con cientos de alumnos, encontrar a uno exigía scrollear una lista
   * ordenada por id. El desplegable, el teclado y el cierre por blur los resuelve
   * <app-buscador>; acá solo queda el texto y el criterio de filtrado.
   */
  busquedaEstudiante = signal('');
  /** El elegido, para poder mostrarlo confirmado antes de incorporarlo. */
  estudianteElegido = signal<any | null>(null);

  sugerenciasEstudiante() {
    const q = this.busquedaEstudiante().toLowerCase().trim();
    if (q.length < 2) return [];

    // Mismo criterio que Estudiantes y que el modal de registros: cada palabra
    // escrita se busca por separado, sin importar el orden ni qué haya en el
    // medio ("paredes rodrigo" encuentra a "Rodrigo Daniel Paredes"), y después
    // se ordena por parecido para que Enter caiga sobre la mejor.
    const tokens = q.split(/\s+/);
    const coincidencias = this.estudiantes().filter((e) => {
      const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
      return tokens.every((t) => nombreCompleto.includes(t)) || e.run?.includes(q);
    });

    // A quien ya está en el caso se le avisa, pero no se le esconde: el mismo
    // estudiante puede figurar dos veces con roles distintos, que es lo que pasa
    // en una agresión mutua (es afectado y señalado a la vez). El backend lo
    // permite; filtrarlo acá sería quitar una situación real, no evitar un error.
    const rolesPrevios = new Map<number, string[]>();
    for (const i of this.involucrados()) {
      if (!i.id_estudiante) continue;
      rolesPrevios.set(i.id_estudiante, [...(rolesPrevios.get(i.id_estudiante) ?? []), i.rol]);
    }

    return ordenarPorCoincidencia(coincidencias, q, (e) => `${e.nombre} ${e.apellido}`)
      .slice(0, 8)
      .map((e) => ({ ...e, roles_en_el_caso: rolesPrevios.get(e.id_estudiante) ?? [] }));
  }

  elegirEstudiante(e: any) {
    this.estudianteElegido.set(e);
    this.formInvolucrado.id_estudiante = e.id_estudiante;
    this.busquedaEstudiante.set('');
  }

  limpiarEstudianteElegido() {
    this.estudianteElegido.set(null);
    this.formInvolucrado.id_estudiante = null;
  }

  abrirInvolucrados() {
    this.error.set('');
    this.formInvolucrado = { tipo_persona: 'estudiante', id_estudiante: null, id_usuario: null, nombre: '', rut: '', rol: 'afectado' };
    this.busquedaEstudiante.set('');
    this.estudianteElegido.set(null);
    this.mostrarInvolucrados.set(true);
    // Se pide recién acá: es una lista larga que la pantalla no necesita para
    // mostrar el caso.
    if (this.estudiantes().length === 0)
      this.api.getEstudiantes().subscribe({ next: (d: any) => this.estudiantes.set(d), error: () => {} });
  }

  agregarInvolucrado() {
    const f = this.formInvolucrado;
    const funcionarioSinCuenta = f.tipo_persona === 'funcionario' && f.id_usuario === this.SIN_CUENTA;
    if (f.tipo_persona === 'estudiante' && !f.id_estudiante) return this.error.set('Elige al estudiante');
    if (f.tipo_persona === 'funcionario' && !f.id_usuario) return this.error.set('Elige al funcionario');
    if (funcionarioSinCuenta && !f.nombre.trim())
      return this.error.set('Escribe el nombre del funcionario');
    if (f.tipo_persona === 'externo' && !f.nombre.trim()) return this.error.set('Escribe el nombre de la persona');
    this.error.set('');
    // El centinela del <select> no viaja al backend: un funcionario escrito a
    // mano va con id_usuario nulo y su nombre/rut.
    const datos = funcionarioSinCuenta ? { ...f, id_usuario: null } : f;
    this.api.agregarInvolucrado(this.id, datos).subscribe({
      next: () => {
        this.success.set('Involucrado incorporado al caso');
        this.formInvolucrado = { ...f, id_estudiante: null, id_usuario: null, nombre: '', rut: '' };
        // Sin esto el nombre del recién incorporado sigue en el campo y el
        // siguiente clic en "Incorporar" lo agregaría de nuevo.
        this.estudianteElegido.set(null);
        this.busquedaEstudiante.set('');
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
   * Estado y notificación viajan juntos en un solo control: preguntar "¿se
   * cumplió?" y aparte "¿se le notificó?" era la misma pregunta dos veces,
   * porque no hay notificación sin gestión cumplida. 'cumplido_notificado'
   * existe solo en la UI; al backend siguen yendo `estado` y la notificación
   * por separado.
   */
  private estadoUi(g: any) {
    if (g.fecha_notificacion) return 'cumplido_notificado';
    return g.estado ?? 'pendiente';
  }

  /**
   * Reconstruye los formularios con lo que llega del servidor, salvo en la
   * gestión que el usuario ya venía llenando sin guardar: subir el acta
   * firmada de una persona, o completar/aprobar el paso, recarga todo el caso
   * y esto se ejecuta de nuevo. Si se pisara sin mirar, lo escrito en las
   * demás tarjetas (que no viajó al backend) se perdía sin aviso.
   */
  private prepararGestiones() {
    const hoy = hoyIso();
    const forms: Record<number, any> = {};
    const originales: Record<number, string> = {};
    for (const paso of this.caso()?.pasos ?? [])
      for (const g of paso.involucrados ?? []) {
        const id = g.id_paso_involucrado;
        const fresh = {
          estado_ui: this.estadoUi(g),
          // La fecha real del hecho, no la de digitación: la entrevista fue el
          // martes y se registra el jueves. Puede venir como datetime ISO, y en
          // un <input type="date"> cualquier cosa que no sea YYYY-MM-DD queda
          // en blanco.
          fecha_gestion: g.fecha_gestion ? String(g.fecha_gestion).slice(0, 10) : hoy,
          observacion: g.observacion ?? '',
          medio_notificacion: g.medio_notificacion ?? 'presencial',
        };
        const previo = this.formsGestion[id];
        const sinTocar = !previo || this.gestionesOriginales[id] === JSON.stringify(previo);
        forms[id] = sinTocar ? fresh : previo;
        originales[id] = JSON.stringify(fresh);
      }
    this.formsGestion = forms;
    this.gestionesOriginales = originales;
  }

  /**
   * Registra la gestión de una persona. Devuelve una promesa y no recarga por
   * su cuenta: se dispara desde 'Completar paso', que guarda todas juntas y
   * recarga una sola vez al final. No hay botón propio por persona — el paso se
   * cumple de una vez, y un guardado aparte invitaba a completar el paso
   * creyendo que la notificación ya estaba registrada cuando no lo estaba.
   */
  private guardarGestion(g: any) {
    const f = this.formsGestion[g.id_paso_involucrado];
    const notifico = f.estado_ui === 'cumplido_notificado';
    const data: any = {
      estado: notifico ? 'cumplido' : f.estado_ui,
      fecha_gestion: f.fecha_gestion || null,
      observacion: f.observacion?.trim() || null,
    };
    if (notifico) {
      // La fecha de la notificación se sella una sola vez: si ya la tenía, no
      // se pisa. La vía sí viaja siempre, para poder corregir un "presencial"
      // que en realidad fue por teléfono sin deshacer la notificación.
      if (!g.fecha_notificacion)
        data.fecha_notificacion = ahoraIso().replace('T', ' ') + ':00';
      data.medio_notificacion = f.medio_notificacion;
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

  /** Rojo: el paso exige notificar y de esta persona no consta que se hiciera. */
  faltaNotificacion(paso: any, g: any) {
    return !!paso.requiere_notificacion && g.estado !== 'no_aplica' && !g.fecha_notificacion;
  }

  /** Qué gestión se está guardando desde la línea de tiempo, para bloquear su botón. */
  notificando = signal<number | null>(null);

  // ── Acta de notificación ─────────────────────────────────────────────────
  //
  // La fecha y la vía prueban lo que el establecimiento dice haber hecho. Lo
  // que la persona reconoce haber recibido se prueba con su firma, y para eso
  // hace falta un papel: el acta se imprime, se firma y vuelve escaneada.

  /** Gestión cuya acta se está por imprimir: `{ paso, gestion }`. */
  actaAbierta = signal<{ paso: any; gestion: any } | null>(null);
  /** Qué gestión está subiendo su acta, para bloquear su botón. */
  subiendoActa = signal<number | null>(null);
  /**
   * Medidas disciplinarias del registro. Solo para avisar en el modal si esta
   * persona todavía no tiene ninguna: el acta la arma el backend con las suyas.
   */
  private medidas = signal<any[]>([]);
  /** Se está generando el acta en el backend: bloquea los botones del modal. */
  generandoActa = signal(false);

  /**
   * Qué resolvió el caso: 'formativa' | 'disciplinaria' | 'ambas', o null si el
   * protocolo no llegó a resolver (o no tiene ese campo).
   *
   * Sale del paso de resolución ya completado, no de las medidas cargadas: la
   * resolución es el acto que decide, y las medidas pueden registrarse después.
   * Se recorre al revés porque lo que vale es la última resolución (una
   * apelación acogida vuelve a pasar por ahí).
   */
  tipoMedidaResuelto = computed<string | null>(() => {
    for (const p of [...(this.caso()?.pasos ?? [])].reverse())
      if (p.datos_salida?.tipo_medida) return p.datos_salida.tipo_medida;
    return null;
  });

  /**
   * Si corresponde acta firmada en este paso.
   *
   * Una medida formativa (diálogo, servicio comunitario, acompañamiento) no
   * abre plazo de reconsideración ni requiere firma: basta la constancia de que
   * se avisó. Pedir un acta firmada ahí es papeleo inventado. Cuando no se sabe
   * qué se resolvió, se ofrece igual: es peor quedarse sin la prueba.
   */
  requiereActa(paso: any) {
    return !!paso.requiere_notificacion && this.tipoMedidaResuelto() !== 'formativa';
  }

  /**
   * La vía por la que se notificó a esta persona: la ya registrada, o la que se
   * está eligiendo en un formulario todavía sin guardar.
   *
   * Hay dos formularios con vía: el de la gestión, cuando el paso está en
   * curso, y el de la notificación rezagada, cuando la persona ya figura como
   * cumplida pero falta la constancia. En ese segundo caso antes no se tomaba
   * en cuenta la vía elegida: al elegir "Carta", el acta para imprimir y el
   * botón para subirla firmada no aparecían hasta registrar la notificación, y
   * la carta hay que imprimirla antes de entregarla.
   */
  medioDe(g: any): string | null {
    if (g?.medio_notificacion) return g.medio_notificacion;
    const f = this.formsGestion[g?.id_paso_involucrado];
    if (!f) return null;
    if (f.estado_ui === 'cumplido_notificado') return f.medio_notificacion ?? null;
    const rezagada = g.estado === 'cumplido' && !g.fecha_notificacion;
    return rezagada ? f.medio_notificacion ?? null : null;
  }

  /**
   * El acta firmada se exige de una persona sólo cuando su notificación se hizo
   * por carta. Notificada en persona, por correo, teléfono o plataforma, la
   * constancia de fecha y vía basta como prueba: pedir además una carta firmada
   * es papeleo inventado y no puede trabar completar o aprobar el paso.
   */
  requiereActaGestion(paso: any, g: any) {
    return this.requiereActa(paso) && this.medioDe(g) === 'carta';
  }

  /**
   * Días hábiles que se imprimen en el acta. Editable porque el plazo de las
   * medidas que no son expulsión lo fija el reglamento interno de cada
   * establecimiento, y el sistema todavía no lo guarda.
   */
  actaPlazoDias = 5;

  abrirActa(paso: any, g: any) {
    this.error.set('');
    this.avisoActa.set('');
    this.actaAbierta.set({ paso, gestion: g });
    // Se recargan cada vez: entre una impresión y otra pudo agregarse la medida
    // que justamente hay que notificar, o haberse emitido el informe de
    // expulsión que cambia el plazo legal.
    const idRegistro = this.caso()?.id_registro;
    if (idRegistro)
      this.api.getMedidasDisciplinarias(idRegistro).subscribe({
        next: (m) => this.medidas.set(m ?? []),
        error: () => this.medidas.set([]),
      });
    // Si el caso tiene informe de expulsión o cancelación de matrícula, el
    // plazo lo fija la ley (15 días hábiles, art. 6 letra d) del DFL 2); si
    // no, se precarga en 5 y el usuario lo ajusta a su reglamento interno. Se
    // consulta a la fuente: el ENUM de MEDIDA_DISCIPLINARIA excluye a
    // propósito la expulsión, así que no se puede deducir de las medidas.
    this.api.getInformeExpulsion(this.id).subscribe({
      next: () => (this.actaPlazoDias = 15),
      // 404 es la respuesta normal cuando el caso no tiene informe.
      error: () => (this.actaPlazoDias = 5),
    });
  }

  cerrarActa() {
    this.actaAbierta.set(null);
    this.avisoActa.set('');
  }

  /** Las medidas que le corresponden a esta persona (mismo criterio que usa el
   *  backend para escribirlas en el acta). Por id cuando la medida lo trae; si
   *  no, por nombre. */
  private medidasDe(g: any) {
    const nombre = (g.involucrado_nombre ?? '').trim().toLowerCase();
    return this.medidas().filter((m: any) =>
      m.id_involucrado
        ? m.id_involucrado === g.id_involucrado
        : `${m.estudiante_nombre ?? ''} ${m.estudiante_apellido ?? ''}`.trim().toLowerCase() === nombre,
    );
  }

  /**
   * Aviso dentro del modal del acta. No bloquea la emisión: un acta sin medidas
   * cargadas sale con esos renglones en blanco y se completan a mano antes de
   * firmar — que es lo que hace `ActaNotificacionService` a propósito. Antes se
   * cortaba acá la impresión/descarga y, como el modal no mostraba el error, el
   * botón "no hacía nada".
   */
  avisoActa = signal('');

  private revisarMedidasActa() {
    const abierta = this.actaAbierta();
    const sinMedidas = !abierta || this.medidasDe(abierta.gestion).length === 0;
    this.avisoActa.set(
      sinMedidas
        ? 'Todavía no hay medidas registradas para esta persona: el acta sale con esos renglones ' +
            'en blanco para completarlos a mano antes de firmar.'
        : '',
    );
  }

  imprimirActa() {
    this.emitirActa('imprimir');
  }

  descargarActa() {
    this.emitirActa('descargar');
  }

  /** El acta la arma el backend; acá solo se le da salida. */
  private emitirActa(accion: 'imprimir' | 'descargar') {
    const abierta = this.actaAbierta();
    if (!abierta || this.generandoActa()) return;
    this.error.set('');
    this.revisarMedidasActa();
    this.generandoActa.set(true);
    this.api
      .getActaNotificacionPdf(this.id, abierta.gestion.id_paso_involucrado, this.actaPlazoDias)
      .subscribe({
        next: (resp) => {
          const pdf = resp.body!;
          if (accion === 'imprimir') imprimirPdf(pdf);
          else descargarPdf(pdf, nombreDelPdf(resp, 'Notificacion.pdf'));
          this.generandoActa.set(false);
        },
        error: async (err) => {
          this.error.set(await mensajeDeErrorPdf(err, 'No se pudo generar el acta'));
          this.generandoActa.set(false);
        },
      });
  }

  /**
   * El paso no se cierra mientras falte un acta.
   *
   * La notificación se prueba con la firma: dar el paso por cumplido antes de
   * tener el papel deja el caso avanzando con una constancia que todavía no
   * existe, y esa es justamente la que se pide después. Devuelve false y deja
   * el motivo a la vista.
   */
  private actasListas(paso: any) {
    if (this.subiendoActa() !== null) {
      this.error.set('Espera a que termine de subirse el acta firmada.');
      return false;
    }
    if (!this.requiereActa(paso)) return true;

    // Sólo traba a quien se notificó por carta: en las demás vías la constancia
    // de fecha y vía basta y exigir el acta firmada sería inventar un requisito.
    const faltan = (paso.involucrados ?? []).filter(
      (g: any) => g.estado !== 'no_aplica' && this.medioDe(g) === 'carta' && !g.tiene_acta_firmada,
    );
    if (faltan.length === 0) return true;

    this.error.set(
      `Falta subir la carta firmada de ${faltan.map((g: any) => g.involucrado_nombre).join(', ')}. ` +
        'Imprímela, hazla firmar y súbela antes de dar el paso por cumplido.',
    );
    return false;
  }

  /**
   * Sube el acta firmada. Entra cualquier formato y a cualquier peso: la
   * compresión la hace el backend (comprimirArchivo), que sabe achicar tanto la
   * foto como el PDF y no obliga a cargar una librería más en el navegador.
   *
   * Una traba por gestión evita que el doble disparo del input con `capture` en
   * Android suba el mismo archivo dos veces, y el value se limpia apenas se
   * toma el archivo para poder volver a elegir el mismo.
   */
  subirActaFirmada(g: any, evento: Event) {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.subiendoActa() === g.id_paso_involucrado) return;

    this.subiendoActa.set(g.id_paso_involucrado);
    this.error.set('');

    const fd = new FormData();
    fd.append('archivo', file);
    this.api.subirActaFirmada(this.id, g.id_paso_involucrado, fd).subscribe({
      next: () => {
        this.subiendoActa.set(null);
        this.success.set(`Acta firmada de ${g.involucrado_nombre} adjuntada`);
        this.cargar();
      },
      error: (err) => {
        this.subiendoActa.set(null);
        this.error.set(err.error?.message ?? 'No se pudo adjuntar el acta firmada');
      },
    });
  }

  /** Abre el acta firmada en una pestaña. Va por blob: el token va en la cabecera. */
  verActaFirmada(g: any) {
    this.api.getActaFirmada(this.id, g.id_paso_involucrado).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.error.set('No se pudo abrir el acta firmada'),
    });
  }

  /**
   * Deja la constancia de una notificación que se hizo pero nunca se registró,
   * en un paso que ya está completado.
   *
   * Va aparte de `guardarGestion` porque la fecha es distinta: ahí la
   * notificación se sella con la hora de ahora, porque se está registrando en el
   * momento; acá el hecho ocurrió antes y lo que vale es la fecha que indica el
   * usuario. Guarda sola y recarga: no hay un "Completar paso" que la arrastre.
   */
  async registrarNotificacionTardia(paso: any, g: any) {
    const f = this.formsGestion[g.id_paso_involucrado];
    if (!f?.medio_notificacion || !f?.fecha_gestion) {
      this.error.set('Indique la fecha y la vía por la que se notificó.');
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      `¿Dejar constancia de que a ${g.involucrado_nombre} se le notificó el ` +
        `${formatearFecha(f.fecha_gestion)} por ${etiquetaDe(f.medio_notificacion, 'medio_notificacion')}? ` +
        `Queda en la bitácora a tu nombre y la fecha de notificación no se puede deshacer.`,
    );
    if (!ok) return;

    this.error.set('');
    this.notificando.set(g.id_paso_involucrado);
    try {
      await firstValueFrom(
        this.api.registrarGestion(this.id, g.id_paso_involucrado, {
          // El paso ya está cumplido para el caso, pero esta persona podía haber
          // quedado 'pendiente': registrar la notificación la da por cumplida.
          estado: 'cumplido',
          fecha_gestion: f.fecha_gestion,
          observacion: f.observacion?.trim() || null,
          // La hora no se pide: con una fecha pasada no la recuerda nadie, y lo
          // que se acredita es el día.
          fecha_notificacion:
            f.fecha_gestion === hoyIso()
              ? ahoraIso().replace('T', ' ') + ':00'
              : `${f.fecha_gestion} 12:00:00`,
          medio_notificacion: f.medio_notificacion,
        }),
      );
      this.success.set(`Notificación de ${g.involucrado_nombre} registrada`);
      this.cargar();
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'No se pudo registrar la notificación');
    } finally {
      this.notificando.set(null);
    }
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
        this.success.set(
          mensajeOk ??
            (r?.cerrado
              ? 'Paso completado: el protocolo quedó cerrado'
              : r?.siguiente
                ? `Paso completado. Sigue: ${r.siguiente.nombre}`
                : (r?.message ?? 'Listo')),
        );
        this.cargar(true);
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
      const esCodigo = campo?.tipo_campo === 'seleccion';
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
   * Pide el expediente en PDF y lo manda a imprimir o a descargar. Se pide al
   * momento de exportar y no al abrir la pantalla: es una consulta pesada y
   * además queda anotada en la bitácora, así que pedirla sin que nadie la haya
   * exportado ensuciaría el rastro con exportaciones que no ocurrieron.
   *
   * El PDF lo arma el backend, con las actas firmadas ya anexadas.
   */
  private exportar(accion: 'imprimir' | 'descargar') {
    this.exportando.set(true);
    this.api.getExpedientePdf(this.id, this.exportarRedactado).subscribe({
      next: (resp) => {
        this.cerrarExportar();
        const pdf = resp.body!;
        if (accion === 'imprimir') imprimirPdf(pdf);
        else descargarPdf(pdf, nombreDelPdf(resp, `expediente-${this.id}.pdf`));
        this.exportando.set(false);
      },
      error: async (err) => {
        this.exportando.set(false);
        this.error.set(await mensajeDeErrorPdf(err, 'No se pudo generar el expediente'));
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
