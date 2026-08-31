import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  AccionNodo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';

/** Una de las dos ramas de una pregunta Sí/No. */
interface RamaEdit {
  valor: 'si' | 'no';
  /** Transición ya guardada que implementa esta rama, si existe. */
  idTransicion: number | null;
  /** '' = sin salida · '__nuevo__' = crear un paso · id del paso destino. */
  destino: string;
  /** Nombre del paso a crear cuando `destino` es '__nuevo__'. */
  nombreNuevo: string;
}

/** Campo del paso mientras se edita dentro del modal, antes de guardarse. */
interface CampoEdit {
  id: number | null;
  codigo: string;
  etiqueta: string;
  tipo_campo: string;
  /** Opciones editadas como texto separado por comas. */
  opcionesTexto: string;
  es_obligatorio: boolean;
  /** Código del campo del que depende, o '' si se pregunta siempre. */
  dependeDeCampo: string;
  /** Respuesta de ese campo que hace aparecer a este. */
  dependeDeValor: string;
  orden: number;
  codigoManual: boolean;
  ramas: RamaEdit[];
}

/** Salida (transición) del paso mientras se edita dentro del modal. */
interface SalidaEdit {
  id: number | null;
  id_paso_destino: number | null;
  condicionCampo: string;
  condicionValor: string;
  etiqueta: string;
  es_default: boolean;
}

/** Entrada (transición de otro paso hacia este) mientras se edita en el modal. */
interface PrevioEdit {
  id: number | null;
  id_paso_origen: number | null;
  etiqueta: string;
  /** La condición con la que el paso de origen deriva hacia acá (ej. una rama
   *  Sí/No). Se conserva tal cual: se edita en el paso de origen, no acá. */
  condicion: string | null;
}

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
 * Un paso se edita completo en un solo modal: nombre y plazo, responsables,
 * preguntas y salidas. Antes eran cuatro modales distintos y configurar un
 * paso obligaba a abrir y cerrar cuatro veces sin ver nunca el paso entero.
 * El guardado los reconstruye en orden (paso → roles → campos → salidas)
 * porque las condiciones de las salidas se validan contra los campos ya
 * guardados en el servidor.
 */
