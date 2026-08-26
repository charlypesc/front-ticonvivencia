import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import {
  GrafoProtocolo,
  NodoGrafo,
  AristaGrafo,
  AccionNodo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';

/**
 * Editor del grafo de un protocolo: pasos, transiciones, roles y campos.
 *
 * Sirve para los dos niveles con el mismo componente. La ruta decide cuál:
 *   /protocolos-genericos/:id/flujo          → plantilla global (ADMIN)
 *   /protocolos-establecimiento/:id/flujo    → copia del colegio
 *
 * Son la misma pantalla porque son el mismo grafo con las mismas reglas; lo
 * único que cambia son los endpoints y quién puede tocarlos. Duplicar el
 * componente habría significado arreglar cada cosa dos veces.
 *
 * No es un editor visual con nodos arrastrables: es el grafo como listas
 * (pasos, y las salidas de cada paso). El editor gráfico viene después y no
 * cambia nada de lo que hay debajo.
 */
@Component({
  selector: 'app-protocolo-flujo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe],
  templateUrl: './protocolo-flujo.html',
  styleUrl: './protocolo-flujo.scss',
})
export class ProtocoloFlujo implements OnInit {
  protected readonly Permiso = Permiso;

  id = 0;
  /** true en /protocolos-establecimiento/:id/flujo. */
  esEstablecimiento = false;

  grafo = signal<any | null>(null);
  roles = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');
  problemas = signal<string[]>([]);

  mostrarDetalle = signal(false);
  mostrarPaso = signal(false);
  mostrarTransicion = signal(false);
  mostrarCampo = signal(false);
  mostrarRoles = signal(false);
  editando: any = null;
  /** Paso sobre el que se está editando un campo, un rol o una salida. */
  pasoActivo: any = null;

  formPaso: any = {};
  formTransicion: any = {};
  formCampo: any = {};
  /** Opciones de un campo de selección, editadas como texto separado por comas. */
  opcionesTexto = '';
  /** El identificador del campo se genera solo; esto lo abre para editarlo a
   *  mano en el caso raro de que haya que fijarlo (ej. calzar con una
   *  condición ya escrita). */
  codigoManual = signal(false);
  rolesSeleccionados: any[] = [];

  readonly TIPOS_PASO = ['informativo', 'formulario', 'adjunto', 'aprobacion', 'notificacion_externa'];
  readonly TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'seleccion', 'booleano'];
  readonly UNIDADES = ['horas', 'dias_habiles', 'dias_corridos'];
  readonly ACCIONES = ['notificar', 'escalar', 'marcar_alerta'];
  readonly PARTICIPACIONES = ['ejecutor', 'aprobador', 'notificado'];

  pasos = computed(() => this.grafo()?.pasos ?? []);

  /** El diagrama es la vista por defecto: un grafo con ramas se entiende antes
   *  de un vistazo que leyendo nueve tarjetas en orden. */
  vista = signal<'diagrama' | 'lista'>('diagrama');

  // El componente del diagrama trabaja con nodos y aristas normalizados: así
  // sirve igual para la plantilla, la copia del colegio y un caso en curso,
  // que nombran sus ids distinto.
  nodosGrafo = computed<NodoGrafo[]>(() =>
    this.pasos().map((p: any) => ({
      id: this.idPaso(p),
      nombre: p.nombre,
      tipo_paso: p.tipo_paso,
      es_paso_inicial: p.es_paso_inicial,
      es_paso_final: p.es_paso_final,
      plazo: p.plazo_valor ? this.plazoTexto(p) : undefined,
    })),
  );

  aristasGrafo = computed<AristaGrafo[]>(() =>
    (this.grafo()?.transiciones ?? []).map((t: any) => ({
      origen: t.id_paso_origen,
      destino: t.id_paso_destino,
      condicion: t.condicion,
      // La condición se guarda como `codigo=valor` porque es lo que se evalúa
      // al ejecutar el protocolo; en pantalla va la etiqueta del campo, que es
      // la pregunta escrita en castellano.
      condicion_legible: this.condicionLegible(t.condicion),
      etiqueta: t.etiqueta,
      es_default: t.es_default,
    })),
  );

  /** Código de campo → su etiqueta. `aprobado` no es un campo configurado: es
   *  el resultado de un paso de aprobación (ver `camposDecidibles()`). */
  private etiquetasCampo = computed<Map<string, string>>(() => {
    const mapa = new Map<string, string>([['aprobado', '¿Aprobado?']]);
    for (const p of this.pasos())
      for (const c of p.campos ?? [])
        if (c.codigo) mapa.set(c.codigo, c.etiqueta || humanizar(c.codigo));
    return mapa;
  });

  /** `hay_senales_fisicas=si` → `¿Hay señales físicas? = Sí`. */
  condicionLegible(condicion?: string | null): string {
    if (!condicion) return '';
    const [codigo, valor] = condicion.split('=');
    const campo = this.etiquetasCampo().get(codigo?.trim()) ?? humanizar(codigo ?? '');
    const v = (valor ?? '').trim();
    if (!v) return campo;
    return `${campo} = ${v === 'si' ? 'Sí' : v === 'no' ? 'No' : v}`;
  }

  /** Paso que muestra el modal de detalle. Se guarda el id y no el objeto:
   *  después de guardar algo, `cargar()` trae pasos nuevos y con el objeto
   *  viejo el modal se quedaría mostrando datos ya reemplazados. */
  pasoSeleccionadoId = signal<number | null>(null);
  pasoSeleccionado = computed(
    () => this.pasos().find((p: any) => this.idPaso(p) === this.pasoSeleccionadoId()) ?? null,
  );

  /** Click en un nodo del diagrama: abre su detalle. Antes abría directo el
   *  modal de editar, que solo dejaba ver el nombre y el plazo — no los
   *  responsables, los campos ni las salidas. */
  seleccionarDelGrafo(nodo: NodoGrafo) {
    this.pasoSeleccionadoId.set(nodo.id);
    this.mostrarDetalle.set(true);
  }

  /**
   * Botón de la barra de acciones de un nodo. Existe para que el diagrama —que
   * es la vista por defecto— no obligue a cambiarse a "Detalle" para asignar
   * responsables o conectar un paso: los problemas que reporta el validador se
   * resuelven todos desde acá.
   */
  accionDesdeGrafo(e: { nodo: NodoGrafo; accion: AccionNodo }) {
    const paso = this.pasos().find((p: any) => this.idPaso(p) === e.nodo.id);
    if (!paso) return;
    this.pasoSeleccionadoId.set(e.nodo.id);
    if (e.accion === 'editar') this.abrirPaso(paso);
    else if (e.accion === 'roles') this.abrirRoles(paso);
    else if (e.accion === 'campo') this.abrirCampo(paso);
    else if (e.accion === 'transicion') this.abrirTransicion(paso);
    else if (e.accion === 'eliminar') this.eliminarPaso(paso);
  }

  /** Un protocolo heredado del catálogo se ve, pero no se edita hasta clonarlo. */
  editable = computed(() => !this.esEstablecimiento || this.grafo()?.editable === true);
  permisoEditar = computed(() =>
    this.esEstablecimiento ? Permiso.ProtocoloFlujoEstablecimientoEditar : Permiso.ProtocoloFlujoEditar,
  );
  /** Lo mismo que evalúa `appPuede` en la vista de detalle, pero como valor:
   *  la barra de acciones vive dentro del componente del grafo, donde la
   *  directiva no llega. Sin permiso no se dibuja. */
  puedeEditar = computed(() => this.editable() && this.auth.can(this.permisoEditar()));

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private confirmService: ConfirmService,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.esEstablecimiento = this.route.snapshot.data['establecimiento'] === true;
    this.cargar();
    // Alimenta el selector de responsables del paso. Sin rol.ver el flujo se
    // ve igual; lo único que queda vacío es esa lista.
    this.api.getRoles().subscribe({ next: (data) => this.roles.set(data), error: () => {} });
  }

  /** El id de un paso se llama distinto en cada nivel; el resto del componente
   *  trabaja siempre con este. */
  idPaso = (p: any) => (this.esEstablecimiento ? p.id_paso_estab : p.id_paso);
  idTransicion = (t: any) => (this.esEstablecimiento ? t.id_transicion_estab : t.id_transicion);
  idCampo = (c: any) => (this.esEstablecimiento ? c.id_campo_estab : c.id_campo);

  cargar() {
    this.loading.set(true);
    const req = this.esEstablecimiento
      ? this.api.getFlujoEstablecimiento(this.id)
      : this.api.getFlujoGenerico(this.id);
    req.subscribe({
      next: (data) => {
        this.grafo.set(data);
        this.loading.set(false);
        this.validar(true);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo cargar el flujo');
        this.loading.set(false);
      },
    });
  }

  /** `silencioso` para la validación automática al cargar: informa problemas
   *  pero no felicita a nadie por abrir la pantalla. */
  validar(silencioso = false) {
    const req = this.esEstablecimiento
      ? this.api.validarFlujoEstablecimiento(this.id)
      : this.api.validarFlujoGenerico(this.id);
    req.subscribe({
      next: (r: any) => {
        this.problemas.set(r.problemas ?? []);
        if (!silencioso && (r.publicable || r.activable))
          this.success.set('El flujo es coherente: no hay problemas.');
      },
      error: () => this.problemas.set([]),
    });
  }

  publicar() {
    this.limpiar();
    this.api.publicarFlujoGenerico(this.id).subscribe({
      next: () => {
        this.success.set('Protocolo publicado: ya se puede activar sobre un caso.');
        this.cargar();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo publicar');
        this.problemas.set(err.error?.problemas ?? []);
      },
    });
  }

  async personalizar() {
    const ok = await this.confirmService.confirmarAccion(
      'Se copiará el flujo del catálogo a este establecimiento. Desde ese momento las correcciones que haga el administrador ya no llegarán solas a este protocolo. ¿Continuar?',
    );
    if (!ok) return;
    this.limpiar();
    this.api.personalizarFlujoEstablecimiento(this.id).subscribe({
      next: (r: any) => {
        this.success.set(r.message ?? 'Flujo personalizado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo personalizar'),
    });
  }

  async restaurar() {
    const ok = await this.confirmService.confirmarAccion(
      'Se descartará la copia del establecimiento y el protocolo volverá a usar el flujo del catálogo. Los casos ya activados no se tocan. ¿Continuar?',
    );
    if (!ok) return;
    this.limpiar();
    this.api.restaurarFlujoEstablecimiento(this.id).subscribe({
      next: (r: any) => {
        this.success.set(r.message ?? 'Personalización descartada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo restaurar'),
    });
  }

  // ── Pasos ────────────────────────────────────────────────────────────────

  abrirPaso(paso?: any) {
    this.limpiar();
    this.editando = paso ?? null;
    this.formPaso = paso
      ? { ...paso }
      : {
          nombre: '',
          descripcion: '',
          tipo_paso: 'informativo',
          plazo_valor: null,
          plazo_unidad: null,
          accion_al_vencer: 'notificar',
          es_paso_inicial: false,
          es_paso_final: false,
          orden_visual: (this.pasos().length + 1) * 10,
        };
    this.mostrarPaso.set(true);
  }

  guardarPaso() {
    this.error.set('');
    if (!this.formPaso.nombre?.trim()) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    // Un plazo a medias no se puede calcular: si no hay valor, tampoco unidad.
    if (!this.formPaso.plazo_valor) this.formPaso.plazo_unidad = null;

    const req = this.editando
      ? this.esEstablecimiento
        ? this.api.updatePasoEstablecimiento(this.id, this.idPaso(this.editando), this.formPaso)
        : this.api.updatePasoGenerico(this.id, this.idPaso(this.editando), this.formPaso)
      : this.esEstablecimiento
        ? this.api.createPasoEstablecimiento(this.id, this.formPaso)
        : this.api.createPasoGenerico(this.id, this.formPaso);

    req.subscribe({
      next: () => {
        this.mostrarPaso.set(false);
        this.success.set(this.editando ? 'Paso actualizado' : 'Paso creado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo guardar el paso'),
    });
  }

  async eliminarPaso(paso: any) {
    const salidas = this.salidasDe(paso).length;
    const ok = await this.confirmService.confirmarAccion(
      salidas > 0
        ? `¿Eliminar "${paso.nombre}"? Se eliminarán también las transiciones que lo conectan.`
        : `¿Eliminar el paso "${paso.nombre}"?`,
    );
    if (!ok) return;
    this.limpiar();
    const req = this.esEstablecimiento
      ? this.api.deletePasoEstablecimiento(this.id, this.idPaso(paso))
      : this.api.deletePasoGenerico(this.id, this.idPaso(paso));
    req.subscribe({
      next: (r: any) => {
        this.success.set(r.message ?? 'Paso eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  // ── Transiciones ─────────────────────────────────────────────────────────

  salidasDe(paso: any) {
    return (this.grafo()?.transiciones ?? []).filter(
      (t: any) => t.id_paso_origen === this.idPaso(paso),
    );
  }

  nombrePaso(idPaso: number) {
    return this.pasos().find((p: any) => this.idPaso(p) === idPaso)?.nombre ?? `#${idPaso}`;
  }

  abrirTransicion(paso: any, transicion?: any) {
    this.limpiar();
    this.pasoActivo = paso;
    this.editando = transicion ?? null;
    this.formTransicion = transicion
      ? { ...transicion, es_default: !!transicion.es_default }
      : {
          id_paso_origen: this.idPaso(paso),
          id_paso_destino: null,
          condicion: '',
          etiqueta: '',
          es_default: false,
        };
    this.mostrarTransicion.set(true);
  }

  /** Campos del paso de origen que pueden decidir una rama, para armar la
   *  condición desde selectores en vez de escribir 'campo=valor' a mano. */
  camposDecidibles() {
    const campos = this.pasoActivo?.campos ?? [];
    const decidibles = campos.filter((c: any) => ['seleccion', 'booleano'].includes(c.tipo_campo));
    // Un paso de aprobación decide por su resultado, que no es un campo configurado.
    if (this.pasoActivo?.tipo_paso === 'aprobacion')
      return [
        { codigo: 'aprobado', etiqueta: '¿Aprobado?', tipo_campo: 'seleccion', opciones: ['si', 'no'] },
        ...decidibles,
      ];
    return decidibles;
  }

  condicionCampo = '';
  condicionValor = '';

  opcionesDe(codigo: string): string[] {
    const campo = this.camposDecidibles().find((c: any) => c.codigo === codigo);
    if (!campo) return [];
    if (campo.tipo_campo === 'booleano') return ['si', 'no'];
    return this.opciones(campo);
  }

  aplicarCondicion() {
    this.formTransicion.condicion =
      this.condicionCampo && this.condicionValor
        ? `${this.condicionCampo}=${this.condicionValor}`
        : '';
    // Una rama por defecto es la que se toma cuando ninguna condición se
    // cumple: las dos cosas juntas no significan nada.
    if (this.formTransicion.condicion) this.formTransicion.es_default = false;
  }

  guardarTransicion() {
    this.error.set('');
    if (!this.formTransicion.id_paso_destino) {
      this.error.set('Hay que elegir el paso de destino');
      return;
    }
    const data = { ...this.formTransicion, condicion: this.formTransicion.condicion || null };
    const req = this.editando
      ? this.esEstablecimiento
        ? this.api.updateTransicionEstablecimiento(this.id, this.idTransicion(this.editando), data)
        : this.api.updateTransicionGenerica(this.id, this.idTransicion(this.editando), data)
      : this.esEstablecimiento
        ? this.api.createTransicionEstablecimiento(this.id, data)
        : this.api.createTransicionGenerica(this.id, data);

    req.subscribe({
      next: () => {
        this.mostrarTransicion.set(false);
        this.success.set(this.editando ? 'Transición actualizada' : 'Transición creada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo guardar la transición'),
    });
  }

  async eliminarTransicion(t: any) {
    const ok = await this.confirmService.confirmarAccion(
      `¿Eliminar la transición hacia "${this.nombrePaso(t.id_paso_destino)}"?`,
    );
    if (!ok) return;
    this.limpiar();
    const req = this.esEstablecimiento
      ? this.api.deleteTransicionEstablecimiento(this.id, this.idTransicion(t))
      : this.api.deleteTransicionGenerica(this.id, this.idTransicion(t));
    req.subscribe({
      next: () => {
        this.success.set('Transición eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  // ── Campos ───────────────────────────────────────────────────────────────

  abrirCampo(paso: any, campo?: any) {
    this.limpiar();
    this.pasoActivo = paso;
    this.editando = campo ?? null;
    this.formCampo = campo
      ? { ...campo, es_obligatorio: !!campo.es_obligatorio }
      : { codigo: '', etiqueta: '', tipo_campo: 'seleccion', es_obligatorio: true, orden: 0 };
    this.opcionesTexto = campo ? this.opciones(campo).join(', ') : 'si, no';
    // Al editar, el código queda quieto: ya está escrito dentro de las
    // condiciones de las salidas, y regenerarlo al retocar la pregunta las
    // rompería sin que nadie lo pida.
    this.codigoManual.set(false);
    this.mostrarCampo.set(true);
  }

  /**
   * El código sale solo de la pregunta. Se pedía a mano y no hay forma de que
   * un encargado de convivencia sepa qué es "snake_case": lo único que le
   * importa es la pregunta que va a ver quien complete el paso.
   */
  onEtiquetaCampo() {
    if (this.codigoManual() || this.editando) return;
    this.formCampo.codigo = this.codigoUnico(this.formCampo.etiqueta);
  }

  /**
   * "¿Se habló con el Apoderado?" → `se_hablo_con_el_apoderado`. El backend
   * exige `^[a-z][a-z0-9_]{0,49}$` (el código viaja crudo dentro de la
   * condición, por eso no admite espacios ni '=').
   */
  private aCodigo(texto: string): string {
    const base = (texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // tildes, ya separadas por el NFD
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)
      .replace(/_+$/, '');
    // Tiene que empezar con letra: una pregunta que arranca con número
    // ("2 o más veces") daría un código que el backend rechaza.
    return /^[a-z]/.test(base) ? base : base ? `campo_${base}`.slice(0, 50) : '';
  }

  /** Dos preguntas parecidas en el mismo paso chocarían contra el índice único
   *  del backend (409); se numera antes de llegar ahí. */
  private codigoUnico(texto: string): string {
    const base = this.aCodigo(texto);
    if (!base) return '';
    const usados = new Set(
      (this.pasoActivo?.campos ?? [])
        .filter((c: any) => !this.editando || this.idCampo(c) !== this.idCampo(this.editando))
        .map((c: any) => c.codigo),
    );
    if (!usados.has(base)) return base;
    let n = 2;
    while (usados.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  guardarCampo() {
    this.error.set('');
    // Red de seguridad: si la pregunta se pegó desde el portapapeles el
    // ngModelChange corre igual, pero un campo abierto y guardado sin tocar la
    // pregunta (o con un código vaciado a mano) llegaría sin código.
    if (!this.formCampo.codigo?.trim())
      this.formCampo.codigo = this.codigoUnico(this.formCampo.etiqueta);
    const data = {
      ...this.formCampo,
      opciones:
        this.formCampo.tipo_campo === 'seleccion'
          ? this.opcionesTexto.split(',').map((o) => o.trim()).filter(Boolean)
          : null,
    };
    const idP = this.idPaso(this.pasoActivo);
    const req = this.editando
      ? this.esEstablecimiento
        ? this.api.updateCampoEstablecimiento(this.id, idP, this.idCampo(this.editando), data)
        : this.api.updateCampoGenerico(this.id, idP, this.idCampo(this.editando), data)
      : this.esEstablecimiento
        ? this.api.createCampoEstablecimiento(this.id, idP, data)
        : this.api.createCampoGenerico(this.id, idP, data);

    req.subscribe({
      next: () => {
        this.mostrarCampo.set(false);
        this.success.set(this.editando ? 'Campo actualizado' : 'Campo creado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo guardar el campo'),
    });
  }

  async eliminarCampo(paso: any, campo: any) {
    const ok = await this.confirmService.confirmarAccion(`¿Eliminar el campo "${campo.etiqueta}"?`);
    if (!ok) return;
    this.limpiar();
    const req = this.esEstablecimiento
      ? this.api.deleteCampoEstablecimiento(this.id, this.idPaso(paso), this.idCampo(campo))
      : this.api.deleteCampoGenerico(this.id, this.idPaso(paso), this.idCampo(campo));
    req.subscribe({
      next: () => {
        this.success.set('Campo eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  // ── Roles ────────────────────────────────────────────────────────────────

  abrirRoles(paso: any) {
    this.limpiar();
    this.pasoActivo = paso;
    this.rolesSeleccionados = (paso.roles ?? []).map((r: any) => ({
      rol_id: r.rol_id,
      tipo_participacion: r.tipo_participacion,
    }));
    this.mostrarRoles.set(true);
  }

  agregarRol() {
    this.rolesSeleccionados.push({ rol_id: null, tipo_participacion: 'ejecutor' });
  }

  quitarRol(i: number) {
    this.rolesSeleccionados.splice(i, 1);
  }

  guardarRoles() {
    this.error.set('');
    const roles = this.rolesSeleccionados.filter((r) => r.rol_id);
    const idP = this.idPaso(this.pasoActivo);
    const req = this.esEstablecimiento
      ? this.api.setRolesPasoEstablecimiento(this.id, idP, roles)
      : this.api.setRolesPasoGenerico(this.id, idP, roles);
    req.subscribe({
      next: () => {
        this.mostrarRoles.set(false);
        this.success.set('Roles del paso actualizados');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudieron guardar los roles'),
    });
  }

  /** El catálogo global solo admite roles globales; el espejo, además, los del
   *  propio colegio. La lista se filtra para no ofrecer lo que el backend
   *  rechazaría. `GET /roles` ya devuelve solo los activos (no expone la
   *  columna `activo`), así que acá solo se filtra por alcance. */
  rolesDisponibles() {
    return this.esEstablecimiento
      ? this.roles()
      : this.roles().filter((r: any) => r.id_establecimiento === null);
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  opciones(campo: any): string[] {
    const o = campo?.opciones;
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

  plazoTexto(p: any) {
    if (!p.plazo_valor) return 'sin plazo';
    return `${p.plazo_valor} ${etiquetaDe(p.plazo_unidad, 'plazo_unidad')}`;
  }

  rolesDe(paso: any, tipo: string) {
    return (paso.roles ?? [])
      .filter((r: any) => r.tipo_participacion === tipo)
      .map((r: any) => r.rol_nombre)
      .join(', ');
  }

  private limpiar() {
    this.error.set('');
    this.success.set('');
    // Todo formulario del flujo se abre desde acá. El detalle se cierra al
    // abrir uno para no apilar dos modales: el fondo se oscurece dos veces y
    // el de atrás queda a medias visible.
    this.mostrarDetalle.set(false);
  }
}
