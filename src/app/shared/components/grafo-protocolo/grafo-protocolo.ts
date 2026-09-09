import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { etiquetaDe } from '../../pipes/etiqueta.pipe';

/** Nodo del grafo, ya normalizado por quien lo usa. */
export interface NodoGrafo {
  id: number;
  nombre: string;
  tipo_paso: string;
  es_paso_inicial?: boolean | number;
  es_paso_final?: boolean | number;
  /** Solo en ejecución: pinta el nodo según por dónde va el caso. */
  estado?: string;
  plazo?: string;
  /** Contra quién se cumple el paso: afectado, senalado, todos… Vacío = paso
   *  del caso, que se hace una sola vez. */
  por_involucrado_rol?: string | null;
  /** El paso no está completo hasta que la persona notificada deja constancia. */
  requiere_notificacion?: boolean | number;
  /** Qué pasa si el plazo vence. 'escalar' es la marca de un plazo legal duro
   *  (la denuncia de 24 h), y por eso cambia el color del nodo. */
  accion_al_vencer?: string | null;
}

export interface AristaGrafo {
  origen: number;
  destino: number;
  /** Cruda, tal como se evalúa: `codigo=valor`. Va al tooltip. */
  condicion?: string | null;
  /** La misma condición escrita para leer ("¿Hay señales físicas? = Sí"). */
  condicion_legible?: string | null;
  etiqueta?: string | null;
  es_default?: boolean | number;
}

/**
 * Lo que se puede hacer sobre un paso desde el propio diagrama.
 *
 * Antes eran cinco (paso, roles, campos, salidas, eliminar), una por cada
 * modal del editor. Ahora el paso se edita entero en un solo modal, así que
 * la caja del diagrama solo necesita abrirlo o borrar el paso.
 */
export type AccionNodo = 'editar' | 'eliminar';

interface NodoUbicado extends NodoGrafo {
  x: number;
  y: number;
  nivel: number;
  /** El nombre ya repartido en las líneas que caben dentro de la caja. */
  lineas: string[];
  /** `tipo · plazo`, recortado a lo que entra. */
  meta: string;
  /** Segunda línea de meta: contra quién se cumple y si pide constancia.
   *  Vacía en los pasos del caso, que no llevan ninguna de las dos. */
  meta2: string;
  /** Los seis puntos del hexágono, ya calculados, cuando el paso ramifica. */
  puntos: string;
}

/**
 * Cuánto antes del borde de la caja termina una flecha de retroceso.
 *
 * Terminando justo sobre el borde, la punta se confundía con el contorno del
 * paso (o quedaba tapada: las cajas se dibujan después de las aristas) y la
 * línea discontinua parecía morir sin indicar hacia dónde vuelve.
 */
const SEPARACION_PUNTA = 7;

/** Separación horizontal entre carriles de retroceso, y vertical entre los que
 *  comparten paso de salida o de llegada. */
const ANCHO_CARRIL = 30;
const SEPARACION_CARRIL = 20;

/**
 * Cuánto se separan entre sí los tramos horizontales que viajan por la misma
 * franja entre filas.
 *
 * Dos retrocesos que salen de pasos distintos de la misma fila terminaban
 * corriendo por exactamente la misma y: se veía una sola línea discontinua
 * atravesando el diagrama y no se sabía cuál de las dos flechas era. El carril
 * de cada uno ya es único por costado, así que sirve para escalonarlos también
 * en vertical.
 */
const SEPARACION_BANDA = 8;

interface AristaDibujada {
  d: string;
  /** La etiqueta partida en líneas y recortada para que no se monte sobre las
   *  cajas vecinas. */
  lineas: string[];
  /** Completo, para el tooltip cuando el recorte esconde algo. */
  titulo: string;
  /** Una arista que retrocede es un reintento ("volver a investigar"), y se
   *  dibuja distinto para que se lea como tal y no como un paso más. */
  atras: boolean;
  lx: number;
  ly: number;
  /** Solo en los retrocesos que van por un carril: x del carril propio, para
   *  tirar una guía desde el rótulo hasta su línea. Los rótulos de todos los
   *  carriles de un costado se escriben alineados por fuera del más externo,
   *  así que sin la guía no se sabe cuál es de cuál. */
  guiaX?: number;
  /** Hacia qué lado se escribe el rótulo desde `lx`. */
  anclaje?: 'start' | 'end';
}

/**
 * Dibuja el grafo de un protocolo como diagrama.
 *
 * El layout se calcula acá y no con una librería: son grafos de menos de una
 * docena de nodos y una sola forma (de arriba hacia abajo por nivel), así que
 * traer un motor de layout completo agregaría una dependencia y un bundle
 * grande para resolver algo que son treinta líneas.
 *
 * El flujo va en vertical, como un protocolo escrito: cada nivel es una fila,
 * los pasos hermanos se reparten en horizontal y cada fila queda centrada
 * respecto de la más ancha, así que el camino principal se lee como una
 * columna. Es la forma en que se leen los diagramas de protocolo en papel, y
 * además una página scrollea en vertical de por sí.
 *
 * Los ciclos son parte del modelo — "si no está resuelto, volver a la
 * investigación" — así que el nivel de cada nodo se calcula por distancia más
 * corta desde el inicial y las aristas que retroceden se dibujan por el
 * costado izquierdo, en vez de intentar aplanar el grafo en un árbol que no es.
 */
@Component({
  selector: 'app-grafo-protocolo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grafo-protocolo.html',
  styleUrl: './grafo-protocolo.scss',
})
export class GrafoProtocolo {
  nodos = input.required<NodoGrafo[]>();
  aristas = input.required<AristaGrafo[]>();
  /**
   * Muestra la barra de acciones dentro de cada caja (editar el paso, sus
   * responsables, sus campos, sus salidas, borrarlo). Va apagada por defecto
   * porque el mismo diagrama se usa para mirar un caso en curso, donde no hay
   * nada que editar.
   */
  acciones = input(false);
  /** Id del paso que la pantalla está mostrando en su panel de detalle: se
   *  marca en el dibujo para no perder de vista cuál se está mirando. */
  seleccionado = input<number | null>(null);
  /** Se emite al hacer click en un nodo: la pantalla decide qué abrir. */
  seleccionar = output<NodoGrafo>();
  /** Click en uno de los botones de la barra de acciones del nodo. */
  accion = output<{ nodo: NodoGrafo; accion: AccionNodo }>();

  /** Los botones de la barra, en el orden en que se dibujan. */
  readonly BOTONES: { accion: AccionNodo; icono: string; titulo: string; peligro?: boolean }[] = [
    { accion: 'editar', icono: 'ti-pencil', titulo: 'Editar el paso: nombre, plazo, responsables, preguntas y salidas' },
    { accion: 'eliminar', icono: 'ti-trash', titulo: 'Eliminar paso', peligro: true },
  ];

  readonly ANCHO = 190;
  /** Cuánto se mete la punta del hexágono de los pasos que ramifican. */
  private readonly PUNTA = 16;