@Component({
  selector: 'app-protocolo-flujo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe, CerrarConEsc],
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
  /** El único modal de edición: el paso completo. */
  mostrarPaso = signal(false);
  guardando = signal(false);
  editando: any = null;

  formPaso: any = {};
  rolesSeleccionados: any[] = [];
  camposEdit: CampoEdit[] = [];
  salidasEdit: SalidaEdit[] = [];
  /** Ids de lo que estaba guardado y el usuario quitó dentro del modal: se
   *  borra en el servidor recién al guardar, para que Cancelar no destruya
   *  nada. */
  camposEliminados: number[] = [];
  salidasEliminadas: number[] = [];
  /** Los pasos desde los que se llega a este. Son transiciones del otro paso,
   *  pero se editan acá para no tener que salir a buscarlo: un paso suelto se
   *  arregla desde el paso suelto. */
  previosEdit: PrevioEdit[] = [];
  previosEliminados: number[] = [];

  readonly TIPOS_PASO = ['informativo', 'formulario', 'adjunto', 'aprobacion', 'notificacion_externa'];
  readonly TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'seleccion', 'booleano'];
  readonly UNIDADES = ['horas', 'dias_habiles', 'dias_corridos'];
  readonly ACCIONES = ['notificar', 'escalar', 'marcar_alerta'];
  readonly PARTICIPACIONES = ['ejecutor', 'aprobador', 'notificado'];
  /** A quiénes alcanza el paso. Vacío = al caso, una sola vez. */
  readonly ROLES_PASO = ['afectado', 'senalado', 'todos', 'testigo', 'denunciante'];

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

  /**
   * Click en una caja del diagrama: abre ese paso ya cargado en el editor.
   *
   * Antes abría una ficha de solo lectura, que en un paso recién creado se veía
   * entera vacía (sin responsables, sin preguntas, sin salidas) y no ofrecía
   * ninguna forma de llenarla. Sin permiso de edición sigue siendo la ficha:
   * es lo único que se puede hacer.
   */
  seleccionarDelGrafo(nodo: NodoGrafo) {
    const paso = this.pasos().find((p: any) => this.idPaso(p) === nodo.id);
    if (!paso) return;
    this.pasoSeleccionadoId.set(nodo.id);
    if (this.puedeEditar()) this.abrirPaso(paso);
    else this.mostrarDetalle.set(true);
  }

  /** Botón de la barra de acciones de un nodo: editarlo entero o borrarlo. */
  accionDesdeGrafo(e: { nodo: NodoGrafo; accion: AccionNodo }) {
    const paso = this.pasos().find((p: any) => this.idPaso(p) === e.nodo.id);
    if (!paso) return;
    this.pasoSeleccionadoId.set(e.nodo.id);
    if (e.accion === 'editar') this.abrirPaso(paso);
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

  // ── Editor del paso (modal único) ─────────────────────────────────────────

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
          por_involucrado_rol: null,
          requiere_acuse: false,
          orden_visual: (this.pasos().length + 1) * 10,
        };
    // Llegan como 0/1 desde MySQL; el checkbox necesita booleano o nace marcado.
    this.formPaso.requiere_acuse = !!this.formPaso.requiere_acuse;
    this.formPaso.por_involucrado_rol = this.formPaso.por_involucrado_rol ?? null;

    this.rolesSeleccionados = (paso?.roles ?? []).map((r: any) => ({
      rol_id: r.rol_id,
      tipo_participacion: r.tipo_participacion,
    }));

    this.camposEliminados = [];
    this.salidasEliminadas = [];
    this.previosEliminados = [];
    this.previosEdit = paso
      ? this.entradasDe(paso).map((t: any) => ({
          id: this.idTransicion(t),
          id_paso_origen: t.id_paso_origen,
          etiqueta: t.etiqueta ?? '',
          condicion: t.condicion ?? null,
        }))
      : [];
    this.camposEdit = (paso?.campos ?? []).map((c: any, i: number) => ({
      id: this.idCampo(c),
      codigo: c.codigo,
      etiqueta: c.etiqueta,
      tipo_campo: c.tipo_campo,
      opcionesTexto: this.opciones(c).join(', '),
      es_obligatorio: !!c.es_obligatorio,
      dependeDeCampo: this.partesDependencia(c.depende_de).campo,
      dependeDeValor: this.partesDependencia(c.depende_de).valor,
      orden: c.orden ?? i,
      codigoManual: false,
      ramas: [],
    }));

    const salidas = paso ? this.salidasDe(paso) : [];
    // Las salidas que implementan el Sí/No de una pregunta se editan dentro de
    // esa pregunta, no repetidas abajo: verlas en los dos lados invita a
    // dejarlas contradiciéndose.
    const consumidas = new Set<number>();
    for (const c of this.camposEdit) {
      if (!this.esSiNo(c)) continue;
      c.ramas = (['si', 'no'] as const).map((valor) => {
        const t = salidas.find((s: any) => this.normalizarCondicion(s.condicion) === `${c.codigo}=${valor}`);
        if (t) consumidas.add(this.idTransicion(t));
        return {
          valor,
          idTransicion: t ? this.idTransicion(t) : null,
          // Sin transición todavía, la rama arranca en "crear un paso nuevo":
          // es lo que se quiere hacer nueve de cada diez veces y deja el input
          // del nombre a la vista sin un click previo.
          destino: t ? String(t.id_paso_destino) : '__nuevo__',
          nombreNuevo: '',
        };
      });
    }

    this.salidasEdit = salidas
      .filter((t: any) => !consumidas.has(this.idTransicion(t)))
      .map((t: any) => {
        const [campo, valor] = (t.condicion ?? '').split('=');
        return {
          id: this.idTransicion(t),
          id_paso_destino: t.id_paso_destino,
          condicionCampo: (campo ?? '').trim(),
          condicionValor: (valor ?? '').trim(),
          etiqueta: t.etiqueta ?? '',
          es_default: !!t.es_default,
        };
      });

    this.mostrarPaso.set(true);
  }

  /** `' reviste_delito = si '` → `'reviste_delito=si'`, para poder comparar. */
  private normalizarCondicion(condicion?: string | null): string {
    if (!condicion) return '';
    const [campo, valor] = condicion.split('=');
    return `${(campo ?? '').trim()}=${(valor ?? '').trim()}`;
  }

  // ── Responsables dentro del modal ─────────────────────────────────────────

  agregarRol() {
    this.rolesSeleccionados.push({ rol_id: null, tipo_participacion: 'ejecutor' });
  }

  quitarRol(i: number) {
    this.rolesSeleccionados.splice(i, 1);
  }

  /** El catálogo global solo admite roles globales; el espejo, además, los del
   *  propio colegio. La lista se filtra para no ofrecer lo que el backend
   *  rechazaría. `GET /roles` ya devuelve solo los activos (no expone la
   *  columna `activo`), así que acá solo se filtra por alcance. */
  rolesDisponibles() {
    // El ADMIN no es responsable de nada: es la cuenta que administra el
    // sistema, no alguien del colegio que ejecute un paso del protocolo.
    const roles = this.roles().filter((r: any) => r.codigo !== 'ADMIN');
    if (!this.esEstablecimiento) return roles.filter((r: any) => r.id_establecimiento === null);
    // En el flujo de un colegio solo se ofrecen los roles que ahí tienen a
    // alguien detrás: un paso a cargo de un rol que nadie ocupa es un paso que
    // nadie va a hacer. Los ya asignados se mantienen en la lista aunque hoy
    // estén vacíos, para no borrarlos en silencio al guardar.
    const asignados = new Set(this.rolesSeleccionados.map((r) => r.rol_id));
    return roles.filter((r: any) => r.cantidad_usuarios > 0 || asignados.has(r.rol_id));
  }

  // ── Campos dentro del modal ───────────────────────────────────────────────

  agregarCampo(tipo: 'libre' | 'sino' = 'libre') {
    this.camposEdit.push({
      id: null,
      codigo: '',
      etiqueta: '',
      tipo_campo: tipo === 'sino' ? 'booleano' : 'texto',
      opcionesTexto: '',
      es_obligatorio: true,
      dependeDeCampo: '',
      dependeDeValor: '',
      orden: this.camposEdit.length,
      codigoManual: false,
      ramas: tipo === 'sino' ? this.ramasVacias() : [],
    });
  }

  private ramasVacias(): RamaEdit[] {
    return (['si', 'no'] as const).map((valor) => ({
      valor,
      idTransicion: null,
      destino: '__nuevo__',
      nombreNuevo: '',
    }));
  }

  quitarCampo(i: number) {
    const c = this.camposEdit[i];
    if (c.id) this.camposEliminados.push(c.id);
    // Las salidas que dependían de sus ramas se van con él: una condición
    // sobre un campo que ya no existe la rechaza el backend igual.
    for (const r of c.ramas) if (r.idTransicion) this.salidasEliminadas.push(r.idTransicion);
    this.camposEdit.splice(i, 1);
  }

  /** Una pregunta con dos respuestas es la que puede abrir dos caminos: es el
   *  único caso en que se ofrecen los nombres de los pasos siguientes. */
  /** `'presento_descargos=si'` → `{ campo, valor }`; vacíos si no hay dependencia. */
  private partesDependencia(depende_de?: string | null) {
    const m = /^([a-z][a-z0-9_]*)\s*=\s*(.+)$/.exec(depende_de ?? '');
    return m ? { campo: m[1], valor: m[2].trim() } : { campo: '', valor: '' };
  }

  /**
   * Preguntas que pueden condicionar a la de la posición `indice`: solo las
   * anteriores y solo las de respuesta cerrada.
   *
   * Anteriores porque los campos se guardan en este mismo orden — apuntar a una
   * de más abajo haría que el backend rechace la dependencia por apuntar a un
   * campo que todavía no existe — y porque una pregunta que decide si otra se
   * hace tiene que venir antes en el formulario.
   */
  camposCondicionables(indice: number): CampoEdit[] {
    return this.camposEdit
      .slice(0, indice)
      .filter((c) => ['seleccion', 'booleano'].includes(c.tipo_campo) && c.codigo);
  }

  /** Respuestas posibles del campo del que depende `c`. */
  valoresDependencia(c: CampoEdit): string[] {
    const padre = this.camposEdit.find((x) => x.codigo === c.dependeDeCampo);
    if (!padre) return [];
    return padre.tipo_campo === 'booleano' ? ['si', 'no'] : this.opcionesDeTexto(padre);
  }

  /** Al cambiar de qué campo depende, el valor viejo puede no existir en el nuevo. */
  onDependeDeCampo(c: CampoEdit) {
    if (!c.dependeDeCampo) { c.dependeDeValor = ''; return; }
    const valores = this.valoresDependencia(c);
    if (!valores.includes(c.dependeDeValor)) c.dependeDeValor = valores[0] ?? '';
  }

  esSiNo(c: CampoEdit): boolean {
    if (c.tipo_campo === 'booleano') return true;
    if (c.tipo_campo !== 'seleccion') return false;
    const ops = c.opcionesTexto.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
    return ops.length === 2 && ops.includes('si') && ops.includes('no');
  }

  /** Al cambiar el tipo de un campo pueden aparecer o desaparecer sus ramas. */
  onTipoCampo(c: CampoEdit) {
    if (c.tipo_campo === 'seleccion' && !c.opcionesTexto.trim()) c.opcionesTexto = 'si, no';
    this.sincronizarRamas(c);
  }

  sincronizarRamas(c: CampoEdit) {
    if (this.esSiNo(c)) {
      if (c.ramas.length === 0) c.ramas = this.ramasVacias();
      return;
    }
    // Deja de ser una bifurcación: las salidas que la implementaban se borran
    // al guardar, porque su condición ya no sería válida.
    for (const r of c.ramas) if (r.idTransicion) this.salidasEliminadas.push(r.idTransicion);
    c.ramas = [];
  }

  /**
   * El código sale solo de la pregunta. Se pedía a mano y no hay forma de que
   * un encargado de convivencia sepa qué es "snake_case": lo único que le
   * importa es la pregunta que va a ver quien complete el paso.
   *
   * Al editar un campo ya guardado el código queda quieto: está escrito dentro
   * de las condiciones de las salidas y regenerarlo al retocar la pregunta las
   * rompería sin que nadie lo pida.
   */
  onEtiquetaCampo(c: CampoEdit) {
    if (c.codigoManual || c.id) return;
    c.codigo = this.codigoUnico(c.etiqueta, c);
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
  private codigoUnico(texto: string, propio: CampoEdit): string {
    const base = this.aCodigo(texto);
    if (!base) return '';
    const usados = new Set(this.camposEdit.filter((c) => c !== propio).map((c) => c.codigo));
    if (!usados.has(base)) return base;
    let n = 2;
    while (usados.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  // ── Salidas dentro del modal ──────────────────────────────────────────────

  agregarSalida() {
    this.salidasEdit.push({
      id: null,
      id_paso_destino: null,
      condicionCampo: '',
      condicionValor: '',
      etiqueta: '',
      es_default: false,
    });
  }

  quitarSalida(i: number) {
    const s = this.salidasEdit[i];
    if (s.id) this.salidasEliminadas.push(s.id);
    this.salidasEdit.splice(i, 1);
  }

  /**
   * Campos del paso que pueden decidir una rama, tomados del formulario y no
   * de lo guardado: una pregunta recién agregada arriba ya puede condicionar
   * una salida de abajo, porque las dos se guardan en el mismo Guardar.
   */
  camposDecidibles() {
    const decidibles = this.camposEdit
      .filter((c) => ['seleccion', 'booleano'].includes(c.tipo_campo) && c.codigo)
      .map((c) => ({
        codigo: c.codigo,
        etiqueta: c.etiqueta || c.codigo,
        opciones: c.tipo_campo === 'booleano'
          ? ['si', 'no']
          : c.opcionesTexto.split(',').map((o) => o.trim()).filter(Boolean),
      }));
    // Un paso de aprobación decide por su resultado, que no es un campo configurado.
    if (this.formPaso?.tipo_paso === 'aprobacion')
      return [{ codigo: 'aprobado', etiqueta: '¿Aprobado?', opciones: ['si', 'no'] }, ...decidibles];
    return decidibles;
  }

  opcionesDe(codigo: string): string[] {
    return this.camposDecidibles().find((c) => c.codigo === codigo)?.opciones ?? [];
  }

  /** Una rama por defecto es la que se toma cuando ninguna condición se
   *  cumple: las dos cosas juntas no significan nada. */
  onCondicionSalida(s: SalidaEdit) {
    if (!s.condicionCampo) s.condicionValor = '';
    if (s.condicionCampo && s.condicionValor) s.es_default = false;
  }

  // ── Guardado ──────────────────────────────────────────────────────────────

  /**
   * Guarda el paso entero en el orden en que el backend puede aceptarlo: el
   * paso primero (un paso nuevo todavía no tiene id), después sus campos, y
   * recién al final las salidas, porque el servidor valida cada condición
   * contra los campos que ya tiene guardados de ese paso.
   */
  async guardarPaso() {
    this.error.set('');
    if (!this.formPaso.nombre?.trim()) return this.error.set('El nombre del paso es obligatorio');
    // Un plazo a medias no se puede calcular: si no hay valor, tampoco unidad.
    if (!this.formPaso.plazo_valor) this.formPaso.plazo_unidad = null;

    for (const c of this.camposEdit) {
      if (!c.etiqueta?.trim()) return this.error.set('Cada pregunta necesita su texto.');
      if (!c.codigo?.trim()) c.codigo = this.codigoUnico(c.etiqueta, c);
      if (c.tipo_campo === 'seleccion' && this.opcionesDeTexto(c).length < 2)
        return this.error.set(`La pregunta "${c.etiqueta}" necesita al menos dos opciones.`);
      if (c.dependeDeCampo && !c.dependeDeValor)
        return this.error.set(
          `Falta indicar con qué respuesta de "${c.dependeDeCampo}" aparece la pregunta "${c.etiqueta}".`,
        );
      for (const r of c.ramas)
        if (r.destino === '__nuevo__' && r.nombreNuevo.trim() === '' && this.hayAlgunaRama(c))
          return this.error.set(
            `Falta el nombre del paso que sigue cuando "${c.etiqueta}" se responde ${r.valor === 'si' ? 'Sí' : 'No'}.`,
          );
    }
    for (const s of this.salidasEdit)
      if (!s.id_paso_destino) return this.error.set('Cada salida necesita el paso en el que continúa.');
    for (const p of this.previosEdit)
      if (!p.id_paso_origen) return this.error.set('Cada paso previo necesita indicar de qué paso viene.');

    this.guardando.set(true);
    try {
      // 1. El paso.
      let idP: number;
      if (this.editando) {
        idP = this.idPaso(this.editando);
        await firstValueFrom(
          this.esEstablecimiento
            ? this.api.updatePasoEstablecimiento(this.id, idP, this.formPaso)
            : this.api.updatePasoGenerico(this.id, idP, this.formPaso),
        );
      } else {
        idP = this.idDeRespuestaPaso(
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.createPasoEstablecimiento(this.id, this.formPaso)
              : this.api.createPasoGenerico(this.id, this.formPaso),
          ),
        );
      }

      // 2. Responsables (el endpoint reemplaza la lista completa).
      await firstValueFrom(
        this.esEstablecimiento
          ? this.api.setRolesPasoEstablecimiento(this.id, idP, this.rolesSeleccionados.filter((r) => r.rol_id))
          : this.api.setRolesPasoGenerico(this.id, idP, this.rolesSeleccionados.filter((r) => r.rol_id)),
      );

      // 3. Salidas y campos eliminados. Las salidas van primero: una condición
      //    viva sobre un campo que se está por borrar bloquearía el borrado.
      for (const idT of this.salidasEliminadas) await this.borrarTransicion(idT);
      for (const idT of this.previosEliminados) await this.borrarTransicion(idT);
      for (const idC of this.camposEliminados) await this.borrarCampo(idP, idC);

      // 4. Campos.
      for (const [i, c] of this.camposEdit.entries()) {
        const data = {
          codigo: c.codigo,
          etiqueta: c.etiqueta,
          tipo_campo: c.tipo_campo,
          es_obligatorio: c.es_obligatorio,
          depende_de: c.dependeDeCampo && c.dependeDeValor
            ? `${c.dependeDeCampo}=${c.dependeDeValor}`
            : null,
          orden: i,
          opciones: c.tipo_campo === 'seleccion' ? this.opcionesDeTexto(c) : null,
        };
        if (c.id) {
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.updateCampoEstablecimiento(this.id, idP, c.id, data)
              : this.api.updateCampoGenerico(this.id, idP, c.id, data),
          );
        } else {
          const r: any = await firstValueFrom(
            this.esEstablecimiento
              ? this.api.createCampoEstablecimiento(this.id, idP, data)
              : this.api.createCampoGenerico(this.id, idP, data),
          );
          c.id = r?.id_campo_estab ?? r?.id_campo ?? null;
        }
      }

      // 5. Las dos ramas de cada pregunta Sí/No, creando los pasos que falten.
      for (const c of this.camposEdit) {
        if (!this.esSiNo(c)) continue;
        for (const r of c.ramas) {
          const idDestino = await this.resolverDestinoRama(r);
          if (idDestino === null) {
            if (r.idTransicion) await this.borrarTransicion(r.idTransicion);
            r.idTransicion = null;
            continue;
          }
          const data = {
            id_paso_origen: idP,
            id_paso_destino: idDestino,
            condicion: `${c.codigo}=${r.valor}`,
            etiqueta: r.valor === 'si' ? 'Sí' : 'No',
            es_default: false,
          };
          if (r.idTransicion) {
            await firstValueFrom(
              this.esEstablecimiento
                ? this.api.updateTransicionEstablecimiento(this.id, r.idTransicion, data)
                : this.api.updateTransicionGenerica(this.id, r.idTransicion, data),
            );
          } else {
            await firstValueFrom(
              this.esEstablecimiento
                ? this.api.createTransicionEstablecimiento(this.id, data)
                : this.api.createTransicionGenerica(this.id, data),
            );
          }
        }
      }

      // 6. El resto de las salidas.
      for (const s of this.salidasEdit) {
        const data = {
          id_paso_origen: idP,
          id_paso_destino: s.id_paso_destino,
          condicion: s.condicionCampo && s.condicionValor ? `${s.condicionCampo}=${s.condicionValor}` : null,
          etiqueta: s.etiqueta || null,
          es_default: s.es_default,
        };
        if (s.id) {
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.updateTransicionEstablecimiento(this.id, s.id, data)
              : this.api.updateTransicionGenerica(this.id, s.id, data),
          );
        } else {
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.createTransicionEstablecimiento(this.id, data)
              : this.api.createTransicionGenerica(this.id, data),
          );
        }
      }

      // 7. Los pasos previos. Es una salida del otro paso, pero se guarda con
      //    el mismo botón: quien lo asignó acá espera verlo conectado al cerrar.
      for (const p of this.previosEdit) {
        const data = {
          id_paso_origen: p.id_paso_origen,
          id_paso_destino: idP,
          condicion: p.condicion || null,
          etiqueta: p.etiqueta || null,
          es_default: false,
        };
        if (p.id) {
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.updateTransicionEstablecimiento(this.id, p.id, data)
              : this.api.updateTransicionGenerica(this.id, p.id, data),
          );
        } else {
          await firstValueFrom(
            this.esEstablecimiento
              ? this.api.createTransicionEstablecimiento(this.id, data)
              : this.api.createTransicionGenerica(this.id, data),
          );
        }
      }

      this.mostrarPaso.set(false);
      this.success.set(this.editando ? 'Paso actualizado' : 'Paso creado');
      this.cargar();
    } catch (err: any) {
      // Lo que ya se guardó antes del error queda guardado: se recarga para que
      // el modal vuelva a abrirse sobre el estado real y no sobre el que el
      // usuario creía tener.
      this.error.set(err?.error?.message ?? 'No se pudo guardar el paso');
      this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }

  /** El id de un paso recién creado, con el nombre que le da cada nivel. */
  private idDeRespuestaPaso(r: any): number {
    return r?.id_paso_estab ?? r?.id_paso;
  }

  /** Crea el paso nuevo de la rama si hace falta y devuelve su id; null si la
   *  rama quedó sin destino. */
  private async resolverDestinoRama(r: RamaEdit): Promise<number | null> {
    if (r.destino === '') return null;
    if (r.destino !== '__nuevo__') return Number(r.destino);
    const nombre = r.nombreNuevo.trim();
    if (!nombre) return null;
    const data = {
      nombre,
      descripcion: '',
      tipo_paso: 'informativo',
      accion_al_vencer: 'notificar',
      es_paso_inicial: false,
      es_paso_final: false,
      orden_visual: (this.pasos().length + this.camposEdit.length + 1) * 10,
    };
    const creado: any = await firstValueFrom(
      this.esEstablecimiento
        ? this.api.createPasoEstablecimiento(this.id, data)
        : this.api.createPasoGenerico(this.id, data),
    );
    // Ya existe: la próxima pasada del modal lo tomará como destino existente.
    r.destino = String(this.idDeRespuestaPaso(creado));
    r.nombreNuevo = '';
    return Number(r.destino);
  }

  private borrarTransicion(idT: number) {
    return firstValueFrom(
      this.esEstablecimiento
        ? this.api.deleteTransicionEstablecimiento(this.id, idT)
        : this.api.deleteTransicionGenerica(this.id, idT),
    );
  }

  private borrarCampo(idP: number, idC: number) {
    return firstValueFrom(
      this.esEstablecimiento
        ? this.api.deleteCampoEstablecimiento(this.id, idP, idC)
        : this.api.deleteCampoGenerico(this.id, idP, idC),
    );
  }

  private opcionesDeTexto(c: CampoEdit): string[] {
    return c.opcionesTexto.split(',').map((o) => o.trim()).filter(Boolean);
  }

  /** Una bifurcación a medias (solo el Sí) es legítima; una sin ninguna de las
   *  dos ramas es simplemente una pregunta que todavía no decide nada. */
  private hayAlgunaRama(c: CampoEdit): boolean {
    return c.ramas.some((r) => (r.destino === '__nuevo__' ? !!r.nombreNuevo.trim() : r.destino !== ''));
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

  // ── Lectura del grafo ────────────────────────────────────────────────────

  salidasDe(paso: any) {
    return (this.grafo()?.transiciones ?? []).filter(
      (t: any) => t.id_paso_origen === this.idPaso(paso),
    );
  }

  nombrePaso(idPaso: number) {
    return this.pasos().find((p: any) => this.idPaso(p) === idPaso)?.nombre ?? `#${idPaso}`;
  }

  /**
   * Pasos que pueden ser destino de una salida del que se está editando.
   * El paso en edición no se ofrece: una salida hacia sí mismo deja el caso
   * girando en el mismo nodo.
   */
  pasosDestino() {
    if (!this.editando) return this.pasos();
    const actual = this.idPaso(this.editando);
    return this.pasos().filter((p: any) => this.idPaso(p) !== actual);
  }

  /** Transiciones que entran al paso, es decir sus pasos previos. */
  entradasDe(paso: any) {
    const actual = this.idPaso(paso);
    return (this.grafo()?.transiciones ?? []).filter(
      (t: any) => t.id_paso_destino === actual && t.id_paso_origen !== actual,
    );
  }

  /** Pasos que pueden ser el previo del que se está editando. */
  pasosOrigen() {
    return this.pasosDestino();
  }

  agregarPrevio() {
    this.previosEdit.push({ id: null, id_paso_origen: null, etiqueta: '', condicion: null });
  }

  quitarPrevio(i: number) {
    const p = this.previosEdit[i];
    if (p.id) this.previosEliminados.push(p.id);
    this.previosEdit.splice(i, 1);
  }

  /** Pasos a los que continúa el que se está editando. Se lee de lo que hay en
   *  el modal y no del grafo guardado: una salida recién agregada abajo tiene
   *  que verse acá arriba antes de guardar. */
  pasosSiguientes(): string[] {
    const actual = this.editando ? this.idPaso(this.editando) : null;
    const nombres: string[] = [];
    for (const s of this.salidasEdit)
      if (s.id_paso_destino && s.id_paso_destino !== actual) nombres.push(this.nombrePaso(s.id_paso_destino));
    for (const c of this.camposEdit) {
      if (!this.esSiNo(c)) continue;
      for (const r of c.ramas) {
        if (r.destino === '') continue;
        if (r.destino === '__nuevo__') {
          if (r.nombreNuevo.trim()) nombres.push(r.nombreNuevo.trim());
          continue;
        }
        if (Number(r.destino) !== actual) nombres.push(this.nombrePaso(Number(r.destino)));
      }
    }
    return [...new Set(nombres)];
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
    // El detalle se cierra al abrir el editor para no apilar dos modales: el
    // fondo se oscurece dos veces y el de atrás queda a medias visible.
    this.mostrarDetalle.set(false);
  }
}
