import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { Permiso } from '../../core/constants/permisos';
import { RolesEnum } from '../../core/enum/roles.enum';
import { esPasoDeAprobacion } from '../../core/constants/pasos';
import { Puede } from '../../shared/directives/permiso.directive';
import {
  GrafoProtocolo,
  NodoGrafo,
  AristaGrafo,
  AccionNodo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';

/** Una pregunta precargada por una plantilla de paso. */
interface PlantillaCampo {
  codigo: string;
  etiqueta: string;
  tipo_campo: 'texto' | 'seleccion';
  opciones?: string[];
  es_obligatorio?: boolean;
  /** Respuestas cuya rama vuelve a este mismo paso: el paso se repite. */
  repiteEn?: string[];
}

/**
 * Paso ya armado, listo para ajustar.
 *
 * Hay trámites que son siempre el mismo y que cada colegio estaba
 * reescribiendo con sus palabras: notificar al apoderado, resolver una medida
 * disciplinaria. Escritos distintos en cada protocolo, después no hay forma de
 * responder "¿en cuántos casos se notificó fuera de plazo?".
 *
 * Cada una es un `tipo_paso` propio (ver TIPOS_PASO en flujoProtocolo.js), así
 * que se elige en el desplegable de tipo de paso y desde ahí se arma sola. Las
 * dos de medidas se resuelven aprobando o rechazando, igual que un paso de
 * aprobación: son una decisión que la dirección firma.
 *
 * Las tres de medidas llevan la ley en la descripción porque es lo que lee
 * quien ejecuta el paso, y es lo que queda en el expediente.
 */
interface PlantillaPaso {
  /** El `tipo_paso` que arma esta tarjeta. Su nombre para el usuario sale del
   *  pipe `etiqueta:'tipo_paso'`, para no escribirlo en dos lugares. */
  tipo: string;
  paso: {
    nombre: string;
    descripcion: string;
    plazo_valor: number | null;
    plazo_unidad: string | null;
    por_involucrado_rol?: string | null;
    requiere_notificacion?: boolean;
    /** Las tres tarjetas de medida ordenan registrar una: sin esto el paso se
     *  llama "Medidas de protección" pero no le pide ninguna al caso, y el
     *  aviso de medida pendiente nunca aparece. */
    requiere_medida?: boolean;
    tipo_medida_requerida?: string;
  };
  campos: PlantillaCampo[];
  /** Responsables que el paso necesita para poder guardarse o ejecutarse. */
  roles?: Array<{ codigo: string; tipo_participacion: string }>;
  /** Qué trae esta tarjeta que no se ve en los campos del modal: el acta que
   *  emite, dónde se registra lo que decide, cómo se resuelve. Se muestra al
   *  elegirla, porque es lo que distingue una tarjeta de un paso en blanco. */
  nota: string;
}

const OBSERVACIONES: PlantillaCampo = {
  codigo: 'observaciones',
  etiqueta: 'Observaciones',
  tipo_campo: 'texto',
  es_obligatorio: false,
};

const PLANTILLAS: PlantillaPaso[] = [
  {
    tipo: 'notificacion_apoderado',
    paso: {
      nombre: 'Notificación al apoderado',
      descripcion:
        'Comunicar al apoderado lo ocurrido y las medidas adoptadas respecto de su pupilo. ' +
        'Queda constancia por cada persona notificada: medio, fecha y quién notificó. El acta ' +
        'se emite a nombre del apoderado: la recibe y la firma él, no el estudiante.',
      plazo_valor: 2,
      plazo_unidad: 'dias_habiles',
      por_involucrado_rol: 'todos',
      requiere_notificacion: true,
    },
    campos: [{ ...OBSERVACIONES, etiqueta: 'Observaciones de la notificación' }],
    nota:
      'Se pide constancia por cada persona alcanzada —medio, fecha y quién notificó— y el acta ' +
      'se emite a nombre del apoderado: la recibe y la firma él, con sus datos en blanco para ' +
      'completar a mano.',
  },
  {
    tipo: 'notificacion_estudiante',
    paso: {
      nombre: 'Notificación al estudiante',
      descripcion:
        'Informar al estudiante, en un lenguaje que pueda comprender, su situación en el ' +
        'procedimiento y las medidas que lo afectan. Puede estar acompañado; esta instancia ' +
        'no es un interrogatorio.',
      plazo_valor: 2,
      plazo_unidad: 'dias_habiles',
      por_involucrado_rol: 'todos',
      requiere_notificacion: true,
    },
    campos: [{ ...OBSERVACIONES, etiqueta: 'Observaciones de la notificación' }],
    nota:
      'Se pide constancia por cada persona alcanzada —medio, fecha y quién notificó— y el acta ' +
      'se emite a nombre del propio estudiante, que es quien la firma.',
  },
  {
    tipo: 'medida_proteccion',
    paso: {
      nombre: 'Medidas de protección',
      descripcion:
        'Medidas de protección del art. 16 E letra j de la Ley 21.809: resguardan a la persona ' +
        'afectada mientras se investiga y no son una sanción. La suspensión solo procede si ' +
        'ninguna medida menos gravosa alcanza, no puede exceder 15 días hábiles y obliga a ' +
        'realizar monitoreo pedagógico y a resguardar la continuidad de la trayectoria ' +
        'educativa del estudiante suspendido. Si vence y el procedimiento sigue abierto, ' +
        'corresponde adoptar otra medida: la ley no permite extenderla.',
      plazo_valor: 24,
      plazo_unidad: 'horas',
      por_involucrado_rol: 'afectado',
      requiere_medida: true,
      tipo_medida_requerida: 'proteccion',
    },
    campos: [
      {
        codigo: 'medidas_aplicadas',
        etiqueta: '¿Se aplicaron medidas de protección?',
        tipo_campo: 'seleccion',
        opciones: ['si', 'no'],
        es_obligatorio: true,
      },
      { ...OBSERVACIONES, etiqueta: 'Fundamento y observaciones' },
    ],
    nota:
      'Las medidas se registran en la tarjeta "Medidas de protección" del caso, con su tipo, sus ' +
      'fechas y su seguimiento. Este paso deja constancia en el flujo de que se resolvieron y con ' +
      'qué fundamento.',
    // No es un paso de aprobación —no lo firma nadie—, así que lo que necesita
    // es un ejecutor, no un aprobador como las otras dos medidas. Sin ninguno de
    // los dos el paso no le aparece por hacer a nadie y el caso se detiene ahí:
    // lo adopta quien conduce el procedimiento.
    roles: [{ codigo: RolesEnum.ENCARGADO, tipo_participacion: 'ejecutor' }],
  },
  {
    tipo: 'medida_disciplinaria',
    paso: {
      nombre: 'Medidas disciplinarias',
      descripcion:
        'Solo pueden aplicarse las medidas que el reglamento interno contemple, de forma ' +
        'proporcional a la gravedad de los hechos y después de escuchar los descargos ' +
        '(Circular 482/2018, p. 47). Las medidas excepcionales —suspensión, condicionalidad, ' +
        'no renovación de matrícula y expulsión— exigen fundamentar por qué ninguna menos ' +
        'gravosa alcanzaba, y la expulsión o la cancelación de matrícula requieren además el ' +
        'informe previo del art. 2 N° 5 de la Ley 21.809. Ninguna medida puede fundarse en ' +
        'criterios discriminatorios.',
      plazo_valor: 3,
      plazo_unidad: 'dias_habiles',
      por_involucrado_rol: 'senalado',
      requiere_medida: true,
      tipo_medida_requerida: 'disciplinaria',
    },
    campos: [{ ...OBSERVACIONES, etiqueta: 'Fundamento de la medida' }],
    // Un paso de aprobación sin aprobador no se puede guardar: lo rechaza el
    // backend. La resolución la firma la dirección del establecimiento.
    roles: [{ codigo: RolesEnum.DIRECTOR, tipo_participacion: 'aprobador' }],
    nota:
      'Se resuelve aprobando o rechazando, no completando un formulario: necesita un rol ' +
      'aprobador, y las salidas del paso ramifican por la respuesta a "¿Aprobado?".',
  },
  {
    tipo: 'medida_cautelar',
    paso: {
      nombre: 'Medida cautelar',
      descripcion:
        'Suspensión cautelar del art. 6 letra d) del DFL 2/1998: acompaña al procedimiento ' +
        'sancionatorio y no es una medida de protección. Se notifica por escrito y de forma ' +
        'fundada, y hay diez días hábiles desde la notificación para resolver. La ' +
        'reconsideración amplía la suspensión hasta culminar su tramitación, y resolver ' +
        'después de una reconsideración exige el pronunciamiento escrito del Consejo de ' +
        'Profesores.',
      plazo_valor: 1,
      plazo_unidad: 'dias_habiles',
      por_involucrado_rol: 'senalado',
      requiere_medida: true,
      tipo_medida_requerida: 'cautelar',
    },
    campos: [{ ...OBSERVACIONES, etiqueta: 'Fundamento de la medida cautelar' }],
    roles: [{ codigo: RolesEnum.DIRECTOR, tipo_participacion: 'aprobador' }],
    nota:
      'Se resuelve aprobando o rechazando, no completando un formulario: necesita un rol ' +
      'aprobador, y las salidas del paso ramifican por la respuesta a "¿Aprobado?". La ' +
      'suspensión cautelar se registra además en la tarjeta del caso, con sus plazos.',
  },
  {
    tipo: 'seguimiento',
    paso: {
      nombre: 'Seguimiento del caso',
      descripcion: 'Verificar el estado del caso y el cumplimiento de las medidas adoptadas.',
      // Punto de partida editable: la ley no fija cada cuánto se hace.
      plazo_valor: 15,
      plazo_unidad: 'dias_corridos',
    },
    campos: [
      {
        codigo: 'situacion_superada',
        etiqueta: '¿La situación está superada y las medidas se están cumpliendo?',
        tipo_campo: 'seleccion',
        opciones: ['si', 'no'],
        es_obligatorio: true,
        // Si no está superada, el paso se vuelve a hacer.
        repiteEn: ['no'],
      },
      { ...OBSERVACIONES, etiqueta: 'Observaciones del seguimiento (qué queda pendiente, con quién se habló)' },
    ],
    nota:
      'La pregunta estándar quedó cargada abajo; puedes editarla, quitarla o agregar otras. El ' +
      '"No" viene apuntando a este mismo paso: si la situación sigue abierta, el seguimiento se ' +
      'vuelve a hacer.',
  },
];

/**
 * Destino de una rama que vuelve al paso que se está editando.
 *
 * Va como marca y no como id porque un paso recién creado todavía no tiene uno;
 * al guardar se traduce a '@paso', que es como el backend nombra al paso del
 * envío. Es una salida legítima —el motor la admite mientras tenga condición—:
 * es la forma de decir "con esta respuesta, este paso se vuelve a hacer".
 */
const MISMO_PASO = '__mismo__';

/** Una de las ramas de una pregunta de respuesta cerrada: una por opción. */
interface RamaEdit {
  /** El código de la opción que toma esta rama ('si', 'no', 'parcialmente'…). */
  valor: string;
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
  /** El CÓDIGO de cada opción: lo que se guarda y lo que evalúan las
   *  condiciones del flujo (`campo=si`). Una opción por entrada. Puede haber
   *  vacías mientras se escribe: se descartan al leerlas con
   *  `opcionesLimpias`, no al tipear. */
  opciones: string[];
  /** Lo que se ve y se escribe en el input, en castellano y con mayúscula
   *  ("Sí", "Salida pedagógica"). Va aparte del código porque el código no se
   *  le muestra nunca al usuario, y porque normalizar el texto en cada tecla
   *  haría imposible escribir un espacio. */
  opcionesTexto: string[];
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
  imports: [CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './protocolo-flujo.html',
  styleUrl: './protocolo-flujo.scss',
})
export class ProtocoloFlujo implements OnInit {
  protected readonly Permiso = Permiso;
  protected readonly MISMO_PASO = MISMO_PASO;

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
  /** Último nombre que puso el tipo de paso, para saber si se puede reemplazar
   *  al cambiar de tipo o si lo escribió una persona. */
  private nombrePuestoPorElTipo = '';
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

  // Mismo orden y mismos valores que TIPOS_PASO en flujoProtocolo.js.
  readonly TIPOS_PASO = [
    'informativo', 'formulario', 'adjunto', 'aprobacion', 'notificacion_externa',
    'seguimiento', 'notificacion_apoderado', 'notificacion_estudiante',
    'medida_proteccion', 'medida_disciplinaria', 'medida_cautelar',
  ];
  // 'booleano' se sacó: una pregunta de Selección con las opciones "si"/"no"
  // hace exactamente lo mismo (abre un camino por opción, igual que cualquier
  // otra) y tener los dos tipos era el mismo concepto contado dos veces.
  readonly TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'seleccion'];
  readonly UNIDADES = ['horas', 'dias_habiles', 'dias_corridos'];
  readonly ACCIONES = ['notificar', 'escalar', 'marcar_alerta'];
  readonly PARTICIPACIONES = ['ejecutor', 'aprobador', 'notificado'];
  /** A quiénes alcanza el paso. Vacío = al caso, una sola vez. */
  readonly ROLES_PASO = ['afectado', 'senalado', 'todos', 'testigo', 'denunciante'];
  /** Mismos valores que TIPOS_MEDIDA_REQUERIDA en flujoProtocolo.js. */
  readonly TIPOS_MEDIDA = ['proteccion', 'cautelar', 'disciplinaria', 'cualquiera'];

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
      por_involucrado_rol: p.por_involucrado_rol,
      requiere_notificacion: p.requiere_notificacion,
      accion_al_vencer: p.accion_al_vencer,
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

  /** `hay_senales_fisicas=si` → `¿Hay señales físicas? = Sí`.
   *
   * El valor pasa por `opcion_campo` y no por un `si`/`no` a mano: las
   * condiciones también comparan opciones de campos de selección
   * (`tipo_objeto=arma_de_fuego`), y traduciendo solo el sí y el no el resto
   * se escribía crudo, con guion bajo y sin tildes, encima de la flecha. */
  condicionLegible(condicion?: string | null): string {
    if (!condicion) return '';
    const [codigo, valor] = condicion.split('=');
    const campo = this.etiquetasCampo().get(codigo?.trim()) ?? humanizar(codigo ?? '');
    const v = (valor ?? '').trim();
    if (!v) return campo;
    return `${campo} = ${etiquetaDe(v, 'opcion_campo')}`;
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
   *  trabaja siempre con este.
   *
   *  Sale del nombre que traiga la fila y no de `esEstablecimiento`: un
   *  protocolo del colegio que todavía hereda el flujo devuelve las filas del
   *  catálogo tal cual (ver origenDelGrafo en el backend), con `id_paso`, aunque
   *  la ruta sea la del establecimiento. Decidiéndolo por la ruta, esos pasos
   *  quedaban con id `undefined` y el diagrama se dibujaba vacío. */
  idPaso = (p: any) => p?.id_paso_estab ?? p?.id_paso;
  idTransicion = (t: any) => t?.id_transicion_estab ?? t?.id_transicion;
  idCampo = (c: any) => c?.id_campo_estab ?? c?.id_campo;

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

  /** La clase acompaña a la casilla: destildarla y dejar la clase puesta hace
   *  que el paso vuelva a pedir esa medida apenas alguien remarque la casilla
   *  por otro motivo. El servidor normaliza igual; esto es para que el modal
   *  muestre lo que se va a guardar. */
  alCambiarRequiereMedida(marcado: boolean) {
    this.formPaso.requiere_medida = marcado;
    this.formPaso.tipo_medida_requerida = marcado
      ? (this.formPaso.tipo_medida_requerida ?? 'cualquiera')
      : null;
  }

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
          requiere_notificacion: false,
          requiere_medida: false,
          tipo_medida_requerida: null,
          orden_visual: (this.pasos().length + 1) * 10,
        };
    this.nombrePuestoPorElTipo = '';
    // Llegan como 0/1 desde MySQL; el checkbox necesita booleano o nace marcado.
    this.formPaso.requiere_notificacion = !!this.formPaso.requiere_notificacion;
    this.formPaso.requiere_medida = !!this.formPaso.requiere_medida;
    this.formPaso.por_involucrado_rol = this.formPaso.por_involucrado_rol ?? null;
    // Un paso que pide medida sin clase declarada se conforma con cualquiera:
    // es lo que hace el servidor, y el select tiene que decir lo mismo o el
    // usuario ve un campo vacío que en realidad ya tiene un valor.
    this.formPaso.tipo_medida_requerida = this.formPaso.requiere_medida
      ? (this.formPaso.tipo_medida_requerida ?? 'cualquiera')
      : null;

    this.rolesSeleccionados = paso
      ? (paso.roles ?? []).map((r: any) => ({
          rol_id: r.rol_id,
          tipo_participacion: r.tipo_participacion,
        }))
      : this.rolesPorDefecto();

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
      opciones: [...this.opciones(c)],
      opcionesTexto: this.opciones(c).map((o: string) => etiquetaDe(o, 'opcion_campo')),
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
      if (!this.esRamificable(c)) continue;
      c.ramas = this.valoresRama(c).map((valor) => {
        const t = salidas.find((s: any) => this.normalizarCondicion(s.condicion) === `${c.codigo}=${valor}`);
        if (t) consumidas.add(this.idTransicion(t));
        return {
          valor,
          idTransicion: t ? this.idTransicion(t) : null,
          // Sin transición todavía, la rama arranca en "crear un paso nuevo":
          // es lo que se quiere hacer nueve de cada diez veces y deja el input
          // del nombre a la vista sin un click previo.
          destino: this.destinoDeRama(t),
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

  /**
   * Con qué responsable nace un paso nuevo: el coordinador de convivencia como
   * ejecutor.
   *
   * Es quien conduce el procedimiento, así que es el ejecutor correcto nueve de
   * cada diez veces, y un paso sin ejecutor es un paso que nadie puede
   * completar —el caso se detiene ahí y el error aparece recién al publicar—.
   * Se puede cambiar o quitar en el mismo modal.
   *
   * Si los roles todavía no cargaron, o el colegio no tiene ese rol, el paso
   * nace sin responsable: es lo que pasaba siempre y no vale trabar el alta.
   */
  private rolesPorDefecto() {
    const coordinador = this.roles().find((r: any) => r.codigo === RolesEnum.ENCARGADO);
    return coordinador ? [{ rol_id: coordinador.rol_id, tipo_participacion: 'ejecutor' }] : [];
  }

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

  /**
   * ¿Esta pregunta abre caminos del flujo?
   *
   * Cualquier respuesta cerrada sirve, no solo un Sí/No: una pregunta con tres
   * opciones abre tres caminos. Cuando esto se limitaba a dos opciones, agregar
   * una tercera hacía desaparecer las ramas ya configuradas y borraba sus
   * transiciones al guardar.
   */
  /** El '¿Aprobado?' de un paso de aprobación no es una pregunta configurable:
   *  lo produce el acto de aprobar, y se ramifica desde las salidas. */
  esDeAprobacion(): boolean {
    return esPasoDeAprobacion(this.formPaso?.tipo_paso);
  }

  esRamificable(c: CampoEdit): boolean {
    return c.tipo_campo === 'seleccion' && this.opcionesLimpias(c).length >= 2;
  }

  /**
   * Qué mostrar en el selector de destino de una rama ya guardada. Una
   * transición hacia el propio paso se muestra como "este mismo paso" y no como
   * su nombre repetido en la lista: son la misma cosa dicha de dos formas.
   */
  private destinoDeRama(t: any): string {
    if (!t) return '__nuevo__';
    const actual = this.editando ? this.idPaso(this.editando) : null;
    return t.id_paso_destino === actual ? MISMO_PASO : String(t.id_paso_destino);
  }

  /** Respuestas de una pregunta que abren un camino del flujo: una por opción. */
  valoresRama(c: CampoEdit): string[] {
    return this.opcionesLimpias(c);
  }

  // ── Plantillas de paso ────────────────────────────────────────────────────

  /**
   * Qué trae la tarjeta elegida y no se ve en los campos del modal.
   *
   * Un paso de notificación emite un acta, uno de aprobación se firma en vez de
   * completarse, uno de medidas se registra además en su propia tarjeta del
   * caso. Nada de eso es un campo del formulario, así que sin decirlo el modal
   * se ve igual para las once opciones del desplegable.
   */
  notaDelTipo(): string {
    return PLANTILLAS.find((p) => p.tipo === this.formPaso?.tipo_paso)?.nota ?? '';
  }

  /**
   * Un paso de aprobación sin aprobador no se puede guardar: lo rechaza el
   * backend con un 409 al apretar Guardar. Se avisa acá, que es donde se
   * arregla, y no después de perder el viaje.
   */
  faltaAprobador(): boolean {
    return (
      esPasoDeAprobacion(this.formPaso?.tipo_paso) &&
      !this.rolesSeleccionados.some((r) => r.rol_id && r.tipo_participacion === 'aprobador')
    );
  }

  /** Elegir una de las tarjetas en el desplegable arma el paso entero. */
  onTipoPaso() {
    const plantilla = PLANTILLAS.find((p) => p.tipo === this.formPaso.tipo_paso);
    this.nombrarSegunTipo(plantilla);
    if (plantilla) this.aplicarPlantilla(plantilla);
    else for (const c of this.camposEdit) this.sincronizarRamas(c);
  }

  /**
   * El nombre del paso sigue al tipo mientras nadie lo haya escrito a mano.
   *
   * Elegir "Notificación al apoderado" y tener que volver a escribir eso mismo
   * en el nombre es trabajo repetido, y así los pasos se llaman igual en todos
   * los protocolos. Pero solo se reemplaza mientras el nombre esté vacío o siga
   * siendo el que puso el tipo anterior: apenas alguien lo edita, cambiar de
   * tipo ya no le pisa lo que escribió.
   */
  private nombrarSegunTipo(plantilla?: PlantillaPaso) {
    const nombre = this.formPaso.nombre?.trim() ?? '';
    if (nombre !== '' && nombre !== this.nombrePuestoPorElTipo) return;
    this.nombrePuestoPorElTipo =
      plantilla?.paso.nombre ?? etiquetaDe(this.formPaso.tipo_paso, 'tipo_paso');
    this.formPaso.nombre = this.nombrePuestoPorElTipo;
  }

  /**
   * Arma el paso con una plantilla, sin pisar lo que ya está escrito.
   *
   * Nada se sobrescribe salvo el tipo de paso, que es lo que se está eligiendo:
   * el nombre, la descripción, el plazo y a quién alcanza se completan solo si
   * están vacíos, las preguntas se agregan solo si su código no está ya, y los
   * responsables se suman a los que haya. Así se puede aplicar sobre un paso a
   * medio escribir sin perder nada, y aplicarla dos veces no duplica.
   */
  aplicarPlantilla(plantilla: PlantillaPaso) {
    const { paso } = plantilla;
    this.formPaso.tipo_paso = plantilla.tipo;
    if (!this.formPaso.nombre?.trim()) this.formPaso.nombre = paso.nombre;
    if (!this.formPaso.descripcion?.trim()) this.formPaso.descripcion = paso.descripcion;
    if (!this.formPaso.plazo_valor) {
      this.formPaso.plazo_valor = paso.plazo_valor;
      this.formPaso.plazo_unidad = paso.plazo_unidad;
    }
    if (paso.por_involucrado_rol && !this.formPaso.por_involucrado_rol)
      this.formPaso.por_involucrado_rol = paso.por_involucrado_rol;
    if (paso.requiere_notificacion) this.formPaso.requiere_notificacion = true;
    // Las tarjetas de medida ordenan una: sin esto el paso quedaba llamándose
    // "Medidas de protección" sin pedirle ninguna al caso, y el aviso de medida
    // pendiente no aparecía nunca. Se respeta lo ya marcado a mano, igual que
    // el resto de la plantilla.
    if (paso.requiere_medida && !this.formPaso.requiere_medida) {
      this.formPaso.requiere_medida = true;
      this.formPaso.tipo_medida_requerida = paso.tipo_medida_requerida ?? null;
    }

    for (const rol of plantilla.roles ?? []) {
      const fila = this.roles().find((r: any) => r.codigo === rol.codigo);
      if (!fila) continue;
      const yaEsta = this.rolesSeleccionados.some(
        (r) => r.rol_id === fila.rol_id && r.tipo_participacion === rol.tipo_participacion,
      );
      if (!yaEsta)
        this.rolesSeleccionados.push({
          rol_id: fila.rol_id,
          tipo_participacion: rol.tipo_participacion,
        });
    }

    for (const campo of plantilla.campos) {
      if (this.camposEdit.some((c) => c.codigo === campo.codigo)) continue;
      const opciones = [...(campo.opciones ?? [])];
      this.camposEdit.push({
        id: null,
        codigo: campo.codigo,
        etiqueta: campo.etiqueta,
        tipo_campo: campo.tipo_campo,
        opciones,
        opcionesTexto: opciones.map((o) => etiquetaDe(o, 'opcion_campo')),
        es_obligatorio: campo.es_obligatorio ?? true,
        dependeDeCampo: '',
        dependeDeValor: '',
        orden: this.camposEdit.length,
        // El código va escrito en la plantilla y no derivado de la pregunta: es
        // el que queda dentro de los datos del expediente y tiene que ser el
        // mismo en todos los protocolos para poder compararlos después.
        codigoManual: true,
        ramas: [],
      });
    }

    for (const c of this.camposEdit) this.sincronizarRamas(c);

    // Las respuestas que repiten el paso (el "no" de un seguimiento) vienen con
    // ese destino elegido. Es un destino como cualquier otro y se puede
    // cambiar: solo viene puesto de entrada.
    for (const campo of plantilla.campos)
      for (const valor of campo.repiteEn ?? []) {
        const rama = this.camposEdit
          .find((c) => c.codigo === campo.codigo)
          ?.ramas.find((r) => r.valor === valor);
        if (rama && rama.destino === '__nuevo__') rama.destino = MISMO_PASO;
      }
  }

  agregarCampo() {
    this.camposEdit.push({
      id: null,
      codigo: '',
      etiqueta: '',
      tipo_campo: 'texto',
      opciones: [],
      opcionesTexto: [],
      es_obligatorio: true,
      dependeDeCampo: '',
      dependeDeValor: '',
      orden: this.camposEdit.length,
      codigoManual: false,
      ramas: [],
    });
  }

  private ramaVacia(valor: string): RamaEdit {
    return {
      valor,
      idTransicion: null,
      // Sin transición todavía, la rama arranca en "crear un paso nuevo": es lo
      // que se quiere hacer nueve de cada diez veces.
      destino: '__nuevo__',
      nombreNuevo: '',
    };
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
      .filter((c) => c.tipo_campo === 'seleccion' && c.codigo);
  }

  /** Respuestas posibles del campo del que depende `c`. */
  valoresDependencia(c: CampoEdit): string[] {
    const padre = this.camposEdit.find((x) => x.codigo === c.dependeDeCampo);
    return padre ? this.opcionesLimpias(padre) : [];
  }

  /** Al cambiar de qué campo depende, el valor viejo puede no existir en el nuevo. */
  onDependeDeCampo(c: CampoEdit) {
    if (!c.dependeDeCampo) { c.dependeDeValor = ''; return; }
    const valores = this.valoresDependencia(c);
    if (!valores.includes(c.dependeDeValor)) c.dependeDeValor = valores[0] ?? '';
  }

  esSiNo(c: CampoEdit): boolean {
    if (c.tipo_campo !== 'seleccion') return false;
    const ops = this.opcionesLimpias(c).map((o) => o.toLowerCase());
    return ops.length === 2 && ops.includes('si') && ops.includes('no');
  }

  /** Al cambiar el tipo de un campo pueden aparecer o desaparecer sus ramas. */
  onTipoCampo(c: CampoEdit) {
    if (c.tipo_campo === 'seleccion' && this.opcionesLimpias(c).length === 0) {
      c.opciones = ['si', 'no'];
      c.opcionesTexto = ['Sí', 'No'];
    }
    this.sincronizarRamas(c);
  }

  // ── Opciones de una pregunta de selección ─────────────────────────────────
  //
  // Una opción por input y no todas separadas por coma en uno solo: escritas en
  // una línea, una opción que llevaba coma adentro se partía en dos sin aviso, y
  // no había forma de ver cuántas había ni de borrar una sola.

  agregarOpcion(c: CampoEdit) {
    c.opciones.push('');
    c.opcionesTexto.push('');
  }

  quitarOpcion(c: CampoEdit, i: number) {
    c.opciones.splice(i, 1);
    c.opcionesTexto.splice(i, 1);
    // Quitar una de las dos opciones de un Sí/No deja de ser una bifurcación:
    // las ramas se recalculan igual que al cambiar el tipo de la pregunta.
    this.sincronizarRamas(c);
  }

  /**
   * El usuario escribe la respuesta como la va a leer quien complete el paso
   * ("Sí", "Salida pedagógica"); lo que se guarda es su código.
   *
   * El texto tecleado NO se toca: reescribir el input en cada tecla con el
   * código normalizado impediría escribir un espacio (se convertiría en '_'
   * antes de poder seguir) y movería el cursor.
   */
  onOpcion(c: CampoEdit, i: number, texto: string) {
    c.opcionesTexto[i] = texto;
    // `'Sí'` → `'si'`, `'Salida pedagógica'` → `'salida_pedagogica'`: el mismo
    // saneo que el código de una pregunta, porque el valor viaja igual de crudo
    // dentro de la condición de una salida (`campo=si`).
    c.opciones[i] = this.aSlug(texto);
    this.sincronizarRamas(c);
  }

  sincronizarRamas(c: CampoEdit) {
    if (this.esRamificable(c)) {
      const valores = this.valoresRama(c);
      // Las ramas que siguen correspondiendo se conservan tal cual: agregar una
      // opción nueva no puede hacer perder el destino ya elegido para las
      // anteriores. Solo la que dejó de existir se lleva su transición, que
      // quedaría con una condición sobre una respuesta que ya no se puede dar.
      for (const r of c.ramas)
        if (!valores.includes(r.valor) && r.idTransicion) this.salidasEliminadas.push(r.idTransicion);
      c.ramas = valores.map((v) => c.ramas.find((r) => r.valor === v) ?? this.ramaVacia(v));
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
    const base = this.aSlug(texto);
    // Tiene que empezar con letra: una pregunta que arranca con número
    // ("2 o más veces") daría un código que el backend rechaza.
    return /^[a-z]/.test(base) ? base : base ? `campo_${base}`.slice(0, 50) : '';
  }

  /** Sin tildes, sin ñ, sin mayúsculas y con '_' en vez de espacios: la forma
   *  en que están escritos los códigos en la BD. Es la base del código de una
   *  pregunta y también el valor guardado de una opción — con la diferencia de
   *  que una opción sí puede empezar con número ("3 o más"). */
  private aSlug(texto: string): string {
    return (texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // tildes, ya separadas por el NFD
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)
      .replace(/_+$/, '');
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
      .filter((c) => c.tipo_campo === 'seleccion' && c.codigo)
      .map((c) => ({
        codigo: c.codigo,
        etiqueta: c.etiqueta || c.codigo,
        opciones: this.opcionesLimpias(c),
      }));
    // Un paso de aprobación decide por su resultado, que no es un campo configurado.
    if (esPasoDeAprobacion(this.formPaso?.tipo_paso))
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
      if (c.tipo_campo === 'seleccion' && this.opcionesLimpias(c).length < 2)
        return this.error.set(`La pregunta "${c.etiqueta}" necesita al menos dos opciones.`);
      if (c.dependeDeCampo && !c.dependeDeValor)
        return this.error.set(
          `Falta indicar con qué respuesta de "${c.dependeDeCampo}" aparece la pregunta "${c.etiqueta}".`,
        );
      for (const r of c.ramas)
        if (r.destino === '__nuevo__' && r.nombreNuevo.trim() === '' && this.hayAlgunaRama(c))
          return this.error.set(
            `Falta el nombre del paso que sigue cuando "${c.etiqueta}" se responde ${etiquetaDe(r.valor, 'opcion_campo')}.`,
          );
    }
    for (const s of this.salidasEdit)
      if (!s.id_paso_destino) return this.error.set('Cada salida necesita el paso en el que continúa.');
    for (const p of this.previosEdit)
      if (!p.id_paso_origen) return this.error.set('Cada paso previo necesita indicar de qué paso viene.');

    this.guardando.set(true);
    try {
      // Todo el paso viaja en un solo envío y se escribe en una transacción.
      //
      // Antes se guardaba de a pedazos: un request por el paso, otro por los
      // responsables, uno por cada pregunta y uno por cada rama. Contra la base
      // remota (~270 ms por consulta) eso eran unos quince segundos, y si
      // fallaba el sexto request los cinco anteriores ya estaban escritos: el
      // paso quedaba a medio guardar y había que recargar para ver en qué
      // estado había quedado.

      // Los pasos que el usuario pide crear al vuelo desde una rama ("que siga
      // en un paso nuevo llamado X"). Van en el mismo envío porque todavía no
      // tienen id; las ramas los apuntan por la clave y el backend la traduce.
      const pasosNuevos: { clave: string; nombre: string; orden_visual: number }[] = [];
      const claveDeRama = new Map<RamaEdit, string>();
      for (const c of this.camposEdit) {
        if (!this.esRamificable(c)) continue;
        for (const r of c.ramas) {
          if (r.destino !== '__nuevo__' || !r.nombreNuevo.trim()) continue;
          const clave = `n${pasosNuevos.length}`;
          pasosNuevos.push({
            clave,
            nombre: r.nombreNuevo.trim(),
            orden_visual: (this.pasos().length + this.camposEdit.length + pasosNuevos.length + 1) * 10,
          });
          claveDeRama.set(r, clave);
        }
      }

      const campos = this.camposEdit.map((c, i) => ({
        id_campo: c.id,
        codigo: c.codigo,
        etiqueta: c.etiqueta,
        tipo_campo: c.tipo_campo,
        es_obligatorio: c.es_obligatorio,
        depende_de:
          c.dependeDeCampo && c.dependeDeValor ? `${c.dependeDeCampo}=${c.dependeDeValor}` : null,
        orden: i,
        opciones: c.tipo_campo === 'seleccion' ? this.opcionesLimpias(c) : null,
      }));

      // '@paso' es el que se está guardando: al crearlo todavía no tiene id, y
      // el backend lo reemplaza por el real después del INSERT.
      const transiciones: any[] = [];
      const transicionesEliminadas = [...this.salidasEliminadas, ...this.previosEliminados];

      // Las dos ramas de cada pregunta Sí/No.
      for (const c of this.camposEdit) {
        if (!this.esRamificable(c)) continue;
        for (const r of c.ramas) {
          const clave = claveDeRama.get(r);
          const destino = clave
            ? `@nuevo:${clave}`
            : r.destino === MISMO_PASO
              ? '@paso'
              : r.destino === '' || r.destino === '__nuevo__'
                ? null
                : Number(r.destino);
          // La rama se quedó sin destino: si tenía una transición, se va.
          if (destino === null) {
            if (r.idTransicion) transicionesEliminadas.push(r.idTransicion);
            r.idTransicion = null;
            continue;
          }
          transiciones.push({
            id_transicion: r.idTransicion,
            id_paso_origen: '@paso',
            id_paso_destino: destino,
            condicion: `${c.codigo}=${r.valor}`,
            etiqueta: etiquetaDe(r.valor, 'opcion_campo'),
            es_default: false,
          });
        }
      }

      // El resto de las salidas.
      for (const s of this.salidasEdit)
        transiciones.push({
          id_transicion: s.id,
          id_paso_origen: '@paso',
          id_paso_destino: s.id_paso_destino,
          condicion:
            s.condicionCampo && s.condicionValor ? `${s.condicionCampo}=${s.condicionValor}` : null,
          etiqueta: s.etiqueta || null,
          es_default: s.es_default,
        });

      // Los pasos previos. Es una salida del otro paso, pero se guarda con el
      // mismo botón: quien lo asignó acá espera verlo conectado al cerrar.
      for (const p of this.previosEdit)
        transiciones.push({
          id_transicion: p.id,
          id_paso_origen: p.id_paso_origen,
          id_paso_destino: '@paso',
          condicion: p.condicion || null,
          etiqueta: p.etiqueta || null,
          es_default: false,
        });

      const cuerpo = {
        paso: this.formPaso,
        roles: this.rolesSeleccionados.filter((r) => r.rol_id),
        campos,
        campos_eliminados: this.camposEliminados,
        transiciones,
        transiciones_eliminadas: transicionesEliminadas,
        pasos_nuevos: pasosNuevos,
      };

      const idP = this.editando ? this.idPaso(this.editando) : null;
      const resp: any = await firstValueFrom(
        this.esEstablecimiento
          ? this.api.guardarPasoCompletoEstablecimiento(this.id, idP, cuerpo)
          : this.api.guardarPasoCompletoGenerico(this.id, idP, cuerpo),
      );

      this.mostrarPaso.set(false);
      this.success.set(this.editando ? 'Paso actualizado' : 'Paso creado');
      // La respuesta ya trae el grafo tal como quedó escrito: repintar con eso
      // ahorra el request de recarga, que era otra ida y vuelta completa.
      if (resp?.grafo) {
        this.grafo.set(resp.grafo);
        this.validar(true);
      } else {
        this.cargar();
      }
    } catch (err: any) {
      // No se recarga: el guardado es una transacción, así que si falló no se
      // escribió nada y lo que hay en el modal sigue siendo lo que hay que
      // corregir. Recargar acá borraba el trabajo del usuario.
      this.error.set(err?.error?.message ?? 'No se pudo guardar el paso');
    } finally {
      this.guardando.set(false);
    }
  }

  /** Las opciones escritas, sin las vacías que quedan mientras se edita. */
  private opcionesLimpias(c: CampoEdit): string[] {
    return c.opciones.map((o) => o.trim()).filter(Boolean);
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

  /**
   * El paso inicial de un flujo es uno solo: dos puntos de entrada dejarían el
   * motor sin saber por dónde arranca un caso nuevo. Si otro paso ya lo tiene,
   * se devuelve acá para deshabilitar el checkbox y decir cuál es, en vez de
   * dejar que se marquen dos y que el guardado falle sin explicación.
   */
  otroPasoInicial() {
    const actual = this.editando ? this.idPaso(this.editando) : null;
    return this.pasos().find((p: any) => p.es_paso_inicial && this.idPaso(p) !== actual) ?? null;
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

  /**
   * Pasos a los que continúa el que se está editando según una respuesta
   * Sí/No. Se lee de lo que hay en el modal y no del grafo guardado: una rama
   * recién elegida en la pregunta tiene que verse acá arriba antes de guardar.
   *
   * Las salidas propias del paso (antes "Otras salidas") ya no se resumen acá:
   * se editan una por una en "Continúa en", arriba mismo, así que listarlas
   * de nuevo en una línea sería repetir lo que ya está a la vista.
   */
  pasosSiguientesPregunta(): string[] {
    const actual = this.editando ? this.idPaso(this.editando) : null;
    const nombres: string[] = [];
    for (const c of this.camposEdit) {
      if (!this.esRamificable(c)) continue;
      for (const r of c.ramas) {
        if (r.destino === '' || r.destino === MISMO_PASO) continue;
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
