import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Confirma un modal con Cmd+Enter (o Ctrl+Enter en Windows/Linux).
 *
 * Gemela de `CerrarConEsc`: se engancha por clase (`.modal-backdrop`), así que
 * basta con importarla en el componente para que todos sus modales acepten el
 * atajo, sin tocar el HTML ni repetir un handler por modal.
 *
 * Cómo guarda: no conoce el estado del componente, así que dispara el mismo
 * botón que la persona habría apretado — el botón de acción del pie del modal
 * (`.modal__footer .btn--primary` o `.btn--danger`). Se toma el último, que por
 * convención del sistema es el que está más a la derecha (Cancelar queda como
 * `.btn--outline` y nunca se dispara por accidente).
 *
 * Si el modal es de sólo lectura (pie sin botón de acción) o el botón está
 * deshabilitado —guardando, formulario incompleto—, la tecla no hace nada.
 *
 * Con varios modales encima (un confirmar sobre un formulario), sólo reacciona
 * el último del DOM, igual que Escape: el atajo confirma el de arriba.
 */
@Directive({
  selector: '.modal-backdrop',
  standalone: true,
})
export class GuardarConCmdEnter {
  private el = inject(ElementRef<HTMLElement>);

  @HostListener('document:keydown.meta.enter', ['$event'])
  @HostListener('document:keydown.control.enter', ['$event'])
  alPresionarCmdEnter(evento: Event) {
    const fondo = this.el.nativeElement as HTMLElement;

    // Sólo el modal de más arriba: `querySelectorAll` devuelve en orden de
    // documento y los modales se agregan al final.
    const abiertos = document.querySelectorAll('.modal-backdrop');
    if (abiertos.length && abiertos[abiertos.length - 1] !== fondo) return;

    const accion = this.botonDeAccion(fondo);
    if (!accion) return;

    evento.preventDefault();
    evento.stopPropagation();
    accion.click();
  }

  /** Último botón de acción habilitado del pie del modal. */
  private botonDeAccion(fondo: HTMLElement): HTMLButtonElement | null {
    const botones = Array.from(
      fondo.querySelectorAll<HTMLButtonElement>(
        '.modal__footer .btn--primary, .modal__footer .btn--danger',
      ),
    ).filter((boton) => !boton.disabled && boton.offsetParent !== null);

    return botones.length ? botones[botones.length - 1] : null;
  }
}
