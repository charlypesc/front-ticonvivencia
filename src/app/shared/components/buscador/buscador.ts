import {
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

let contadorInstancias = 0;

/**
 * Buscador con lista de sugerencias, navegable por teclado.
 *
 * Existe porque el mismo autocomplete estaba escrito cuatro veces (estudiantes,
 * el modal de registros, el buscador de RBD de geo y el selector del header) y
 * solo uno tenía flechas y Enter. Acá vive una sola vez el input, el dropdown,
 * el resaltado, el cierre por blur y los roles ARIA; cada pantalla sigue
 * decidiendo cómo filtra y cómo se ve cada fila, vía <ng-template #item>.
 *
 * Uso:
 *   <app-buscador [items]="sugerencias()" [(texto)]="busqueda" (elegir)="abrir($event)">
 *     <ng-template #item let-e>...</ng-template>
 *     <ng-template #vacio>Sin resultados</ng-template>
 *   </app-buscador>
 */
@Component({
  selector: 'app-buscador',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buscador.html',
  styleUrl: './buscador.scss',
})
export class Buscador implements OnChanges {
  /** Sugerencias ya filtradas y ordenadas por quien usa el componente. */
  @Input() items: readonly any[] = [];
  @Input() texto = '';
  @Output() textoChange = new EventEmitter<string>();
  @Output() elegir = new EventEmitter<any>();

  @Input() placeholder = 'Buscar...';
  @Input() cargando = false;

  /**
   * 'plano' es el recuadro blanco de los modales y de geo; 'destacado' es el
   * campo azul del listado de estudiantes; 'compacto' es el del header, que en
   * vez de lupa lleva el chevron a la derecha.
   */
  @Input() variante: 'plano' | 'destacado' | 'compacto' = 'plano';

  /** Debajo de esto no se abre la lista: con 1 letra son cientos de nombres. */
  @Input() minimoCaracteres = 2;

  /** Deja el campo vacío después de elegir (listas de selección múltiple). */
  @Input() limpiarAlElegir = false;

  /** Con el campo cerrado se muestra esto en vez de lo escrito (header). */
  @Input() etiquetaCerrado = '';

  /** Al enfocar, arranca de cero en vez de conservar la búsqueda anterior. */
  @Input() limpiarAlAbrir = false;

  /** Clase extra para el <input>, para estados propios de cada pantalla. */
  @Input() claseInput = '';

  @ContentChild('item') itemTpl?: TemplateRef<any>;
  @ContentChild('vacio') vacioTpl?: TemplateRef<any>;

  @ViewChild('campo') campo?: ElementRef<HTMLInputElement>;

  abierto = signal(false);

  /**
   * Sugerencia resaltada. Se para sola en la primera —la mejor coincidencia—
   * en cuanto hay resultados: resaltar no elige a nadie, solo deja el Enter
   * cargado sobre lo más parecido a lo escrito.
   */
  indiceActivo = signal(-1);

  private readonly id = `buscador-${contadorInstancias++}`;

  /**
   * Varias pantallas arman las sugerencias con un método (no un computed), así
   * que llega un array nuevo en cada ciclo de detección aunque el contenido sea
   * el mismo. Sin esta comparación el resaltado volvería a la primera fila
   * constantemente y las flechas no podrían moverse.
   */
  ngOnChanges(cambios: SimpleChanges) {
    if (!cambios['items']) return;
    const antes: readonly any[] = cambios['items'].previousValue ?? [];
    const ahora = this.items ?? [];
    const igual = antes.length === ahora.length && antes.every((x, i) => x === ahora[i]);
    if (!igual) this.indiceActivo.set(ahora.length > 0 ? 0 : -1);
  }

  valorVisible() {
    return !this.abierto() && this.etiquetaCerrado ? this.etiquetaCerrado : this.texto;
  }

  hayTextoSuficiente() {
    return (this.texto ?? '').trim().length >= this.minimoCaracteres;
  }

  /** El bloque "sin resultados" también abre la lista: es una respuesta. */
  listaVisible() {
    return this.abierto() && this.hayTextoSuficiente() && (this.items.length > 0 || !!this.vacioTpl);
  }

  idOpcion(i: number) {
    return `${this.id}-opcion-${i}`;
  }

  abrir() {
    if (this.limpiarAlAbrir && this.texto) this.escribir('');
    this.abierto.set(true);
  }

  cerrar() {
    this.abierto.set(false);
    this.indiceActivo.set(-1);
  }

  // El (blur) del input llega antes que el (mousedown) del ítem: sin esta
  // espera la lista se cierra y el clic nunca aterriza en la opción.
  cerrarConDelay() {
    setTimeout(() => this.cerrar(), 150);
  }

  alEscribir(valor: string) {
    this.escribir(valor);
    this.abierto.set(true);
    // El índice se reacomoda en ngOnChanges cuando llega la lista nueva; acá
    // solo se evita que quede apuntando fuera de rango mientras tanto.
    this.indiceActivo.set(this.items.length > 0 ? 0 : -1);
  }

  /**
   * Flechas arriba/abajo con vuelta circular: desde el último, abajo lleva al
   * primero. Es lo que hace cualquier autocomplete y evita quedarse trabado en
   * la punta de la lista.
   */
  mover(delta: number, evento: Event) {
    if (!this.listaVisible()) return;
    const total = this.items.length;
    if (total === 0) return;

    // Sin esto la flecha además mueve el cursor dentro del input, y el texto
    // escrito se recorre mientras se navega la lista.
    evento.preventDefault();

    const actual = this.indiceActivo();
    this.indiceActivo.set((actual + delta + total) % total);
    this.scrollAlActivo();
  }

  /** Enter confirma la fila resaltada. Nunca elige por su cuenta otra. */
  confirmar(evento: Event) {
    if (!this.listaVisible()) return;
    const elegido = this.items[this.indiceActivo()];
    if (elegido === undefined) return;

    evento.preventDefault();
    this.elegirItem(elegido);
  }

  elegirItem(item: any) {
    this.cerrar();
    if (this.limpiarAlElegir) this.escribir('');
    this.elegir.emit(item);
  }

  enfocar() {
    this.campo?.nativeElement.focus();
  }

  private escribir(valor: string) {
    this.texto = valor;
    this.textoChange.emit(valor);
  }

  /**
   * La lista tiene alto máximo con scroll propio: sin esto el resaltado se va
   * fuera de vista al pasar del cuarto o quinto nombre. Va en un setTimeout
   * porque la clase --activo todavía no está en el DOM cuando corre esto.
   */
  private scrollAlActivo() {
    setTimeout(() => {
      const activo = document.getElementById(this.idOpcion(this.indiceActivo()));
      activo?.scrollIntoView({ block: 'nearest' });
    });
  }
}