  // ── Alto de la caja ───────────────────────────────────────────────────────
  //
  // El alto sale del nombre más largo del grafo y no es fijo: los nombres de
  // los pasos son frases completas ("Notificación de los hechos y descargos de
  // la persona señalada") y recortarlas obliga a pasar el mouse por encima
  // para saber qué paso es.
  //
  // Todas las cajas miden lo mismo aunque solo una necesite cuatro líneas.
  // Alturas por nodo obligarían a recalcular el apilado vertical y el anclaje
  // de todas las flechas, que hoy se resuelven con ALTO() y salen gratis
  // mientras sea uniforme.
  private readonly TOP = 24;
  private readonly ALTO_NOMBRE = 16;
  private readonly GAP_META = 20;
  private readonly ALTO_META = 14;
  private readonly BOTTOM = 12;
  private readonly RESERVA_ACCIONES = 34;

  ALTO = computed(
    () =>
      this.TOP +
      (this.maxLineas() - 1) * this.ALTO_NOMBRE +
      this.GAP_META +
      (this.hayMeta2() ? this.ALTO_META : 0) +
      this.BOTTOM +
      (this.acciones() ? this.RESERVA_ACCIONES : 0),
  );

  /** Ancho de texto útil: el hexágono tiene los lados en punta, así que su
   *  texto necesita más margen para no montarse sobre el borde inclinado. */
  private utilDe(id: number) {
    return this.ANCHO - (this.ramifican().has(id) ? this.PAD_HEX : this.PAD_CAJA) * 2;
  }

  /** El nombre de cada nodo repartido en líneas, sin recortar nunca. */
  private lineasPorNodo = computed<Map<number, string[]>>(() => {
    const mapa = new Map<number, string[]>();
    for (const n of this.nodos())
      mapa.set(
        n.id,
        this.repartir(n.nombre, this.utilDe(n.id), !!(n.es_paso_inicial || n.es_paso_final)),
      );
    return mapa;
  });

  private maxLineas = computed(() =>
    Math.max(1, ...[...this.lineasPorNodo().values()].map((l) => l.length)),
  );

  /** Si ningún paso lleva segunda línea de meta, no se le reserva alto. */
  private hayMeta2 = computed(() => this.nodos().some((n) => this.textoMeta2(n) !== ''));

  /**
   * Hueco horizontal entre dos pasos hermanos de la misma fila.
   *
   * Con el flujo en vertical la etiqueta de la condición ya no vive en este
   * hueco (vive en el de arriba), pero sí determina cuánto se separan entre sí
   * las etiquetas de las dos ramas de una decisión: quedan a mitad de camino
   * entre el paso que decide y cada hijo, o sea a (ANCHO + GAP_X) / 2 una de
   * otra. Por eso el hueco crece con la etiqueta más larga, con tope: separar
   * demasiado las ramas deja de mostrarlas como dos caminos del mismo paso.
   */
  private readonly GAP_X_MIN = 80;
  private readonly GAP_X_MAX = 220;
  GAP_X = computed(() => {
    // La etiqueta se escribe en dos líneas (pregunta y valor), así que la
    // separación la pide la línea más larga y no la etiqueta entera.
    const necesario = Math.max(
      0,
      ...this.aristas().flatMap((a) =>
        this.partirEtiqueta(this.textoArista(a)).map((l) => this.anchoAprox(l, 11)),
      ),
    );
    return Math.round(Math.min(this.GAP_X_MAX, Math.max(this.GAP_X_MIN, necesario / 2)));
  });

  /**
   * Hueco vertical entre filas: acá es donde va la flecha del camino principal
   * con su etiqueta, así que se reserva el alto de la etiqueta más alta. Con un
   * hueco fijo de 26px la pregunta de cada decisión quedaba escrita encima de
   * la caja de abajo.
   */
  private readonly GAP_Y_MIN = 52;
  /** Tope de líneas apiladas que se le reservan al hueco: un paso con seis
   *  salidas rotuladas separaría sus dos filas media pantalla, y a esa altura
   *  el problema deja de ser que los rótulos se pisen. */
  private readonly MAX_LINEAS_APILADAS = 8;
  GAP_Y = computed(() => {
    // Un paso que abre varias ramas escribe TODOS sus rótulos en el mismo
    // hueco, uno debajo del otro (los separa el desempate de `dibujadas`). Con
    // el alto de una sola etiqueta, las de más abajo se salían del hueco y
    // terminaban escritas encima de las cajas de la fila siguiente —o detrás,
    // que las cajas se dibujan después—. Se reserva el alto del paso que más
    // rótulos apila. Se cuenta por fila y no por paso: dos pasos hermanos
    // escriben en el mismo hueco, y aunque estén lejos en horizontal el
    // desempate los puede terminar cruzando.
    const nivel = this.niveles();
    const porFila = new Map<number, number>();
    let unaSola = 0;
    for (const a of this.aristas()) {
      const lineas = this.partirEtiqueta(this.textoArista(a)).length;
      unaSola = Math.max(unaSola, lineas);
      // Solo las que avanzan: los retrocesos rotulan por fuera del diagrama.
      const o = nivel.get(a.origen);
      const d = nivel.get(a.destino);
      if (o === undefined || d === undefined || d <= o) continue;
      porFila.set(o, (porFila.get(o) ?? 0) + lineas);
    }
    const apiladas = Math.min(
      this.MAX_LINEAS_APILADAS,
      Math.max(unaSola, ...porFila.values()),
    );
    return this.GAP_Y_MIN + apiladas * this.ALTO_LINEA;
  });

  private readonly PAD = 20;
  /** Margen interno de la caja: 12 por lado. */
  private readonly PAD_CAJA = 12;
  /** El del hexágono, más ancho: sus lados se inclinan hacia adentro y con 12
   *  la primera línea del nombre roza el borde. */
  private readonly PAD_HEX = 22;
  /** La primera línea comparte fila con la marca de inicial/final. */
  private readonly ESPACIO_MARCA = 18;

  /**
   * Nivel de cada paso: distancia más corta desde el paso inicial.
   *
   * Se calcula aparte de `ubicados` y no adentro porque los márgenes del
   * lienzo (el que reserva los carriles de retroceso a la izquierda) dependen
   * de qué aristas retroceden, y eso se sabe con los niveles; si el nivel
   * viviera dentro de `ubicados`, márgenes y posiciones se necesitarían
   * mutuamente.
   *
   * Lo que no se alcanza (un paso recién creado, todavía sin conectar) va a
   * una fila al final, visible en vez de encimado en el origen.
   */
  private niveles = computed<Map<number, number>>(() => {
    const nivel = new Map<number, number>();
    const nodos = this.nodos();
    if (nodos.length === 0) return nivel;

    const salientes = new Map<number, number[]>();
    for (const a of this.aristas()) {
      if (!salientes.has(a.origen)) salientes.set(a.origen, []);
      salientes.get(a.origen)!.push(a.destino);
    }

    const inicial = nodos.find((n) => n.es_paso_inicial) ?? nodos[0];
    const cola = [inicial.id];
    nivel.set(inicial.id, 0);
    while (cola.length) {
      const actual = cola.shift()!;
      for (const destino of salientes.get(actual) ?? [])
        if (!nivel.has(destino)) {
          nivel.set(destino, nivel.get(actual)! + 1);
          cola.push(destino);
        }
    }
    const maxNivel = Math.max(0, ...nivel.values());
    for (const n of nodos) if (!nivel.has(n.id)) nivel.set(n.id, maxNivel + 1);
    return nivel;
  });

