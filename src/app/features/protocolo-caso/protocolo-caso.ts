import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
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
import { descargarPdf, imprimirPdf, mensajeDeErrorPdf, nombreDelPdf } from '../../shared/utils/pdf-salida';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';
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
/** Lo que se está escribiendo para una persona en la acogida de relatos. */
interface FormRelato {
  /** La elección en pantalla mientras no se guarde; null = la guardada. */
  eleccion: boolean | null;
  motivo: string;
  nuevo: string;
  /** El formulario de otro relato, abierto a pedido cuando ya hay relatos. */
  abierto: boolean;
}

@Component({
  selector: 'app-protocolo-caso',
  standalone: true,
  imports: [
    FechaPipe, FechasEnTextoPipe, CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe,
    CerrarConEsc, GuardarConCmdEnter, Buscador, CursoNombrePipe,
    AutoAjustarTextarea,
  ],
  templateUrl: './protocolo-caso.html',
  styleUrl: './protocolo-caso.scss',
})
export class ProtocoloCaso implements OnInit, OnDestroy {
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

  /**
   * Los que se muestran en el formulario del paso. En un paso de resolución
   * con tarjetas por señalado, "Tipo de medida" no se pregunta: se calcula de
   * lo resuelto en cada tarjeta (derivarTipoMedida) y viaja igual en los
   * datos del paso, porque de él depende el camino del protocolo.
   */
  camposEnPantalla() {
    const paso = this.pasoActual();
    const derivado = paso?.tipo_medida_requerida === 'disciplinaria' && paso?.involucrados?.length;
    return this.camposVisibles().filter((c: any) => !(derivado && c.codigo === 'tipo_medida'));
  }

  activo = computed(() => this.caso()?.estado === 'activo');

  /** Quien ve el recorrido completo lo ve como diagrama —es como se piensan
   *  los protocolos—, y el paso actual se trabaja desde su caja y no desde una
   *  tarjeta suelta arriba. La vista de lista se sacó: repetía lo mismo peor. */
  enDiagrama = computed(() => this.verProcesos());

  /** El formulario del paso actual, abierto desde el diagrama. */
  mostrarPasoModal = signal(false);

  abrirPasoActual() {
    const paso = this.pasoActual();
    if (!paso) return;
    this.pasoSeleccionadoId.set(paso.id_activado_paso);
    this.mostrarPasoModal.set(true);
  }

  /** Lo que pregunta un paso. `aprobado` no va: lo decide el botón de aprobar. */
  camposDe(paso: any) {
    return (paso?.campos ?? []).filter((c: any) => c.codigo !== 'aprobado');
  }

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

  /** La caja del paso actual abre su formulario; las demás, su detalle con las
   *  preguntas bloqueadas (o lo que se respondió, si ya pasó). */
  seleccionarDelGrafo(nodo: NodoGrafo) {
    if (this.activo() && nodo.id === this.pasoActual()?.id_activado_paso) {
      this.abrirPasoActual();
      return;
    }
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
      // En la acogida de relatos la caja lista a las personas: ✓ cuando ya está
      // resuelta (su relato acogido, o el motivo de por qué no).
      preguntas: p.relatos_personas
        ? p.relatos_personas.map((r: any) => ({
            etiqueta: r.se_acoge === false ? `${r.nombre} (no se acoge)` : r.nombre,
            respondida: this.personaDeRelatoLista(r),
          }))
        : p.medidas_personas
        ? p.medidas_personas.map((m: any) => ({
            etiqueta: m.sin_medida ? `${m.nombre} (sin medidas)` : m.nombre,
            respondida: this.personaMedidaLista(m),
          }))
        : this.camposDe(p).map((c: any) => {
            const v = p.datos_salida?.[c.codigo];
            return {
              etiqueta: c.etiqueta || humanizar(c.codigo),
              respondida: v !== null && v !== undefined && String(v).trim() !== '',
            };
          }),
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

  /**
   * ¿Ve el recorrido completo? Lo decide el backend (permiso
   * protocolo_activado.ver_procesos): sin él, `pasos` ya viene recortado a las
   * tarjetas que le tocan o que le asignaron, y acá solo se ajusta qué se dibuja.
   */
  verProcesos = computed(() => !!this.caso()?.ver_procesos);

  /** Total del recorrido, contado en el backend antes de recortar. */
  totalPasos = computed(() => this.caso()?.total_pasos ?? this.pasosVisibles().length);

  /** "Paso 3 de 7": el mismo número para el coordinador y para quien ve una sola tarjeta. */
  numeroDe(paso: any) {
    return paso?.numero ? `Paso ${paso.numero} de ${this.totalPasos()}` : '';
  }

  /** Las tarjetas que no son el paso en curso (ese va destacado arriba). */
  otrasTarjetas = computed(() => {
    const actual = this.pasoActual()?.id_activado_paso;
    return this.pasosVisibles().filter((p: any) => p.id_activado_paso !== actual);
  });

  /** Clase del badge según el estado del paso, la misma en barra, tarjetas y modal. */
  claseEstado(estado: string) {
    return estado === 'completado' ? 'validado'
      : estado === 'vencido' ? 'gravísima'
      : estado === 'omitido' ? 'confidencial'
      : 'pendiente';
  }

  /** Una tarjeta todavía se puede encargar a otro mientras no esté cerrada. */
  asignable(paso: any) {
    return this.activo() && !['completado', 'omitido'].includes(paso.estado) && !paso.descartado;
  }

  /** La tarjeta está asignada a quien mira: eso lo habilita a completarla y a
   *  registrar sus gestiones aunque su rol no tenga el permiso general. */
  esMio(paso: any) {
    const yo = this.auth.usuario()?.id;
    return !!yo && paso?.id_usuario_responsable === yo;
  }

  /** Paso que se está encargando en el modal de asignar (puede no ser el en curso). */
  pasoAReasignar = signal<any | null>(null);

  abrirReasignar(paso: any) {
    this.pasoAReasignar.set(paso);
    this.reasignarA = paso.id_usuario_responsable ?? null;
    this.mostrarReasignar.set(true);
  }

  abrirDetalle(paso: any) {
    // Con la tarjeta del paso actual oculta (vista de diagrama), su segmento de
    // la barra lleva al formulario: es lo único que se puede hacer con él.
    if (this.enDiagrama() && this.activo() && paso.id_activado_paso === this.pasoActual()?.id_activado_paso) {
      this.abrirPasoActual();
      return;
    }
    this.pasoSeleccionadoId.set(paso.id_activado_paso);
    this.mostrarDetalle.set(true);
  }

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private confirmService: ConfirmService,
    private auth: AuthService,
  ) {}

