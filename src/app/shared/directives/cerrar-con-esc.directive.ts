import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Cierra un modal con la tecla Escape.
 *
 * Se engancha por clase (`.modal-backdrop`) y no por un atributo propio: todos
 * los modales del sistema ya se dibujan con ese contenedor, así que basta con
 * importarla en el componente para que sus modales cierren con Escape, sin
 * tocar el HTML ni repetir un handler por cada modal.
 *
 * Cómo cierra: no conoce el estado del componente, así que dispara la misma
 * acción de cierre que ya existe en pantalla, en este orden.
 *
 *   1. El botón X de la cabecera, si el modal lo tiene. Es lo que la persona
 *      habría apretado, y arrastra lo que sea que ese botón haga (limpiar el
 *      formulario, avisarle al padre, resolver una promesa).
 *   2. Si no hay X, un `mousedown` sobre el propio fondo, que es la otra forma
 *      de cerrar que ya está implementada (`click afuera`).
 *
 * Con varios modales encima (un confirmar sobre un formulario), solo reacciona
 * el último del DOM: Escape cierra el de arriba y deja el de abajo abierto, que
 * es lo que la persona espera.
 */
@Directive({
  selector: '.modal-backdrop',
  standalone: true,
})
export class CerrarConEsc {
  private el = inject(ElementRef<HTMLElement>);

  @HostListener('document:keydown.escape', ['$event'])
  alPresionarEsc(evento: Event) {
    const fondo = this.el.nativeElement as HTMLElement;

    // Solo el modal de más arriba. `querySelectorAll` devuelve en orden de
    // documento y los modales se agregan al final, así que el último abierto
    // es el que está encima.
    const abiertos = document.querySelectorAll('.modal-backdrop');
    if (abiertos.length && abiertos[abiertos.length - 1] !== fondo) return;

    // Escribiendo dentro de un desplegable nativo abierto, Escape lo cierra a
    // él primero; el navegador no avisa, así que se deja pasar esa tecla y el
    // modal se cierra recién con la siguiente.
    const activo = document.activeElement;
    if (activo instanceof HTMLSelectElement) return;

    evento.preventDefault();
    evento.stopPropagation();

    const cerrar = fondo.querySelector<HTMLElement>('.modal__close');
    if (cerrar) {
      cerrar.click();
      return;
    }

    fondo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }
}
