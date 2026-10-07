import { Component, ElementRef, HostListener, input, output, signal } from '@angular/core';

/**
 * Selector del estado del correo de contacto (0 sin enviar, 1 enviado,
 * 2 respondió) para la lista y la ficha de Geo.
 *
 * No es un <select> nativo: el nativo no se puede pintar por estado ni se ve
 * igual entre navegadores. El menú va con position: fixed porque la tabla está
 * dentro de .table-wrap (overflow-x: auto), que recortaría un menú absoluto.
 */
@Component({
  selector: 'app-estado-correo',
  standalone: true,
  template: `
    <button type="button" class="estado-correo__btn estado-correo__btn--{{ estado() }}"
      [disabled]="deshabilitado()" (click)="alternar($event)">
      <i class="ti {{ opciones[estado()].icono }}"></i>
      <span>{{ opciones[estado()].label }}</span>
      <i class="ti ti-chevron-down estado-correo__chevron"></i>
    </button>
    @if (abierto()) {
    <ul class="estado-correo__menu" [style.top.px]="pos().top" [style.left.px]="pos().left">
      @for (op of opciones; track op.valor) {
      <li class="estado-correo__opcion estado-correo__opcion--{{ op.valor }}"
        [class.estado-correo__opcion--actual]="op.valor === estado()" (click)="elegir(op.valor, $event)">
        <i class="ti {{ op.icono }}"></i> {{ op.label }}
        @if (op.valor === estado()) { <i class="ti ti-check estado-correo__check"></i> }
      </li>
      }
    </ul>
    }
  `,
  styles: `
    :host { display: inline-block; }

    .estado-correo__btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px; border: 1px solid #e5e7eb; border-radius: 999px;
      background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 500;
      white-space: nowrap; cursor: pointer; transition: border-color .15s, box-shadow .15s;

      &:hover:not(:disabled) { box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      &:disabled { cursor: default; opacity: .6; }
      i { font-size: 14px; }
    }
    .estado-correo__chevron { color: #9ca3af; margin-left: 2px; }

    .estado-correo__btn--1 { border-color: #eab308; background: #fefce8; color: #854d0e; }
    .estado-correo__btn--2 { border-color: #3b82f6; background: #eff6ff; color: #1e40af; }

    .estado-correo__menu {
      position: fixed; z-index: 1100; min-width: 180px; margin: 0; padding: 4px;
      list-style: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,.10);
    }
    .estado-correo__opcion {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px;
      font-size: 13px; color: #111827; cursor: pointer;

      &:hover { background: #f3f4f6; }
      i { font-size: 15px; color: #9ca3af; }
    }
    .estado-correo__opcion--1 i { color: #ca8a04; }
    .estado-correo__opcion--2 i { color: #2563eb; }
    .estado-correo__opcion--actual { font-weight: 600; }
    .estado-correo__check { margin-left: auto; color: #1e3a6e !important; }
  `,
})
export class EstadoCorreo {
  estado = input<number>(0);
  deshabilitado = input(false);
  cambiar = output<number>();

  readonly opciones = [
    { valor: 0, label: 'Sin enviar', icono: 'ti-mail' },
    { valor: 1, label: 'Correo enviado', icono: 'ti-mail-forward' },
    { valor: 2, label: 'Respondió', icono: 'ti-mail-check' },
  ];

  abierto = signal(false);
  pos = signal({ top: 0, left: 0 });

  /** El que está abierto: el stopPropagation (para no abrir la ficha) impide
   *  que el click llegue al document, así que el anterior se cierra a mano. */
  private static abiertoActual: EstadoCorreo | null = null;

  constructor(private el: ElementRef<HTMLElement>) {}

  alternar(ev: MouseEvent) {
    ev.stopPropagation();
    if (this.abierto()) return this.abierto.set(false);
    if (EstadoCorreo.abiertoActual !== this) EstadoCorreo.abiertoActual?.cerrar();
    EstadoCorreo.abiertoActual = this;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    // Si no cabe hacia abajo (fila al final de la pantalla) se abre hacia arriba.
    const altoMenu = 130;
    const top = r.bottom + 4 + altoMenu > window.innerHeight ? r.top - 4 - altoMenu : r.bottom + 4;
    this.pos.set({ top, left: Math.min(r.left, window.innerWidth - 190) });
    this.abierto.set(true);
  }

  elegir(valor: number, ev: MouseEvent) {
    ev.stopPropagation();
    this.abierto.set(false);
    if (valor !== this.estado()) this.cambiar.emit(valor);
  }

  @HostListener('document:click', ['$event'])
  clickFuera(ev: MouseEvent) {
    if (this.abierto() && !this.el.nativeElement.contains(ev.target as Node)) this.abierto.set(false);
  }

  // Con position: fixed el menú no acompaña al scroll: se cierra.
  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('document:keydown.escape')
  cerrar() {
    this.abierto.set(false);
  }
}