  ngOnDestroy() {
    this.auth.permisosDelCaso.set([]);
  }

  ngOnInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    // Al abrir un caso se va directo al paso en que está: es lo que se viene a
    // hacer, y en un protocolo largo queda varias pantallas más abajo.
    this.cargar(true);
    this.cargarPlazoActa();
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
        // Lo que este caso le habilita a quien mira (su lista de acceso), para
        // los botones de la pantalla. Se quita en ngOnDestroy.
        this.auth.permisosDelCaso.set(data?.permisos_caso ?? []);
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
      const tarjeta = document.getElementById('paso-actual');
      if (tarjeta) {
        tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // En el diagrama no hay tarjeta: se centra la caja del paso actual, en
      // vertical y también en horizontal, porque un protocolo con ramas puede
      // dejarla fuera del ancho visible del lienzo.
      document
        .querySelector('app-grafo-protocolo .nodo--actual')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
    if (!this.derivarTipoMedida(paso)) return;
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

    // En un paso de resguardo, "Cumplida" sin medida no se deja pasar: el
    // backend lo rechazaría igual, pero así el aviso dice a quién le falta
    // antes de guardar a nadie.
    for (const g of pendientes) {
      const f = this.formsGestion[g.id_paso_involucrado];
      if (!this.pideResolucion(paso, g, f)) continue;
      if (!f.md_sel) {
        this.error.set(`Indica qué se resolvió para ${g.involucrado_nombre}.`);
        return false;
      }
      if (this.TIPOS_CON_PLAZO.includes(f.md_sel) && (!f.md_dias || !f.md_fundamento?.trim())) {
        this.error.set(
          `La medida de ${g.involucrado_nombre} requiere los días hábiles y el fundamento ` +
            '(Circular 482: justificada antes de adoptarla).',
        );
        return false;
      }
    }
    for (const g of pendientes) {
      const f = this.formsGestion[g.id_paso_involucrado];
      if (!this.pideMedida(paso, g, f)) continue;
      if (!f.medida_tipo) {
        this.error.set(`Elige la medida de protección aplicada a ${g.involucrado_nombre}.`);
        return false;
      }
      if (f.medida_tipo === 'suspension' && (!f.medida_dias || !f.medida_fundamento?.trim())) {
        this.error.set(
          `La suspensión de ${g.involucrado_nombre} requiere los días hábiles (máximo ` +
            `${this.MAX_DIAS_SUSPENSION}) y el fundamento de por qué no basta otra medida.`,
        );
        return false;
      }
    }

    for (const g of pendientes) {
      const f = this.formsGestion[g.id_paso_involucrado];
      if (!this.pideCautelar(paso, g, f)) continue;
      if (!f.cau_fundamento?.trim()) {
        this.error.set(
          `La suspensión cautelar de ${g.involucrado_nombre} requiere su fundamento por escrito ` +
            '(art. 6 letra d: se notifica junto con la decisión).',
        );
        return false;
      }
      if (f.fecha_gestion > hoyIso()) {
        this.error.set(`La fecha de notificación de ${g.involucrado_nombre} no puede ser futura.`);
        return false;
      }
    }

    this.error.set('');
    this.guardando.set(true);
    try {
      for (const g of pendientes) await this.guardarGestion(g, paso);
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

    if (decision && !this.derivarTipoMedida(paso)) return;
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
    const paso = this.pasoAReasignar() ?? this.pasoActual();
    if (!paso || !this.reasignarA) return;
    this.api.reasignarPaso(this.id, paso.id_activado_paso, this.reasignarA).subscribe({
      next: () => {
        this.mostrarReasignar.set(false);
        const u = this.usuarios().find((x: any) => x.id_usuario === this.reasignarA);
        this.success.set(`${paso.nombre} quedó asignado a ${u?.nombre || u?.correo || 'el funcionario'}`);
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
  // Mismos valores que MEDIOS_NOTIFICACION en flujoProtocolo.js. 'acta' es la
  // notificación por escrito que la persona firma: al elegirla, el acta se
  // imprime desde la misma tarjeta.
  readonly MEDIOS_NOTIFICACION = ['presencial', 'videollamada', 'whatsapp', 'telefono', 'acta'];

  /** Notificación por escrito y firmada. 'carta' es el nombre antiguo (filas
   *  viejas y la suspensión cautelar, que guarda su vía en la misma columna). */
  esActa(medio: string | null | undefined) {
    return medio === 'acta' || medio === 'carta';
  }
  /** Mismo catálogo y orden que la tarjeta de medidas de protección (de menos a
   *  más gravosa): en un paso de resguardo, cada afectado elige acá la suya. */
  readonly TIPOS_MEDIDA_PROTECCION = [
    'separacion_aula', 'prohibicion_contacto', 'cambio_curso', 'cambio_jornada',
    'acompanamiento', 'derivacion_red', 'resguardo_confidencialidad',
    'reorganizacion_espacios', 'separacion_funciones', 'teletrabajo',
    'suspension', 'otra',
  ];
  readonly MAX_DIAS_SUSPENSION = 15;

  /**
   * Las medidas de protección que pueden recaer sobre esta persona. Misma regla
   * que tiposProteccionPara en constants/medidasProteccion.js del back (que es
   * quien la hace cumplir): la suspensión recae sobre el estudiante señalado,
   * no sobre la víctima; las de apoyo son para el afectado; las que separan a
   * las partes, para cualquiera de los dos.
   */
  tiposProteccionDe(rol: string, tipoPersona: string) {
    const soloAfectado = ['acompanamiento', 'derivacion_red', 'resguardo_confidencialidad'];
    return this.TIPOS_MEDIDA_PROTECCION.filter((t) => {
      if (soloAfectado.includes(t)) return rol === 'afectado';
      if (t === 'suspension') return rol === 'senalado' && tipoPersona === 'estudiante';
      if (['separacion_funciones', 'teletrabajo'].includes(t)) return rol === 'senalado' && tipoPersona === 'funcionario';
      return rol === 'afectado' || rol === 'senalado';
    });
  }

  // ── Medidas de protección para las dos partes ─────────────────────────────
  //
  // Una lista de acciones ya redactadas con el nombre de cada persona
  // ("Suspender a Lucas", "Acompañamiento psicosocial para Renata"): se marcan
  // las que corresponden y se aplican todas juntas. Las frases las arma el back
  // (proteccionPaso.controller.js); lo que va sobre el señalado protege a todos
  // los afectados, y lo de un afectado es solo suyo.

  /** Lo marcado en cada paso: `${id_involucrado}:${tipo}` → datos de la medida. */
  marcasProteccion: Record<number, Record<string, { marcada: boolean; dias: number | null; fundamento: string }>> = {};
  guardandoProteccion = signal<number | null>(null);

  marcaProteccion(paso: any, g: any, o: any) {
    const delPaso = (this.marcasProteccion[paso.id_activado_paso] ??= {});
    return (delPaso[`${g.id_involucrado}:${o.tipo}`] ??= { marcada: false, dias: null, fundamento: '' });
  }

  /** Lo marcado y todavía no aplicado, listo para enviar. */
  private marcadasProteccion(paso: any) {
    const marcadas: { id_involucrado: number; tipo: string; dias_habiles: number | null; fundamento: string }[] = [];
    for (const g of paso.proteccion_partes.grupos)
      for (const o of g.opciones) {
        const m = this.marcaProteccion(paso, g, o);
        if (!o.aplicada && m.marcada)
          marcadas.push({ id_involucrado: g.id_involucrado, tipo: o.tipo, dias_habiles: m.dias, fundamento: m.fundamento });
      }
    return marcadas;
  }

  hayMarcadasProteccion(paso: any) {
    return this.marcadasProteccion(paso).length > 0;
  }

  faltaParaProteccion(paso: any): string {
    for (const m of this.marcadasProteccion(paso))
      if (m.tipo === 'suspension') {
        if (!m.dias_habiles) return 'Indica los días hábiles de la suspensión';
        if (m.dias_habiles > this.MAX_DIAS_SUSPENSION) return `La suspensión no puede pasar de ${this.MAX_DIAS_SUSPENSION} días hábiles`;
        if (!m.fundamento.trim()) return 'Indica por qué no basta otra medida que la suspensión';
      }
    return '';
  }

  aplicarProteccion(paso: any) {
    const falta = this.faltaParaProteccion(paso);
    if (falta) { this.error.set(`${falta}.`); return; }
    this.error.set('');
    this.guardandoProteccion.set(paso.id_activado_paso);
    this.api.registrarProteccionPaso(this.id, paso.id_activado_paso, { medidas: this.marcadasProteccion(paso) }).subscribe({
      next: (r) => {
        this.guardandoProteccion.set(null);
        delete this.marcasProteccion[paso.id_activado_paso];
        this.success.set(r?.message ?? 'Medidas aplicadas');
        this.cargar();
      },
      error: (err: any) => {
        this.guardandoProteccion.set(null);
        this.error.set(err.error?.message ?? 'No se pudieron aplicar las medidas');
      },
    });
  }

  hayAplicadasProteccion(paso: any) {
    return paso.proteccion_partes.grupos.some((g: any) => g.opciones.some((o: any) => o.aplicada));
  }

  async sinMedidasProteccion(paso: any) {
    const motivo = await this.confirmService.pedirTexto(
      '¿No se aplica ninguna medida de protección en este caso? Queda registrado en la bitácora.',
      { etiqueta: 'Motivo', placeholder: 'Por qué no corresponde aplicar medidas de protección', obligatorio: true },
    );
    if (motivo === null) return;
    this.error.set('');
    this.api.sinMedidasProteccionPaso(this.id, paso.id_activado_paso, { motivo }).subscribe({
      next: (r) => { this.success.set(r?.message ?? 'Registrado'); this.cargar(); },
      error: (err: any) => this.error.set(err.error?.message ?? 'No se pudo registrar'),
    });
  }

  /** Las opciones de un grupo de la tarjeta "Medidas" para esta persona: en el
   *  de protección, solo las que pueden recaer sobre ella. */
  tiposDelGrupo(g: any, m: any) {
    return g.grupo === 'proteccion' && m.tipos_proteccion
      ? g.tipos.filter((t: string) => m.tipos_proteccion.includes(t))
      : g.tipos;
  }

  /** La tarjeta de esta persona tiene que pedir la medida: paso de resguardo,
   *  marcada como cumplida y todavía sin medida aplicada en este paso. */
  pideMedida(p: any, g: any, f: any) {
    return p?.tipo_medida_requerida === 'proteccion' && !g.medida_tipo && f?.estado_ui === 'cumplido';
  }

  /** Mismo catálogo que la tarjeta de medidas disciplinarias, sin expulsión ni
   *  cancelación: esas no se aplican acá, se inician (las registra el director
   *  al decidir). */
  readonly TIPOS_MEDIDA_DISCIPLINARIA = [
    'amonestacion', 'citacion_apoderado', 'medida_formativa', 'medida_reparatoria',
    'servicio_comunitario', 'derivacion', 'retiro_sala', 'suspension_actividades',
    'condicionalidad', 'suspension', 'reduccion_jornada', 'separacion_temporal',
    'asistencia_solo_evaluaciones', 'otra',
  ];
  readonly TIPOS_CON_PLAZO = ['suspension', 'reduccion_jornada', 'separacion_temporal', 'asistencia_solo_evaluaciones'];
  readonly INICIA_EXPULSION = '__expulsion__';
  readonly SIN_MEDIDA = '__sin_medida__';

  /** Categoría de cada medida, para calcular el "Tipo de medida" del paso. */
  private categoriaDe(tipo: string): string {
    if (['medida_formativa', 'servicio_comunitario', 'derivacion', 'citacion_apoderado'].includes(tipo))
      return 'formativa';
    if (tipo === 'medida_reparatoria') return 'reparatoria';
    return 'disciplinaria';
  }

  /** Las categorías que admite el paso (opciones de su campo tipo_medida). */
  opcionesTipoMedida(p: any): string[] {
    const campo = (p?.campos ?? []).find((c: any) => c.codigo === 'tipo_medida');
    const op = campo?.opciones;
    return Array.isArray(op) ? op : typeof op === 'string' ? JSON.parse(op) : [];
  }

  /** Solo vías escritas: la ley exige notificar la cautelar por escrito. */
  readonly MEDIOS_CAUTELAR = ['presencial', 'correo', 'plataforma', 'carta'];

  /** La tarjeta de este señalado decreta su suspensión cautelar: paso de
   *  medida cautelar, marcada como cumplida y todavía sin cautelar en este paso. */
  pideCautelar(p: any, g: any, f: any) {
    return p?.tipo_medida_requerida === 'cautelar' && !g.id_suspension_cautelar
      && (f?.estado_ui === 'cumplido' || f?.estado_ui === 'cumplido_notificado');
  }

  /** La tarjeta de este señalado tiene que pedir su resolución. */
  pideResolucion(p: any, g: any, f: any) {
    return p?.tipo_medida_requerida === 'disciplinaria' && !g.medida_disc_tipo
      && (f?.estado_ui === 'cumplido' || f?.estado_ui === 'cumplido_notificado');
  }

  /**
   * Calcula el "Tipo de medida" del paso desde las tarjetas y lo deja en los
   * datos que se envían. Es el dato que decide el camino del protocolo (la vía
   * de expulsión, por ejemplo), así que se calcula siempre igual:
   *  - si algún señalado inicia expulsión o cancelación, es eso;
   *  - si todas las medidas son de una misma clase, esa clase;
   *  - si se mezclan, 'mixta' o 'ambas' (según el paso) o, si el paso no tiene
   *    esa opción, 'disciplinaria' cuando hay alguna;
   *  - si nadie tiene medida, 'sin_medida'.
   * Devuelve false (con el error puesto) si no se puede calcular.
   */
  private derivarTipoMedida(paso: any): boolean {
    const opciones = this.opcionesTipoMedida(paso);
    if (paso?.tipo_medida_requerida !== 'disciplinaria' || !paso?.involucrados?.length || !opciones.length)
      return true;

    const elegidas: string[] = [];
    for (const g of paso.involucrados) {
      const f = this.formsGestion[g.id_paso_involucrado];
      if (g.medida_disc_tipo) elegidas.push(g.medida_disc_tipo);
      else if (this.pideResolucion(paso, g, f) && f.md_sel) elegidas.push(f.md_sel);
    }
    if (!elegidas.length) {
      this.error.set('Marca como cumplida la tarjeta de al menos un señalado e indica qué se resolvió.');
      return false;
    }

    let valor: string;
    if (elegidas.includes(this.INICIA_EXPULSION)) valor = 'expulsion_o_cancelacion';
    else {
      const clases = new Set(elegidas.filter((t) => t !== this.SIN_MEDIDA).map((t) => this.categoriaDe(t)));
      if (clases.size === 0) valor = 'sin_medida';
      else if (clases.size === 1) {
        const [c] = [...clases];
        // Hay pasos sin 'reparatoria' (bullying, ciberacoso): ahí la
        // reparatoria cuenta como formativa, que es lo que es.
        valor = opciones.includes(c) ? c : c === 'reparatoria' ? 'formativa' : c;
      } else
        valor = opciones.includes('mixta') ? 'mixta'
          : opciones.includes('ambas') ? 'ambas'
          : clases.has('disciplinaria') ? 'disciplinaria' : 'formativa';
    }
    if (!opciones.includes(valor)) {
      this.error.set(`Lo resuelto en las tarjetas (${valor}) no es una opción de este paso.`);
      return false;
    }
    this.datos['tipo_medida'] = valor;
    return true;
  }

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

  /**
   * Una tarjeta guardó una medida. Sin esto el aviso amarillo del paso seguía
   * diciendo que no había ninguna, y la confirmación quedaba al fondo de la
   * página: parecía que no se había guardado.
   *
   * No se usa cargar(): repinta el formulario del paso y borraría lo que la
   * persona ya escribió (el fundamento, por ejemplo). Solo se reemplazan los
   * datos del caso, que es de donde sale `medida_pendiente`.
   */
  medidaGuardada(mensaje: string) {
    this.success.set(mensaje);
    this.api.getProtocoloActivado(this.id).subscribe({
      next: (data) => this.caso.set(data),
      error: () => {},
    });
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
          // Solo se usan en un paso de resguardo, si la persona aún no tiene
          // su medida: se envían junto con la gestión y el backend la crea.
          medida_tipo: '',
          medida_dias: null as number | null,
          medida_fundamento: '',
          // Paso de resolución: la medida (o iniciar expulsión / sin medida)
          // de este señalado, con sus días y fundamento si la ley los pide.
          md_sel: '',
          md_dias: null as number | null,
          md_fundamento: '',
          // Paso de medida cautelar: cómo se le notificó por escrito y con qué
          // fundamento. La fecha de la notificación es la de la gestión.
          cau_medio: 'presencial',
          cau_fundamento: '',
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
  private guardarGestion(g: any, paso?: any) {
    const f = this.formsGestion[g.id_paso_involucrado];
    const notifico = f.estado_ui === 'cumplido_notificado';
    const data: any = {
      estado: notifico ? 'cumplido' : f.estado_ui,
      fecha_gestion: f.fecha_gestion || null,
      observacion: f.observacion?.trim() || null,
    };
    // La medida viaja con la gestión y se guardan juntas: la tarjeta de la
    // persona es la vía para aplicar la medida de protección del paso.
    if (this.pideResolucion(paso, g, f))
      data.medida_disciplinaria =
        f.md_sel === this.INICIA_EXPULSION ? { modo: 'expulsion' }
        : f.md_sel === this.SIN_MEDIDA ? { modo: 'sin_medida' }
        : {
            modo: 'medida',
            tipo_medida: f.md_sel,
            dias_habiles: this.TIPOS_CON_PLAZO.includes(f.md_sel) ? f.md_dias : null,
            fundamento: f.md_fundamento?.trim() || null,
          };
    if (this.pideCautelar(paso, g, f))
      data.medida_cautelar = {
        medio_notificacion: f.cau_medio,
        fundamento: f.cau_fundamento?.trim() || null,
      };
    if (this.pideMedida(paso, g, f))
      data.medida_proteccion = {
        tipo: f.medida_tipo,
        dias_habiles: f.medida_tipo === 'suspension' ? f.medida_dias : null,
        fundamento: f.medida_fundamento?.trim() || null,
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

  /** Qué gestión está subiendo su acta, para bloquear su botón. */
  subiendoActa = signal<number | null>(null);
  /** Qué gestión está generando su acta en el backend: bloquea sus botones. */
  generandoActa = signal<number | null>(null);

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
    return this.requiereActa(paso) && this.esActa(this.medioDe(g));
  }

  // ── El acta, en la misma tarjeta ──────────────────────────────────────────
  //
  // Antes se abría un modal que pedía otra vez el plazo y una nota. Ahora el
  // acta se arma con lo que ya está en la tarjeta: la observación de la
  // notificación va impresa bajo "SE NOTIFICA", y el plazo se ajusta ahí mismo.

  /**
   * Días hábiles para pedir reconsideración que se imprimen en el acta, por
   * gestión. Editable porque, salvo en expulsión (15 por ley, art. 6 letra d)
   * del DFL 2), lo fija el reglamento interno de cada establecimiento.
   */
  actaPlazo: Record<number, number> = {};
  /** 15 si el caso tiene informe de expulsión, 5 si no (ver cargarPlazoActa). */
  private plazoActaPorDefecto = 5;

  /** Se consulta a la fuente: el ENUM de MEDIDA_DISCIPLINARIA excluye a
   *  propósito la expulsión, así que no se puede deducir de las medidas. */
  private cargarPlazoActa() {
    this.api.getInformeExpulsion(this.id).subscribe({
      next: () => (this.plazoActaPorDefecto = 15),
      // 404 es la respuesta normal cuando el caso no tiene informe.
      error: () => (this.plazoActaPorDefecto = 5),
    });
  }

  plazoActa(g: any): number {
    return (this.actaPlazo[g.id_paso_involucrado] ??= this.plazoActaPorDefecto);
  }

  /** Lo que se imprime bajo "SE NOTIFICA": la observación de la tarjeta, la
   *  que se está escribiendo o la ya guardada. */
  private notaActa(g: any): string {
    return (this.formsGestion[g.id_paso_involucrado]?.observacion ?? g.observacion ?? '').trim();
  }

  /** El acta la arma el backend; acá solo se le da salida (imprimir o descargar). */
  emitirActa(g: any, accion: 'imprimir' | 'descargar') {
    if (this.generandoActa() !== null) return;
    this.error.set('');
    this.generandoActa.set(g.id_paso_involucrado);
    this.api
      .getActaNotificacionPdf(this.id, g.id_paso_involucrado, this.plazoActa(g), this.notaActa(g))
      .subscribe({
        next: (resp) => {
          const pdf = resp.body!;
          if (accion === 'imprimir') imprimirPdf(pdf);
          else descargarPdf(pdf, nombreDelPdf(resp, 'Notificacion.pdf'));
          this.generandoActa.set(null);
        },
        error: async (err) => {
          this.error.set(await mensajeDeErrorPdf(err, 'No se pudo generar el acta'));
          this.generandoActa.set(null);
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
      (g: any) => g.estado !== 'no_aplica' && this.esActa(this.medioDe(g)) && !g.tiene_acta_firmada,
    );
    if (faltan.length === 0) return true;

    this.error.set(
      `Falta subir el acta firmada de ${faltan.map((g: any) => g.involucrado_nombre).join(', ')}. ` +
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
        // El paso abierto desde el diagrama ya se cerró: el modal mostraría el
        // siguiente sin que nadie lo haya pedido. El aviso queda arriba.
        this.mostrarPasoModal.set(false);
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

  // ── Acogida de relatos ───────────────────────────────────────────────────
  //
  // La lista es la de todos los involucrados del caso (la arma el back en
  // `relatos_personas`). Por persona: se marca si se le acoge el relato; si
  // no, se pide el motivo; si sí, se escriben sus relatos, cada uno con su
  // botón "Acoger relato". Todo se guarda al momento —no espera a "Completar
  // paso"— porque cada relato vale por sí solo y lleva su propia fecha y hora.

  /** Lo que se está escribiendo por persona, que sobrevive a cada recarga. */
  formsRelato: Record<string, FormRelato> = {};
  /** Relato en corrección: id → texto en edición. */
  editandoRelato: Record<number, string> = {};
  guardandoRelato = signal<string | null>(null);

  formRelato(paso: any, r: any) {
    const k = `${paso.id_activado_paso}-${r.id_involucrado}`;
    return (this.formsRelato[k] ??= {
      eleccion: null, motivo: r.motivo ?? '', nuevo: '',
      abierto: false,
    });
  }

  /** La elección en pantalla: la guardada, salvo que se esté cambiando. */
  eleccionRelato(paso: any, r: any): boolean | null {
    return this.formRelato(paso, r).eleccion ?? r.se_acoge;
  }

  personaDeRelatoLista(r: any) {
    return r.se_acoge === false ? !!r.motivo : r.se_acoge === true && r.relatos.length > 0;
  }

  relatosListos(paso: any) {
    const personas = paso?.relatos_personas ?? [];
    return personas.filter((r: any) => this.personaDeRelatoLista(r)).length;
  }

  /** Se puede escribir mientras el caso siga activo y el paso esté abierto o ya
   *  completado (el coordinador agrega relatos después). */
  relatosEditables(paso: any) {
    return this.activo() && ['en_curso', 'vencido', 'completado'].includes(paso?.estado);
  }

  async elegirRelato(paso: any, r: any, seAcoge: boolean) {
    const f = this.formRelato(paso, r);
    // Marcar "no" solo abre el motivo: se guarda recién con el motivo escrito.
    if (!seAcoge) {
      f.eleccion = false;
      return;
    }
    f.eleccion = true;
    if (r.se_acoge === true) return;
    await this.llamarRelato(`${paso.id_activado_paso}-${r.id_involucrado}`,
      this.api.decidirRelato(this.id, paso.id_activado_paso, r.id_involucrado, { se_acoge: true }));
  }

  guardarMotivoRelato(paso: any, r: any) {
    const f = this.formRelato(paso, r);
    if ((f.motivo ?? '').trim().length < 5) {
      this.error.set(`Explica por qué no se le acoge el relato a ${r.nombre}.`);
      return;
    }
    this.llamarRelato(`${paso.id_activado_paso}-${r.id_involucrado}`,
      this.api.decidirRelato(this.id, paso.id_activado_paso, r.id_involucrado, {
        se_acoge: false, motivo: f.motivo.trim(),
      }));
  }

  acogerRelato(paso: any, r: any) {
    const f = this.formRelato(paso, r);
    if (!f.nuevo.trim()) return;
    this.llamarRelato(`${paso.id_activado_paso}-${r.id_involucrado}`,
      this.api.acogerRelato(this.id, paso.id_activado_paso, {
        id_involucrado: r.id_involucrado,
        relato: f.nuevo,
      }),
      () => Object.assign(f, { nuevo: '', abierto: false }));
  }

  // ── Tarjeta "Medidas" ─────────────────────────────────────────────────────
  //
  // Todos los involucrados del caso; a cada uno se le elige una medida del
  // listado que arma el back (catalogo_medidas, agrupado como lo distingue la
  // ley) o "Sin medidas". Cada una se guarda al momento, con su botón.

  formsMedida: Record<string, { opcion: string; descripcion: string; fundamento: string; dias: number | null; motivo: string; abierto: boolean }> = {};
  guardandoMedida = signal<string | null>(null);

  formMedida(paso: any, m: any) {
    return (this.formsMedida[`${paso.id_activado_paso}-${m.id_involucrado}`] ??= {
      opcion: '', descripcion: '', fundamento: '', dias: null, motivo: '', abierto: false,
    });
  }

  /** Los grupos que se le ofrecen a esta persona: a quien no es estudiante,
   *  solo los de protección (las demás medidas son sobre estudiantes). */
  gruposMedida(m: any) {
    const catalogo = this.caso()?.catalogo_medidas ?? [];
    return catalogo.filter((g: any) => !g.soloEstudiantes || m.tipo_persona === 'estudiante');
  }

  etiquetaOpcionMedida(g: any, tipo: string) {
    return g.tabla === 'p' ? etiquetaDe(tipo, 'tipo_medida_proteccion') : etiquetaDe(tipo, 'tipo_medida_disciplinaria');
  }

  /** Las que piden días hábiles y fundamento: la suspensión de protección (máx.
   *  15) y las excepcionales (Circular 482, p. 47). */
  medidaConPlazo(opcion: string) {
    return opcion === 'p:suspension' ||
      ['d:suspension', 'd:reduccion_jornada', 'd:separacion_temporal', 'd:asistencia_solo_evaluaciones'].includes(opcion);
  }

  faltaParaMedida(f: any): string {
    if (!f.opcion) return 'Elige la medida';
    if (this.medidaConPlazo(f.opcion)) {
      if (!f.dias) return 'Indica los días hábiles';
      if (f.opcion === 'p:suspension' && f.dias > this.MAX_DIAS_SUSPENSION)
        return `La suspensión no puede pasar de ${this.MAX_DIAS_SUSPENSION} días hábiles`;
      if (!f.fundamento.trim()) return 'Indica el fundamento';
    }
    return '';
  }

  medidasEditables(paso: any) {
    return this.activo() && ['en_curso', 'vencido', 'completado'].includes(paso?.estado);
  }

  /** Una medida de protección de un paso anterior mantenida y todavía vigente
   *  cuenta como la medida de la persona. */
  tieneMantenida(m: any) {
    return (m?.previas ?? []).some((x: any) => x.mantenida && x.estado === 'vigente');
  }

  personaMedidaLista(m: any) {
    return m.medidas.length > 0 || !!m.sin_medida || this.tieneMantenida(m);
  }

  medidasListas(paso: any) {
    return (paso?.medidas_personas ?? []).filter((m: any) => this.personaMedidaLista(m)).length;
  }

  /** Las previas sobre las que todavía hay algo que decidir (vigentes). */
  previasVigentes(m: any) {
    return (m?.previas ?? []).filter((x: any) => x.estado === 'vigente');
  }

  decidiendoPrevia = signal<number | null>(null);

  async decidirPrevia(paso: any, m: any, x: any, accion: 'mantener' | 'deshacer' | 'concluir') {
    if (this.decidiendoPrevia() !== null) return;
    if (accion === 'concluir') {
      const ok = await this.confirmService.confirmarAccion(
        `¿Concluir "${x.etiqueta}" de ${m.nombre}? La medida deja de estar vigente y ${m.nombre} ` +
          'queda pendiente hasta que se le elija otra medida o "Sin medidas".',
      );
      if (!ok) return;
    }
    this.error.set('');
    this.decidiendoPrevia.set(x.id);
    this.api.decidirMedidaPrevia(this.id, paso.id_activado_paso, x.id, accion).subscribe({
      next: (r) => {
        this.decidiendoPrevia.set(null);
        this.success.set(r?.message ?? 'Guardado');
        this.cargar();
      },
      error: (err: any) => {
        this.decidiendoPrevia.set(null);
        this.error.set(err.error?.message ?? 'No se pudo guardar la decisión');
      },
    });
  }

  registrarMedida(paso: any, m: any) {
    const f = this.formMedida(paso, m);
    const falta = this.faltaParaMedida(f);
    if (falta) {
      this.error.set(`${m.nombre}: ${falta.toLowerCase()}.`);
      return;
    }
    const clave = `${paso.id_activado_paso}-${m.id_involucrado}`;
    this.error.set('');
    this.guardandoMedida.set(clave);
    this.api.registrarMedidaPaso(this.id, paso.id_activado_paso, {
      id_involucrado: m.id_involucrado,
      opcion: f.opcion,
      descripcion: f.descripcion,
      fundamento: f.fundamento,
      dias_habiles: this.medidaConPlazo(f.opcion) ? f.dias : null,
      motivo: f.motivo,
    }).subscribe({
      next: (r: any) => {
        this.guardandoMedida.set(null);
        Object.assign(f, { opcion: '', descripcion: '', fundamento: '', dias: null, motivo: '', abierto: false });
        this.success.set(r?.message ?? 'Medida registrada');
        this.cargar();
      },
      error: (err: any) => {
        this.guardandoMedida.set(null);
        this.error.set(err.error?.message ?? 'No se pudo registrar la medida');
      },
    });
  }

  // ── Documento firmado de una medida ──────────────────────────────────────
  //
  // Las excepcionales y la condicionalidad piden la resolución con la firma del
  // director. Se imprime o descarga, se firma y se vuelve a subir escaneada, en
  // la misma tarjeta.

  generandoDocMedida = signal<number | null>(null);
  subiendoDocMedida = signal<number | null>(null);

  emitirDocumentoMedida(x: any, accion: 'imprimir' | 'descargar') {
    if (this.generandoDocMedida() !== null) return;
    this.error.set('');
    this.generandoDocMedida.set(x.id);
    this.api.getDocumentoMedidaPdf(this.id, x.id).subscribe({
      next: (resp) => {
        const pdf = resp.body!;
        if (accion === 'imprimir') imprimirPdf(pdf);
        else descargarPdf(pdf, nombreDelPdf(resp, 'Documento medida.pdf'));
        this.generandoDocMedida.set(null);
      },
      error: async (err) => {
        this.error.set(await mensajeDeErrorPdf(err, 'No se pudo generar el documento'));
        this.generandoDocMedida.set(null);
      },
    });
  }

  subirDocumentoMedida(x: any, m: any, evento: Event) {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    // Se limpia al capturar el archivo y se traba mientras sube: en Android el
    // evento de selección puede dispararse dos veces.
    input.value = '';
    if (!file || this.subiendoDocMedida() === x.id) return;
    this.subiendoDocMedida.set(x.id);
    this.error.set('');
    const fd = new FormData();
    fd.append('archivo', file);
    this.api.subirDocumentoMedida(this.id, x.id, fd).subscribe({
      next: () => {
        this.subiendoDocMedida.set(null);
        this.success.set(`Documento firmado de ${m.nombre} subido`);
        this.cargar();
      },
      error: (err) => {
        this.subiendoDocMedida.set(null);
        this.error.set(err.error?.message ?? 'No se pudo subir el documento');
      },
    });
  }

  verDocumentoMedida(x: any) {
    this.api.getDocumentoMedida(this.id, x.id).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.error.set('No se pudo abrir el documento firmado'),
    });
  }

  // ── Encargar un relato a un funcionario ──────────────────────────────────

  relatoAEncargar = signal<{ paso: any; persona: any } | null>(null);
  encargarA: number | null = null;

  abrirEncargarRelato(paso: any, persona: any) {
    this.relatoAEncargar.set({ paso, persona });
    this.encargarA = persona.id_usuario_responsable ?? null;
  }

  encargarRelato(quitar = false) {
    const e = this.relatoAEncargar();
    if (!e) return;
    this.llamarRelato(`${e.paso.id_activado_paso}-${e.persona.id_involucrado}`,
      this.api.asignarRelato(this.id, e.paso.id_activado_paso, e.persona.id_involucrado, quitar ? null : this.encargarA),
      () => this.relatoAEncargar.set(null));
  }

  // ── Acceso al caso completo ──────────────────────────────────────────────
  //
  // La lista de quienes ven el caso completo es de cada caso, no del rol. La
  // administran Dirección, Convivencia y el administrador, que además lo ven
  // siempre (ver utils/accesoCaso.js en el back).

  mostrarAcceso = signal(false);
  acceso = signal<{ usuarios: any[]; roles_supervision: string[] } | null>(null);
  accesoNuevo: number | null = null;
  guardandoAcceso = signal(false);

  abrirAcceso() {
    this.mostrarAcceso.set(true);
    this.accesoNuevo = null;
    this.cargarAcceso();
  }

  private cargarAcceso() {
    this.api.getAccesoCaso(this.id).subscribe({
      next: (a) => this.acceso.set(a),
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar el acceso'),
    });
  }

  /** Funcionarios que todavía no están en la lista. */
  usuariosSinAcceso() {
    const ya = new Set((this.acceso()?.usuarios ?? []).map((u: any) => u.id_usuario));
    return this.usuarios().filter((u: any) => !ya.has(u.id_usuario));
  }

  otorgarAcceso() {
    if (!this.accesoNuevo) return;
    this.guardandoAcceso.set(true);
    this.api.otorgarAccesoCaso(this.id, this.accesoNuevo).subscribe({
      next: () => {
        this.guardandoAcceso.set(false);
        this.accesoNuevo = null;
        this.cargarAcceso();
      },
      error: (err) => {
        this.guardandoAcceso.set(false);
        this.error.set(err.error?.message ?? 'No se pudo dar acceso');
      },
    });
  }

  async retirarAcceso(u: any) {
    const ok = await this.confirmService.confirmarAccion(
      `${u.nombre || u.correo} dejará de ver este caso completo. Si tiene una tarjeta o un relato ` +
        'encargado, seguirá viendo solo eso. ¿Retirar el acceso?',
    );
    if (!ok) return;
    this.api.retirarAccesoCaso(this.id, u.id_usuario).subscribe({
      next: () => this.cargarAcceso(),
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo retirar el acceso'),
    });
  }

  /** Personas cuyos relatos anteriores se desplegaron, por paso. */
  private relatosDesplegados = new Set<string>();

  /** Cuántos relatos de una persona quedan plegados arriba: con más de dos se
   *  muestran los dos últimos, que es lo que se lee primero. */
  relatosPlegados(paso: any, r: any): number {
    if (this.relatosDesplegados.has(`${paso.id_activado_paso}-${r.id_involucrado}`)) return 0;
    return Math.max(0, r.relatos.length - 2);
  }

  desplegarRelatos(paso: any, r: any) {
    this.relatosDesplegados.add(`${paso.id_activado_paso}-${r.id_involucrado}`);
  }

  cancelarCorreccionRelato(relato: any) {
    delete this.editandoRelato[relato.id_relato];
  }

  async guardarCorreccionRelato(paso: any, relato: any) {
    const texto = this.editandoRelato[relato.id_relato];
    if (!texto?.trim() || texto.trim() === relato.relato) {
      delete this.editandoRelato[relato.id_relato];
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      'El relato se corrige, pero el texto anterior queda guardado y aparece en el expediente junto a la ' +
        'corrección, con tu nombre y la fecha. ¿Guardar la corrección?',
    );
    if (!ok) return;
    this.llamarRelato(`relato-${relato.id_relato}`,
      this.api.editarRelato(this.id, paso.id_activado_paso, relato.id_relato, texto),
      () => delete this.editandoRelato[relato.id_relato]);
  }

  /** Guarda y recarga el caso; la marca de "guardando" es por persona para
   *  que el botón de una no bloquee a las demás. */
  private llamarRelato(clave: string, req: any, alTerminar?: () => void) {
    this.error.set('');
    this.guardandoRelato.set(clave);
    return new Promise<void>((resolve) =>
      req.subscribe({
        next: (r: any) => {
          this.guardandoRelato.set(null);
          alTerminar?.();
          // La elección local ya quedó guardada: desde acá manda la del back.
          for (const k of Object.keys(this.formsRelato))
            if (k === clave) this.formsRelato[k].eleccion = null;
          this.success.set(r?.message ?? 'Guardado');
          this.cargar();
          resolve();
        },
        error: (err: any) => {
          this.guardandoRelato.set(null);
          this.error.set(err.error?.message ?? 'No se pudo guardar');
          resolve();
        },
      }),
    );
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
