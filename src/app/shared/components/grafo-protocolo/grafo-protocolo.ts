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

/** Lo que se puede hacer sobre un paso desde el propio diagrama. */
export type AccionNodo = 'editar' | 'roles' | 'campo' | 'transicion' | 'eliminar';

interface NodoUbicado extends NodoGrafo {
  x: number;
  y: number;
  nivel: number;
  /** El nombre ya repartido en las líneas que caben dentro de la caja. */
  lineas: string[];
  /** `tipo · plazo`, recortado a lo que entra. */
  meta: string;
}

interface AristaDibujada {
  d: string;
  /** Recortado para que no se monte sobre las cajas vecinas. */
  texto: string;
  /** Completo, para el tooltip cuando el recorte esconde algo. */
  titulo: string;
  /** Una arista que retrocede es un reintento ("volver a investigar"), y se
   *  dibuja distinto para que se lea como tal y no como un paso más. */
  atras: boolean;
  lx: number;
  ly: number;
}

/**
 * Dibuja el grafo de un protocolo como diagrama.
 *
 * El layout se calcula acá y no con una librería: son grafos de menos de una
 * docena de nodos y una sola forma (izquierda a derecha por nivel), así que
 * traer un motor de layout completo agregaría una dependencia y un bundle
 * grande para resolver algo que son treinta líneas.
 *
 * Los ciclos son parte del modelo — "si no está resuelto, volver a la
 * investigación" — así que el nivel de cada nodo se calcula por distancia más
 * corta desde el inicial y las aristas que retroceden se dibujan por debajo,
 * en vez de intentar aplanar el grafo en un árbol que no es.
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
    { accion: 'editar', icono: 'ti-pencil', titulo: 'Editar paso (nombre, tipo, plazo, si es inicial o final)' },
    { accion: 'roles', icono: 'ti-users', titulo: 'Responsables del paso (ejecutor, aprobador, notificado)' },
    { accion: 'campo', icono: 'ti-forms', titulo: 'Agregar un campo a llenar en este paso' },
    { accion: 'transicion', icono: 'ti-arrow-ramp-right', titulo: 'Agregar una salida: en qué paso continúa' },
    { accion: 'eliminar', icono: 'ti-trash', titulo: 'Eliminar paso', peligro: true },
  ];

  readonly ANCHO = 190;
  /** Dos líneas para el nombre más la línea de tipo/plazo; con la barra de
   *  acciones adentro, una fila más. */
  ALTO = computed(() => (this.acciones() ? 108 : 76));
  /** El hueco entre columnas también es donde va la etiqueta de la condición,
   *  así que tiene que caber una condición corta sin pisar las cajas. */
  private readonly GAP_X = 120;
  private readonly GAP_Y = 26;
  private readonly PAD = 20;
  /** Margen interno de la caja: 12 por lado. */
  private readonly PAD_CAJA = 12;
  /** La primera línea comparte fila con la marca de inicial/final. */
  private readonly ESPACIO_MARCA = 18;

  ubicados = computed<NodoUbicado[]>(() => {
    const nodos = this.nodos();
    if (nodos.length === 0) return [];

    const salientes = new Map<number, number[]>();
    for (const a of this.aristas()) {
      if (!salientes.has(a.origen)) salientes.set(a.origen, []);
      salientes.get(a.origen)!.push(a.destino);
    }

    // Distancia más corta desde el paso inicial. Lo que no se alcanza (un paso
    // recién creado, todavía sin conectar) va a una columna al final, visible
    // en vez de encimado en el origen.
    const nivel = new Map<number, number>();
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

    const porNivel = new Map<number, NodoGrafo[]>();
    for (const n of nodos) {
      const l = nivel.get(n.id)!;
      if (!porNivel.has(l)) porNivel.set(l, []);
      porNivel.get(l)!.push(n);
    }

    const salida: NodoUbicado[] = [];
    const arriba = this.margenSuperior();
    for (const [l, delNivel] of porNivel) {
      delNivel.forEach((n, i) => {
        salida.push({
          ...n,
          nivel: l,
          x: this.PAD + l * (this.ANCHO + this.GAP_X),
          y: this.PAD + arriba + i * (this.ALTO() + this.GAP_Y),
          lineas: this.repartir(n.nombre),
          meta: this.recortar(
            n.plazo
              ? `${etiquetaDe(n.tipo_paso, 'tipo_paso')} · ${n.plazo}`
              : etiquetaDe(n.tipo_paso, 'tipo_paso'),
            this.ANCHO - this.PAD_CAJA * 2,
            11,
          ),
        });
      });
    }
    return salida;
  });

  /** Los lazos "volver a este mismo paso" se dibujan por arriba de la caja, así
   *  que la fila de arriba necesita aire o el lazo se corta contra el borde. */
  private margenSuperior = computed(() =>
    this.aristas().some((a) => a.origen === a.destino) ? 48 : 0,
  );

  dibujadas = computed<AristaDibujada[]>(() => {
    const pos = new Map(this.ubicados().map((n) => [n.id, n]));
    const salida: AristaDibujada[] = [];

    for (const a of this.aristas()) {
      const o = pos.get(a.origen);
      const d = pos.get(a.destino);
      if (!o || !d) continue;

      const legible =
        a.condicion_legible ?? a.condicion ?? (a.es_default ? 'si no' : (a.etiqueta ?? ''));
      // El tooltip suma la condición cruda: es lo que hay que mirar cuando una
      // rama no se toma y se quiere saber qué se está evaluando.
      const titulo =
        a.condicion && a.condicion !== legible ? `${legible}  (${a.condicion})` : legible;
      // La etiqueta vive en el hueco entre columnas: si no cabe ahí, se recorta
      // y el nombre completo queda en el tooltip. Antes se salía del hueco y
      // terminaba encima del nombre del paso.
      const texto = this.recortar(legible, this.GAP_X - 16, 11);

      // Volver al mismo paso: un lazo por arriba. Es el "mantiene seguimiento"
      // de los protocolos reales.
      if (a.origen === a.destino) {
        const cx = o.x + this.ANCHO / 2;
        salida.push({
          d: `M ${cx - 22} ${o.y} C ${cx - 30} ${o.y - 44}, ${cx + 30} ${o.y - 44}, ${cx + 22} ${o.y}`,
          texto,
          titulo,
          atras: true,
          lx: cx,
          ly: o.y - 34,
        });
        continue;
      }

      const atras = d.nivel <= o.nivel;

      if (atras) {
        // Dos pasos de la misma columna: bajar y volver a subir por el mismo x
        // dibujaba la línea encima de sí misma. Se rodea por el costado.
        if (o.nivel === d.nivel) {
          const oy = o.y + this.ALTO() / 2;
          const dy = d.y + this.ALTO() / 2;
          // En la primera columna no hay margen a la izquierda: se rodea por
          // el otro lado antes que salirse del lienzo.
          const porIzquierda = o.x >= 48;
          const borde = porIzquierda ? o.x : o.x + this.ANCHO;
          const cx = porIzquierda ? o.x - 40 : borde + 40;
          salida.push({
            d: `M ${borde} ${oy} C ${cx} ${oy}, ${cx} ${dy}, ${borde} ${dy}`,
            texto,
            titulo,
            atras: true,
            lx: cx + 4,
            ly: (oy + dy) / 2,
          });
          continue;
        }
        // Por debajo de todo, para no cruzar las cajas del camino principal.
        const y = Math.max(o.y, d.y) + this.ALTO() + 26;
        const x1 = o.x + this.ANCHO / 2;
        const x2 = d.x + this.ANCHO / 2;
        salida.push({
          d: `M ${x1} ${o.y + this.ALTO()} L ${x1} ${y} L ${x2} ${y} L ${x2} ${d.y + this.ALTO()}`,
          texto,
          titulo,
          atras: true,
          lx: (x1 + x2) / 2,
          ly: y - 6,
        });
        continue;
      }

      const x1 = o.x + this.ANCHO;
      const y1 = o.y + this.ALTO() / 2;
      const x2 = d.x;
      const y2 = d.y + this.ALTO() / 2;
      const mx = (x1 + x2) / 2;
      salida.push({
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        texto,
        titulo,
        atras: false,
        lx: mx,
        ly: (y1 + y2) / 2 - 6,
      });
    }
    // Dos salidas del mismo paso hacia la misma altura dejaban las etiquetas
    // una encima de otra; se separan en vertical al detectarlo.
    for (let i = 0; i < salida.length; i++)
      for (let j = 0; j < i; j++)
        if (
          Math.abs(salida[i].lx - salida[j].lx) < 60 &&
          Math.abs(salida[i].ly - salida[j].ly) < 13
        )
          salida[i].ly = salida[j].ly + 14;
    return salida;
  });

  /** El SVG crece con el grafo; el contenedor le pone scroll horizontal. */
  ancho = computed(() =>
    Math.max(...this.ubicados().map((n) => n.x + this.ANCHO), 0) + this.PAD,
  );
  alto = computed(() =>
    Math.max(...this.ubicados().map((n) => n.y + this.ALTO()), 0) + this.PAD + 60,
  );

  /** Y de cada línea del nombre. Con una sola línea el bloque se centra, para
   *  que un nombre corto no quede pegado al borde de arriba. */
  yNombre(n: NodoUbicado, i: number) {
    return n.y + (n.lineas.length > 1 ? 24 : 32) + i * 16;
  }

  yMeta(n: NodoUbicado) {
    return n.y + (n.lineas.length > 1 ? 60 : 52);
  }

  clase(n: NodoUbicado) {
    if (n.estado) return `nodo--${n.estado}`;
    if (n.es_paso_inicial) return 'nodo--inicial';
    if (n.es_paso_final) return 'nodo--final';
    return '';
  }

  // ── Texto ────────────────────────────────────────────────────────────────
  //
  // SVG no ajusta ni corta texto solo: lo que no cabe se sale de la caja y se
  // monta sobre lo de al lado. Como no se puede medir sin tocar el DOM en cada
  // recálculo, se estima el ancho con el factor medio de la tipografía (0.55
  // del tamaño de fuente; 0.58 en semibold). Es una estimación conservadora:
  // preferimos recortar una letra de más a que se salga del borde.

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

  /** Reparte el nombre en hasta dos líneas cortando por palabras. La primera
   *  línea es más corta porque comparte fila con la marca de inicial/final. */
  private repartir(nombre: string): string[] {
    const texto = (nombre ?? '').trim();
    const util = this.ANCHO - this.PAD_CAJA * 2;
    const max1 = this.maxCaracteres(util - this.ESPACIO_MARCA, 13, true);
    const max2 = this.maxCaracteres(util, 13, true);

    if (texto.length <= max1) return [texto];

    const palabras = texto.split(/\s+/);
    let primera = '';
    let i = 0;
    // Una palabra sola más larga que la línea no se puede repartir: se corta.
    while (i < palabras.length) {
      const tentativa = primera ? `${primera} ${palabras[i]}` : palabras[i];
      if (tentativa.length > max1) break;
      primera = tentativa;
      i++;
    }
    if (!primera) {
      primera = texto.slice(0, max1);
      return [primera, this.recortar(texto.slice(max1), util, 13, true)];
    }
    const resto = palabras.slice(i).join(' ');
    return resto ? [primera, this.recortar(resto, util, 13, true)] : [primera];
  }
}