  /**
   * Dónde cae cada paso dentro del bloque de cajas, sin contar los márgenes.
   *
   * Va aparte de `ubicados` porque los márgenes dependen de por qué costado
   * rodea cada retroceso, y eso se decide comparando posiciones: con la x
   * definitiva (que ya incluye el margen) el cálculo se necesitaría a sí mismo.
   * Los márgenes solo corren el bloque entero, así que la posición relativa
   * alcanza para decidir.
   */
  private disposicion = computed(() => {
    const nivel = this.niveles();
    const porNivel = new Map<number, NodoGrafo[]>();
    for (const n of this.nodos()) {
      const l = nivel.get(n.id) ?? 0;
      if (!porNivel.has(l)) porNivel.set(l, []);
      porNivel.get(l)!.push(n);
    }

    // Cada fila se centra respecto de la más ancha: así el camino principal
    // queda como una columna al medio y las ramas se abren simétricas, en vez
    // de que todo se apoye contra el borde izquierdo.
    const anchoDe = (cuantos: number) => cuantos * this.ANCHO + (cuantos - 1) * this.GAP_X();
    const anchoMax = Math.max(0, ...[...porNivel.values()].map((g) => anchoDe(g.length)));

    const xRel = new Map<number, number>();
    for (const [, delNivel] of porNivel) {
      const inicio = (anchoMax - anchoDe(delNivel.length)) / 2;
      delNivel.forEach((n, i) => xRel.set(n.id, inicio + i * (this.ANCHO + this.GAP_X())));
    }
    return { anchoMax, xRel, porNivel };
  });

  ubicados = computed<NodoUbicado[]>(() => {
    const nodos = this.nodos();
    if (nodos.length === 0) return [];
    const { xRel, porNivel } = this.disposicion();

    const salida: NodoUbicado[] = [];
    const izquierda = this.PAD + this.margenIzquierdo();
    const arriba = this.PAD + this.margenSuperior();
    for (const [l, delNivel] of porNivel) {
      delNivel.forEach((n) => {
        // x e y en variables y no repetidos en cada campo: el hexágono tiene
        // que caer exactamente sobre la caja que reemplaza, y con la fórmula
        // escrita dos veces basta tocar una para que se desalineen.
        const x = Math.round(izquierda + (xRel.get(n.id) ?? 0));
        const y = arriba + l * (this.ALTO() + this.GAP_Y());
        const util = this.utilDe(n.id);
        salida.push({
          ...n,
          nivel: l,
          x,
          y,
          lineas: this.lineasPorNodo().get(n.id) ?? [n.nombre],
          meta: this.recortar(
            n.plazo
              ? `${etiquetaDe(n.tipo_paso, 'tipo_paso')} · ${n.plazo}`
              : etiquetaDe(n.tipo_paso, 'tipo_paso'),
            util,
            11,
          ),
          meta2: this.recortar(this.textoMeta2(n), util, 11),
          puntos: this.hexagono(x, y),
        });
      });
    }
    return salida;
  });

  /**
   * Los retrocesos que cruzan filas, en el orden en que se dibujan.
   *
   * Se calculan aparte porque cada uno necesita su propio carril vertical por
   * fuera del diagrama: si todos subieran pegados al borde de las cajas, dos o
   * tres retrocesos de la misma zona (el bloque de apelación: "no aprobado",
   * "sin apelación", "volver a la investigación") se superpondrían entre sí y
   * no se podría seguir ninguno.
   */
  private retrocesos = computed(() => {
    const nivel = this.niveles();
    return this.aristas().filter((a) => {
      const o = nivel.get(a.origen);
      const d = nivel.get(a.destino);
      return o !== undefined && d !== undefined && a.origen !== a.destino && d < o;
    });
  });

  /** Retrocesos entre dos pasos de la misma fila: rodean por arriba. */
  private enFila = computed(() => {
    const nivel = this.niveles();
    return this.aristas().filter((a) => {
      const o = nivel.get(a.origen);
      const d = nivel.get(a.destino);
      return o !== undefined && d !== undefined && a.origen !== a.destino && d === o;
    });
  });

  /**
   * Por qué costado rodea cada retroceso, y en qué carril de ese costado.
   *
   * Mandarlos todos por la izquierda dejaba las flechas que vuelven a un paso
   * de la derecha (por ejemplo "apareció la especie → cierre del caso")
   * atravesando el diagrama entero por detrás de dos o tres cajas. Cada uno
   * rodea ahora por el lado que le queda más cerca: se mide cuánto hay del par
   * origen/destino a cada borde del bloque de cajas y gana el más corto.
   *
   * Los carriles se numeran por costado, así que dos retrocesos de lados
   * distintos no se reservan espacio el uno al otro.
   */
  private carriles = computed(() => {
    const { anchoMax, xRel } = this.disposicion();
    const izq: AristaGrafo[] = [];
    const der: AristaGrafo[] = [];
    for (const a of this.retrocesos()) {
      const xo = xRel.get(a.origen) ?? 0;
      const xd = xRel.get(a.destino) ?? 0;
      const hastaIzquierda = Math.min(xo, xd);
      const hastaDerecha = anchoMax - (Math.max(xo, xd) + this.ANCHO);
      (hastaDerecha < hastaIzquierda ? der : izq).push(a);
    }
    const lado = new Map<AristaGrafo, 'izq' | 'der'>();
    const carril = new Map<AristaGrafo, number>();
    izq.forEach((a, i) => (lado.set(a, 'izq'), carril.set(a, i)));
    der.forEach((a, i) => (lado.set(a, 'der'), carril.set(a, i)));
    return { lado, carril, izq, der };
  });

  /** Lo que ocupan los carriles de un costado más el rótulo más largo de los
   *  retrocesos que van por ahí: los rótulos se escriben por fuera del carril
   *  para no caer encima de las cajas. */
  private anchoCarriles(lado: AristaGrafo[]) {
    if (lado.length === 0) return 0;
    const rotulo = Math.max(0, ...lado.map((a) => this.anchoEtiqueta(this.textoArista(a))));
    // 28 hasta el primer carril + los carriles + los 14 de aire hasta el
    // rótulo, que se escribe entero por fuera del carril más externo.
    return 28 + (lado.length - 1) * ANCHO_CARRIL + 14 + rotulo;
  }

