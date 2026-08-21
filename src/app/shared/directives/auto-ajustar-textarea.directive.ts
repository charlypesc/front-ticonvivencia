import { AfterViewInit, Directive, ElementRef, HostListener } from '@angular/core';

/**
 * Crece el textarea con su contenido en vez de mostrar scroll interno: el
 * usuario ve el texto completo sin tener que hacer scroll dentro del campo.
 *
 * El ajuste también corre en ngAfterViewInit porque asignar `value` por código
 * (precargar un formulario de edición) no dispara el evento `input`.
 */
@Directive({
  selector: 'textarea[appAutoAjustar]',
  standalone: true,
})
export class AutoAjustarTextarea implements AfterViewInit {
  constructor(private el: ElementRef<HTMLTextAreaElement>) {}

  ngAfterViewInit() {
    // Un tick después: con [(ngModel)] el valor todavía no está en el DOM.
    setTimeout(() => this.ajustar());
  }

  @HostListener('input')
  ajustar() {
    const t = this.el.nativeElement;
    t.style.overflow = 'hidden';
    t.style.resize = 'none';
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }
}