  /**
   * Cuánto se sale del bloque de cajas, por cada costado, el rótulo de una
   * flecha que avanza.
   *
   * Esos rótulos van centrados en el medio del tramo, y son frases enteras
   * ("¿El estudiante sigue activo en el establecimiento? = No", 340 px) sobre
   * un bloque que puede medir 190: el texto se salía del lienzo y el navegador
   * lo cortaba contra el borde del SVG, dejándolo empezado por la mitad.
   *
   * Se mide con las posiciones relativas y no con las finales porque el
   * resultado es justamente lo que corre el bloque: con la x definitiva, el
   * cálculo se necesitaría a sí mismo. Los retrocesos no entran acá: rotulan
   * por fuera de los carriles, que ya reservan su propio ancho.
   */
  private desbordeRotulos = computed(() => {
    const { xRel, anchoMax } = this.disposicion();
    const nivel = this.niveles();
    let izq = 0;
    let der = 0;
    for (const a of this.aristas()) {
      if (a.origen === a.destino) continue;
      const xo = xRel.get(a.origen);
      const xd = xRel.get(a.destino);
      const no = nivel.get(a.origen);
      const nd = nivel.get(a.destino);
      if (xo === undefined || xd === undefined || no === undefined || nd === undefined) continue;
      if (nd < no) continue;
      const centro = (xo + xd) / 2 + this.ANCHO / 2;
      const mitad = this.anchoEtiqueta(this.textoArista(a)) / 2;
      izq = Math.max(izq, mitad - centro);
      der = Math.max(der, centro + mitad - anchoMax);
    }
    return { izq: Math.max(0, Math.round(izq)), der: Math.max(0, Math.round(der)) };
  });

  /** Margen izquierdo: los carriles de retroceso que rodean por ese lado, o el
   *  rótulo que más se sale por la izquierda si ese es más ancho. */
  private margenIzquierdo = computed(() =>
    Math.max(
      0,
      this.anchoCarriles(this.carriles().izq) - this.PAD,
      this.desbordeRotulos().izq,
    ),
  );

  /** Margen superior: los retrocesos dentro de una misma fila rodean por
   *  arriba, y la primera fila necesita aire o el arco se corta contra el
   *  borde del lienzo. */
  private margenSuperior = computed(() => {
    const cuantos = this.enFila().length;
    if (cuantos === 0) return 0;
    return Math.max(0, 38 - this.PAD + (cuantos - 1) * SEPARACION_CARRIL);
  });

  /** Lo que se reserva a la derecha para el lazo "volver a este mismo paso",
   *  que se dibuja por el costado derecho de la caja con su etiqueta por
   *  fuera. Los carriles de retroceso de ese lado empiezan después. */
  private reservaLazo = computed(() => {
    const lazos = this.aristas().filter((a) => a.origen === a.destino);
    if (lazos.length === 0) return 0;
    return 50 + Math.max(0, ...lazos.map((a) => this.anchoEtiqueta(this.textoArista(a)))) + 12;
  });

  /** Margen derecho: el lazo del paso que se repite y, por fuera de él, los
   *  carriles de los retrocesos que rodean por la derecha. Nunca menos de lo
   *  que se sale por ese lado el rótulo de una flecha que avanza. */
  private margenDerecho = computed(() =>
    Math.max(
      this.reservaLazo() + Math.max(0, this.anchoCarriles(this.carriles().der) - this.PAD),
      this.desbordeRotulos().der,
    ),
  );

  /** X del carril `i` de cada costado: pegado al borde del bloque de cajas,
   *  por fuera, y cada carril siguiente un poco más afuera. */
  private xCarril(lado: 'izq' | 'der', i: number) {
    const izquierda = this.PAD + this.margenIzquierdo();
    return lado === 'izq'
      ? izquierda - 28 - i * ANCHO_CARRIL
      : izquierda + this.disposicion().anchoMax + this.reservaLazo() + 28 + i * ANCHO_CARRIL;
  }

  dibujadas = computed<AristaDibujada[]>(() => {
    const pos = new Map(this.ubicados().map((n) => [n.id, n]));
    const salida: AristaDibujada[] = [];

    // Un carril por retroceso, y un desvío vertical por cada uno que sale del
    // mismo paso o entra al mismo: sin esto los tramos horizontales de dos
    // retrocesos hacia la misma caja quedaban uno encima del otro.
    const retrocesos = this.retrocesos();
    const { lado, carril } = this.carriles();
    const repartir = (clave: (a: AristaGrafo) => number) => {
      const grupos = new Map<number, AristaGrafo[]>();
      for (const a of retrocesos) {
        const k = clave(a);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(a);
      }
      const desvio = new Map<AristaGrafo, number>();
      for (const grupo of grupos.values())
        grupo.forEach((a, i) => desvio.set(a, (i - (grupo.length - 1) / 2) * SEPARACION_CARRIL));
      return desvio;
    };
    const desvioSalida = repartir((a) => a.origen);
    const desvioEntrada = repartir((a) => a.destino);

    // Los retrocesos dentro de una misma fila rodean por arriba; si hay más de
    // uno, cada uno rodea un poco más afuera que el anterior para no dibujarse
    // encima.
    const vuelta = new Map(this.enFila().map((a, i) => [a, i]));

    for (const a of this.aristas()) {
      const o = pos.get(a.origen);
      const d = pos.get(a.destino);
      if (!o || !d) continue;

      const legible = this.textoArista(a);
      // El tooltip suma la condición cruda: es lo que hay que mirar cuando una
      // rama no se toma y se quiere saber qué se está evaluando.
      const titulo =
        a.condicion && a.condicion !== legible ? `${legible}  (${a.condicion})` : legible;
      // La etiqueta vive en el hueco entre filas, que ocupa todo el ancho del
      // diagrama: se recorta con la medida de una caja más un hueco, que es lo
      // que hay de aire alrededor de una flecha, y el texto completo queda en
      // el tooltip.
      const lineas = this.lineasEtiqueta(legible, this.ANCHO + this.GAP_X());

      // Volver al mismo paso: un lazo por el costado derecho. Es el "mantiene
      // seguimiento" de los protocolos reales. Va al costado y no por arriba
      // porque arriba de la caja es justo por donde entra la flecha del camino
      // principal con su etiqueta.
      if (a.origen === a.destino) {
        const y1 = o.y + this.ALTO() * 0.3;
        const y2 = o.y + this.ALTO() * 0.7;
        const fuera = o.x + this.ANCHO + 46;
        salida.push({
          d:
            `M ${this.bordeDer(o, y1)} ${y1} C ${fuera} ${y1 - 12}, ${fuera} ${y2 + 12}, ` +
            `${this.bordeDer(o, y2) + SEPARACION_PUNTA} ${y2}`,
          lineas,
          titulo,
          atras: true,
          lx: o.x + this.ANCHO + 50 + this.anchoEtiqueta(legible) / 2,
          ly: o.y + this.ALTO() / 2,
        });
        continue;
      }

      const atras = d.nivel <= o.nivel;

      if (atras) {
        // Dos pasos de la misma fila: rodear por arriba. Ir de uno al otro en
        // línea recta dibujaría la flecha por encima de las cajas que hay entre
        // medio.
        if (o.nivel === d.nivel) {
          const vueltas = vuelta.get(a) ?? 0;
          // Sale y entra por el costado, como los retrocesos que van por los
          // carriles: por arriba de la caja es por donde entra la flecha del
          // camino principal, y las dos puntas se pisaban.
          const haciaDerecha = d.x > o.x;
          const dir = haciaDerecha ? 1 : -1;
          const oy = o.y + this.ALTO() / 2;
          const dy = d.y + this.ALTO() / 2;
          const desde = haciaDerecha ? this.bordeDer(o, oy) : this.bordeIzq(o, oy);
          const bordeD = haciaDerecha ? this.bordeIzq(d, dy) : this.bordeDer(d, dy);
          // La línea termina un poco antes del borde para que la punta quede
          // sobre el fondo blanco y no pegada (o tapada) por la caja.
          const fin = bordeD - dir * SEPARACION_PUNTA;

          // Sin cajas entre medio, el retroceso va derecho de un costado al
          // otro: es el caso normal de las dos ramas de una decisión, y
          // rodearlo por arriba lo alejaba de las cajas que conecta.
          const entreMedio = this.cruzaCaja(o.nivel, desde, fin, [o.id, d.id]);

          if (!entreMedio) {
            salida.push({
              d: `M ${desde} ${oy} L ${fin} ${dy}`,
              lineas,
              titulo,
              atras: true,
              lx: (desde + fin) / 2,
              ly: oy - 8,
            });
            continue;
          }

          // Con cajas en el medio hay que rodear por arriba de la fila, pero
          // saliendo y entrando igual por el costado: se aparta de la caja, sube
          // por el hueco, cruza y baja al costado de la caja de destino.
          const cy = Math.min(o.y, d.y) - 34 - vueltas * SEPARACION_CARRIL;
          const salteo = 26;
          salida.push({
            d: this.ortogonal([
              [desde, oy],
              [desde + dir * salteo, oy],
              [desde + dir * salteo, cy],
              [fin - dir * salteo, cy],
              [fin - dir * salteo, dy],
              [fin, dy],
            ]),
            lineas,
            titulo,
            atras: true,
            lx: (desde + fin) / 2,
            ly: cy - 6,
          });
          continue;
        }
        // Por fuera del diagrama, cada uno en su carril y por el costado que le
        // quede más cerca (ver `carriles`).
        //
        // Subir por dentro del diagrama atravesaría las cajas de las filas
        // intermedias: la línea se metería por atrás de la tarjeta y parecería
        // entrar y salir de ella. Los márgenes son las únicas franjas
        // verticales siempre libres de cajas.
        const porDerecha = lado.get(a) === 'der';
        const x = this.xCarril(porDerecha ? 'der' : 'izq', carril.get(a) ?? 0);
        // Sale y entra por el costado, a media altura, cada uno un poco corrido
        // del anterior cuando comparten paso.
        const oy = o.y + this.ALTO() / 2 + (desvioSalida.get(a) ?? 0);
        const dy = d.y + this.ALTO() / 2 + (desvioEntrada.get(a) ?? 0);
        // Fuera del centro, el borde de un hexágono ya no está en su x sino
        // metido hacia adentro: sin este ajuste la línea arrancaría (o la punta
        // apuntaría) a un costado de la figura, en el aire.
        const bordeO = porDerecha ? this.bordeDer(o, oy) : this.bordeIzq(o, oy);
        const bordeD = porDerecha ? this.bordeDer(d, dy) : this.bordeIzq(d, dy);
        const hacia = porDerecha ? 1 : -1;
        const fin = bordeD + hacia * SEPARACION_PUNTA;

        // El tramo que va del costado de la caja al carril corre a media altura
        // de su fila, así que cualquier caja que esté en el medio se lo come: la
        // línea desaparece por detrás y reaparece del otro lado, y la punta
        // parece salir de la nada. Cuando eso pasa, en vez de cruzar se sale de
        // la fila por el hueco de al lado de la caja y se viaja por la franja
        // entre filas, que nunca tiene cajas.
        const SALTEO = 26;
        // Los tramos que cruzan por la franja entre filas se escalonan por
        // carril: sin esto, dos retrocesos que salen de la misma fila viajan
        // por la misma y y se ven como una sola línea.
        const escalon = ((carril.get(a) ?? 0) % 3) * SEPARACION_BANDA;
        const puntos: [number, number][] = [[bordeO, oy]];
        if (this.cruzaCaja(o.nivel, bordeO, x, [o.id])) {
          const col = bordeO + hacia * SALTEO;
          const banda = o.y - this.GAP_Y() / 2 + escalon;
          puntos.push([col, oy], [col, banda], [x, banda]);
        } else {
          puntos.push([x, oy]);
        }
        if (this.cruzaCaja(d.nivel, fin, x, [d.id])) {
          const col = bordeD + hacia * SALTEO;
          const banda = d.y + this.ALTO() + this.GAP_Y() / 2 - escalon;
          puntos.push([x, banda], [col, banda], [col, dy]);
        } else {
          puntos.push([x, dy]);
        }
        puntos.push([fin, dy]);

        // El rótulo va por fuera del carril MÁS EXTERNO del costado, no del
        // suyo: escrito al lado de su propia línea, el texto de los carriles de
        // adentro se montaba sobre los de afuera y ninguno se sabía de quién
        // era. Alineados todos contra el mismo borde y con una guía hasta su
        // carril, cada rótulo dice a qué línea pertenece.
        const delLado = porDerecha ? this.carriles().der : this.carriles().izq;
        const xExterno = this.xCarril(porDerecha ? 'der' : 'izq', delLado.length - 1);
        salida.push({
          d: this.ortogonal(puntos),
          lineas,
          titulo,
          atras: true,
          // Sin rótulo no hay nada que atar: la guía (y su punto sobre el
          // carril) quedaba dibujada apuntando a un texto vacío, y se leía como
          // una flecha más del diagrama que no llega a ninguna parte. Pasa en
          // los retrocesos incondicionales, que no llevan condición que escribir.
          guiaX: lineas.length ? x : undefined,
          anclaje: porDerecha ? 'start' : 'end',
          lx: xExterno + hacia * 14,
          ly: (oy + dy) / 2,
        });
        continue;
      }

      const x1 = o.x + this.ANCHO / 2;
      const y1 = o.y + this.ALTO();
      const x2 = d.x + this.ANCHO / 2;
      const y2 = d.y;
      const my = (y1 + y2) / 2;
      salida.push({
        d: `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`,
        lineas,
        titulo,
        atras: false,
        lx: (x1 + x2) / 2,
        // El rótulo cuelga del paso del que sale, no del medio del hueco: los
        // que se pisan se van acomodando hacia abajo, y arrancando desde el
        // medio un paso con cuatro salidas rotuladas (el de porte de armas)
        // empujaba las últimas fuera del hueco, encima de la fila siguiente.
        // Colgando de arriba, la pila crece hacia el hueco, que `GAP_Y` ya
        // dimensionó para que las aguante todas.
        ly: y1 + 21,
      });
    }
    // Dos etiquetas a la misma altura quedaban una encima de otra; se separan
    // en vertical al detectarlo. La distancia depende de cuántas líneas ocupe
    // cada una: con dos líneas, separarlas 14px seguía dejando la de abajo
    // pisando a la de arriba.
    //
    // El cruce en horizontal se mide con el ancho real del texto y no con un
    // margen fijo: las etiquetas son frases ("¿Se presentó apelación? = No")
    // que pasan los 150px, así que dos separadas 100px no se tocaban según el
    // umbral viejo de 60 y en pantalla estaban escritas una sobre otra.
    const anchoRotulo = (a: AristaDibujada) =>
      Math.max(0, ...a.lineas.map((l) => this.anchoAprox(l, 11)));
    // Los rótulos de los carriles no están centrados en su `lx` sino alineados
    // contra él, así que comparar las `lx` a secas los daría por separados
    // cuando en realidad ocupan la misma franja.
    const centroRotulo = (a: AristaDibujada) =>
      a.anclaje === 'start'
        ? a.lx + anchoRotulo(a) / 2
        : a.anclaje === 'end'
          ? a.lx - anchoRotulo(a) / 2
          : a.lx;
    //
    // La pasada se repite hasta que nadie se pisa: bajar un rótulo para
    // despejarlo de uno lo puede dejar encima de un tercero que ya se había
    // comparado, y con una sola pasada ese segundo choque quedaba sin resolver
    // (es justo lo que pasaba en el bloque de apelación, con tres rótulos a la
    // misma altura). El tope de vueltas es para no colgarse si tres rótulos se
    // empujan en círculo.
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let movio = false;
      for (let i = 0; i < salida.length; i++)
        for (let j = 0; j < i; j++) {
          // Una arista sin rótulo no ocupa lugar ni se lo quita a nadie.
          if (!salida[i].lineas.length || !salida[j].lineas.length) continue;
          const alto =
            ((salida[i].lineas.length + salida[j].lineas.length) / 2) * this.ALTO_LINEA + 6;
          const cruce = (anchoRotulo(salida[i]) + anchoRotulo(salida[j])) / 2 + 8;
          if (
            Math.abs(centroRotulo(salida[i]) - centroRotulo(salida[j])) < cruce &&
            Math.abs(salida[i].ly - salida[j].ly) < alto
          ) {
            salida[i].ly = salida[j].ly + alto;
            movio = true;
          }
        }
      if (!movio) break;
    }
    return salida;
  });

  /** El SVG crece con el grafo; el contenedor le pone scroll horizontal.
   *  Los carriles de retroceso ya están reservados en `margenIzquierdo`, que
   *  corre todas las cajas hacia la derecha; a la derecha se reserva el lazo
   *  del paso que se repite. */
  ancho = computed(
    () =>
      Math.max(...this.ubicados().map((n) => n.x + this.ANCHO), 0) +
      this.PAD +
      this.margenDerecho(),
  );
  alto = computed(
    () => Math.max(...this.ubicados().map((n) => n.y + this.ALTO()), 0) + this.PAD,
  );

  /**
   * ¿Un tramo horizontal a la altura de una fila se cruza con alguna caja?
   *
   * Es lo que decide si una flecha puede ir derecho o tiene que rodear. Alcanza
   * con mirar la fila: todas las cajas miden lo mismo y comparten el rango
   * vertical, así que a media altura de la fila estorba cualquier caja cuyo
   * ancho se solape con el tramo.
   */
  private cruzaCaja(nivel: number, x1: number, x2: number, excluir: number[]) {
    const desde = Math.min(x1, x2);
    const hasta = Math.max(x1, x2);
    return this.ubicados().some(
      (n) =>
        n.nivel === nivel &&
        !excluir.includes(n.id) &&
        n.x < hasta &&
        n.x + this.ANCHO > desde,
    );
  }

  /**
   * Camino en ángulos rectos con las esquinas redondeadas.
   *
   * Los tramos son todos horizontales o verticales, así que cada esquina se
   * resuelve cortando un poco antes y un poco después del vértice y uniendo los
   * dos puntos con una curva: una polilínea en escuadra se lee como un cable
   * suelto sobre el diagrama, y las curvas la emparentan con el resto de las
   * flechas.
   */
  private ortogonal(entrada: [number, number][], r = 10): string {
    // Dos puntos iguales seguidos (un tramo de largo cero, que aparece cuando
    // dos filas son contiguas y comparten franja) no son una esquina: dejarlos
    // partiría el camino en un vértice que no existe.
    const puntos = entrada.filter(
      (p, i) => i === 0 || p[0] !== entrada[i - 1][0] || p[1] !== entrada[i - 1][1],
    );
    let d = `M ${puntos[0][0]} ${puntos[0][1]}`;
    for (let i = 1; i < puntos.length - 1; i++) {
      const [px, py] = puntos[i - 1];
      const [x, y] = puntos[i];
      const [nx, ny] = puntos[i + 1];
      // El radio nunca puede comerse más de media recta, o dos esquinas
      // seguidas en un tramo corto se pisarían entre sí.
      const entra = Math.min(r, Math.hypot(x - px, y - py) / 2);
      const sale = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
      const ax = x + Math.sign(px - x) * entra;
      const ay = y + Math.sign(py - y) * entra;
      const bx = x + Math.sign(nx - x) * sale;
      const by = y + Math.sign(ny - y) * sale;
      d += ` L ${ax} ${ay} Q ${x} ${y}, ${bx} ${by}`;
    }
    const [fx, fy] = puntos[puntos.length - 1];
    return `${d} L ${fx} ${fy}`;
  }

  /** X del borde izquierdo de la caja a una altura dada. En el hexágono el
   *  lado se inclina hacia adentro, así que fuera del centro el borde no está
   *  en `n.x` y una flecha anclada ahí arrancaría en el aire. */
  private bordeIzq(n: NodoUbicado, y: number) {
    return n.x + (this.ramifican().has(n.id) ? this.PUNTA * this.sesgo(n, y) : 0);
  }

  private bordeDer(n: NodoUbicado, y: number) {
    return n.x + this.ANCHO - (this.ramifican().has(n.id) ? this.PUNTA * this.sesgo(n, y) : 0);
  }

  /** 0 a media altura (donde está la punta del hexágono) y 1 en los bordes de
   *  arriba y de abajo (donde empieza el lado recto). */
  private sesgo(n: NodoUbicado, y: number) {
    return Math.min(1, Math.abs((2 * (y - n.y)) / this.ALTO() - 1));
  }

  /** Y de cada línea del nombre. Con una sola línea el bloque se centra, para
   *  que un nombre corto no quede pegado al borde de arriba. */
  /** El nombre fluye desde arriba, línea a línea. */
  yNombre(n: NodoUbicado, i: number) {
    return n.y + this.TOP + i * this.ALTO_NOMBRE;
  }

  /**
   * La meta se ancla al pie de la caja, no al final del nombre.
   *
   * Como todas las cajas miden lo mismo pero los nombres ocupan distinta
   * cantidad de líneas, colgarla del nombre la dejaba a distinta altura en
   * cada caja y el diagrama se veía desalineado. Anclada abajo, todas las
   * líneas de meta quedan en la misma fila.
   */
  yMeta2(n: NodoUbicado) {
    return n.y + this.ALTO() - (this.acciones() ? this.RESERVA_ACCIONES : 0) - this.BOTTOM;
  }

  yMeta(n: NodoUbicado) {
    return this.yMeta2(n) - (n.meta2 ? this.ALTO_META : 0);
  }

  /** El texto del hexágono arranca más adentro que el de la caja. */
  xTexto(n: NodoUbicado) {
    return n.x + (this.ramifican().has(n.id) ? this.PAD_HEX : this.PAD_CAJA);
  }

  /**
   * Contra quién se cumple el paso y si pide constancia.
   *
   * Un paso sin `por_involucrado_rol` es del caso y se hace una sola vez, así
   * que no dice nada: escribir "🎯 caso" en la mitad de las cajas es ruido.
   */
  private textoMeta2(n: NodoGrafo): string {
    const partes: string[] = [];
    if (n.por_involucrado_rol)
      partes.push(`🎯 ${this.ALCANCE[n.por_involucrado_rol] ?? n.por_involucrado_rol}`);
    if (n.requiere_notificacion) partes.push('🔔 notificación');
    return partes.join(' · ');
  }

  /**
   * Rótulo corto de a quién alcanza el paso.
   *
   * No se reusa `etiquetaDe(..., 'por_involucrado_rol')` porque ahí están
   * redactadas para un campo de formulario ("Una vez por cada parte (sin
   * testigos)", 37 caracteres) y en una caja de 166 px salen recortadas a la
   * mitad. Acá el espacio manda.
   */
  private readonly ALCANCE: Record<string, string> = {
    afectado: 'Afectado',
    senalado: 'Señalado',
    testigo: 'Testigos',
    denunciante: 'Denunciante',
    todos: 'Ambas partes',
  };

  /**
   * Hexágono alargado para los pasos que ramifican.
   *
   * No es el rombo del diagrama de flujo clásico: un rombo inscrito en una
   * caja de 190×76 deja tan poco interior que el nombre del paso no entra y
   * habría que agrandar solo esos nodos, lo que rompe el anclaje de todas las
   * flechas (que se calcula con ANCHO y ALTO). El hexágono con los lados en
   * punta se lee igual como "acá se decide", conserva el ancho de texto y no
   * toca el layout.
   */
  private hexagono(x: number, y: number): string {
    const w = this.ANCHO;
    const h = this.ALTO();
    const p = this.PUNTA;
    return [
      `${x},${y + h / 2}`,
      `${x + p},${y}`,
      `${x + w - p},${y}`,
      `${x + w},${y + h / 2}`,
      `${x + w - p},${y + h}`,
      `${x + p},${y + h}`,
    ].join(' ');
  }

  /**
   * Pasos que abren más de un camino.
   *
   * Se mira la forma real del grafo y no el tipo del paso: lo que hace que un
   * paso sea una decisión es tener dos salidas, no cómo se llame. Los lazos a
   * sí mismo (el ciclo de seguimiento) no cuentan — un paso que se repite
   * hasta cumplirse no está eligiendo entre dos ramas.
   */
  ramifican = computed<Set<number>>(() => {
    const salidas = new Map<number, number>();
    for (const a of this.aristas()) {
      if (a.origen === a.destino) continue;
      salidas.set(a.origen, (salidas.get(a.origen) ?? 0) + 1);
    }
    return new Set([...salidas].filter(([, n]) => n > 1).map(([id]) => id));
  });

  /** Pasos que vuelven sobre sí mismos: el ciclo de seguimiento. */
  private ciclicos = computed<Set<number>>(
    () => new Set(this.aristas().filter((a) => a.origen === a.destino).map((a) => a.origen)),
  );

  /**
   * Familia de color del nodo, con el mismo criterio del diagrama en
   * Excalidraw del que salió esta vista.
   *
   * El color sale de datos que ya existen, no de una lista de nombres de paso:
   * si mañana se agrega un protocolo nuevo, se pinta solo y bien.
   *
   *   verde    inicio y cierre del protocolo
   *   rojo     el plazo vence y ESCALA — es la marca de un plazo legal duro
   *   violeta  ciclo: el paso se repite hasta que se cumple la condición
   *   azul     el resto, pasos internos
   */
  private familia(n: NodoUbicado): string {
    if (n.es_paso_inicial || n.es_paso_final) return 'inicio';
    if (n.accion_al_vencer === 'escalar') return 'duro';
    if (this.ciclicos().has(n.id)) return 'ciclo';
    return 'interno';
  }

  /**
   * Clases del nodo. El estado de ejecución pinta por encima del color de
   * familia a propósito: mirando un caso en curso lo que importa es por dónde
   * va, no de qué tipo es cada paso. En el editor de la plantilla no hay
   * estado, así que ahí manda la familia.
   */
  clase(n: NodoUbicado) {
    return [
      `nodo--fam-${this.familia(n)}`,
      n.estado ? `nodo--${n.estado}` : '',
      n.es_paso_inicial ? 'nodo--inicial' : '',
      n.es_paso_final ? 'nodo--final' : '',
    ].filter(Boolean);
  }

  // ── Texto ────────────────────────────────────────────────────────────────
  //
  // SVG no ajusta ni corta texto solo: lo que no cabe se sale de la caja y se
  // monta sobre lo de al lado. Como no se puede medir sin tocar el DOM en cada
  // recálculo, se estima el ancho con el factor medio de la tipografía (0.55
  // del tamaño de fuente; 0.58 en semibold). Es una estimación conservadora:
  // preferimos recortar una letra de más a que se salga del borde.

  /** Lo que se escribe sobre la flecha, completo y sin recortar. */
  private textoArista(a: AristaGrafo): string {
    return this.rotulos().get(a) ?? '';
  }

  /** Alto de línea de la etiqueta, para separar las dos líneas y para saber
   *  cuánto ocupa el bloque al esquivar otra etiqueta. */
  private readonly ALTO_LINEA = 13;

  /** Parte la etiqueta por el `=`: la pregunta arriba y el valor abajo.
   *
   * En una sola línea, lo que no cabía en el hueco entre columnas se recortaba
   * por el final — y el final es justamente el valor ("¿El estudiante está
   * fuera de riesgo? =…"), o sea lo único que distingue una rama de la otra.
   * Partida en dos, cada línea tiene todo el ancho del hueco para sí y el
   * valor se ve siempre.
   */
  private partirEtiqueta(texto: string): string[] {
    if (!texto) return [];
    const m = /^(.*?)\s*=\s*(.+)$/.exec(texto);
    return m ? [m[1], `= ${m[2]}`] : [texto];
  }

  /** Las líneas de la etiqueta ya recortadas a lo que entra en `ancho`. */
  private lineasEtiqueta(texto: string, ancho: number): string[] {
    return this.partirEtiqueta(texto).map((l) => this.recortar(l, ancho, 11));
  }

  /** Cuánto ocupa en pantalla la etiqueta, ya partida en líneas: lo pide el
   *  margen que hay que reservar para escribirla por fuera del diagrama. */
  private anchoEtiqueta(texto: string): number {
    return Math.max(
      0,
      ...this.lineasEtiqueta(texto, this.ANCHO + this.GAP_X()).map((l) => this.anchoAprox(l, 11)),
    );
  }

  /** Y de cada línea de la etiqueta: el bloque queda centrado en `ly`, que es
   *  donde iba la etiqueta cuando era de una sola línea. */
  yEtiqueta(a: AristaDibujada, i: number) {
    return a.ly + (i - (a.lineas.length - 1) / 2) * this.ALTO_LINEA;
  }

  /**
   * La guía que une un rótulo con el carril del que habla.
   *
   * Se calcula acá y no junto con la arista porque la `ly` definitiva sale
   * recién después de separar los rótulos que se pisaban: dibujada antes, la
   * guía apuntaría a donde el rótulo estaba y no a donde quedó.
   *
   * Sale a la altura del medio del bloque de texto (la `ly` es la línea de base
   * del centro, unos 4 px por debajo).
   */
  guia(a: AristaDibujada): string {
    if (a.guiaX === undefined) return '';
    const hasta = a.anclaje === 'end' ? a.lx + 6 : a.lx - 6;
    return `M ${a.guiaX} ${this.yGuia(a)} L ${hasta} ${this.yGuia(a)}`;
  }

  /** Altura de la guía: el medio del bloque de texto. La `ly` es la línea de
   *  base de la línea del medio, que cae unos 4 px por debajo. */
  yGuia(a: AristaDibujada) {
    return a.ly - 4;
  }

  /** La condición de una arista escrita para leer, o vacío si no tiene. */
  private condicionDe(a: AristaGrafo): string {
    return (a.condicion_legible || a.condicion || '').trim();
  }

  /** `¿El apoderado compareció? = No` → `¿El apoderado compareció? = Sí`.
   *  Devuelve null si la condición no es una pregunta de Sí/No. */
  private complementoSiNo(condicion: string): string | null {
    const m = /^(.*?)\s*=\s*(sí|si|no)$/i.exec(condicion);
    if (!m) return null;
    return `${m[1]} = ${m[2].toLowerCase() === 'no' ? 'Sí' : 'No'}`;
  }

  /**
   * Rótulo de cada flecha, resuelto mirando todas las salidas del paso y no
   * cada flecha por separado.
   *
   * Un paso que se abre en dos ramas guarda la condición solo en una: la otra
   * es la que se toma "si no se cumple" y llegaba sin nada escrito encima. En
   * el diagrama eso se veía como una flecha rotulada y la de al lado muda, así
   * que al separarse no se sabía cuál era el camino del Sí y cuál el del No.
   *
   * Cuando lo que se evalúa es una misma pregunta de Sí/No, la rama por
   * defecto es exactamente el caso contrario, así que se rotula con el valor
   * complementario y las dos flechas quedan legibles por sí solas. Si la
   * bifurcación tiene otra forma (varias condiciones, o una que no es Sí/No),
   * la rama por defecto al menos dice que es el resto de los casos.
   */
  private rotulos = computed<Map<AristaGrafo, string>>(() => {
    const porOrigen = new Map<number, AristaGrafo[]>();
    for (const a of this.aristas()) {
      const ramas = porOrigen.get(a.origen);
      ramas ? ramas.push(a) : porOrigen.set(a.origen, [a]);
    }

    const mapa = new Map<AristaGrafo, string>();
    for (const ramas of porOrigen.values()) {
      const condicionales = ramas.filter((a) => this.condicionDe(a));
      for (const a of ramas) {
        const propia = this.condicionDe(a);
        if (propia) {
          mapa.set(a, propia);
          continue;
        }
        // Sin condición propia: es la rama por defecto. Solo se puede nombrar
        // por oposición si hay exactamente una condición de la que ser el
        // contrario.
        const opuesta =
          condicionales.length === 1 ? this.complementoSiNo(this.condicionDe(condicionales[0])) : null;
        mapa.set(a, opuesta ?? (condicionales.length ? 'en los demás casos' : (a.etiqueta ?? '')));
      }
    }
    return mapa;
  });

  private anchoAprox(texto: string, px: number, negrita = false) {
    return texto.length * px * (negrita ? 0.58 : 0.55);
  }

  private maxCaracteres(ancho: number, px: number, negrita = false) {
    return Math.max(1, Math.floor(ancho / (px * (negrita ? 0.58 : 0.55))));
  }

  /** Recorta a lo que entra en `ancho` píxeles, con puntos suspensivos. */
  recortar(texto: string, ancho: number, px: number, negrita = false) {
    if (!texto) return '';
    if (this.anchoAprox(texto, px, negrita) <= ancho) return texto;
    const max = this.maxCaracteres(ancho, px, negrita);
    return `${texto.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
  }

  /**
   * Reparte el nombre en tantas líneas como haga falta, cortando por palabras
   * y sin recortar nunca.
   *
   * La primera línea es más corta porque comparte fila con la marca de
   * inicial/final. Una palabra sola más larga que la línea sí se parte: es la
   * única forma de que no se salga de la caja.
   */
  private repartir(nombre: string, util: number, conMarca: boolean): string[] {
    const texto = (nombre ?? '').trim();
    if (!texto) return [''];

    const lineas: string[] = [];
    let linea = '';
    // La primera línea le cede espacio a la marca de inicial/final, pero solo
    // en los nodos que la llevan: descontarla siempre partía en una línea de
    // más los nombres de todos los demás, y el alto de la caja lo fija el
    // nombre que más líneas ocupa.
    const max = () =>
      this.maxCaracteres(
        lineas.length === 0 && conMarca ? util - this.ESPACIO_MARCA : util,
        13,
        true,
      );
    const empujar = () => {
      if (linea) {
        lineas.push(linea);
        linea = '';
      }
    };

    for (let palabra of texto.split(/\s+/)) {
      while (palabra.length > max()) {
        empujar();
        const corte = max();
        lineas.push(palabra.slice(0, corte));
        palabra = palabra.slice(corte);
      }
      const tentativa = linea ? `${linea} ${palabra}` : palabra;
      if (tentativa.length > max()) {
        empujar();
        linea = palabra;
      } else {
        linea = tentativa;
      }
    }
    empujar();
    return lineas.length ? lineas : [''];
  }
}
