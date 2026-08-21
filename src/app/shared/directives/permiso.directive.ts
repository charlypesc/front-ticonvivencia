import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { PermisoId, CODIGO_POR_ID } from '../../core/constants/permisos';

/**
 * Opaca y bloquea cualquier control cuya acción el usuario no tiene permitida.
 *
 *   <button class="btn" [appPuede]="Permiso.CursoCrear">Nuevo curso</button>
 *   <input [appPuede]="Permiso.MiEstablecimientoEditar" [(ngModel)]="nombre" />
 *
 * Por qué opacar en vez de ocultar: esconder el botón deja la pantalla sin
 * explicación — la persona no sabe si la acción no existe, si está en el lugar
 * equivocado o si le falta un permiso. Verlo apagado, con el motivo en el
 * tooltip, le dice qué pedirle a quien administra el sistema.
 *
 * Es un espejo de la UI, no una defensa: el backend chequea el mismo permiso.
 * Quien edite el DOM a mano se saca el `disabled` y recibe un 403 igual.
 */
@Directive({
  selector: '[appPuede]',
  standalone: true,
})
export class Puede {
  /** Id de permiso requerido (ver core/constants/permisos.ts). */
  appPuede = input.required<PermisoId>();

  /**
   * Condición extra propia de la pantalla, para cuando el permiso no alcanza:
   * un rol global que este usuario no puede editar, un registro ya cerrado.
   * Se combina con el permiso: hacen falta los dos.
   */
  appPuedeSi = input<boolean>(true);

  /** Reemplaza el motivo del tooltip cuando el genérico no explica nada. */
  appPuedeMotivo = input<string>('');

  private auth = inject(AuthService);
  private el = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  constructor() {
    // En un effect y no en ngOnInit porque `usuario` es un signal: al cerrar y
    // volver a entrar sin recargar la página, los controles se recalculan solos.
    effect(() => {
      const habilitado = this.auth.can(this.appPuede()) && this.appPuedeSi();
      this.aplicar(habilitado);
    });
  }

  /**
   * El title propio del elemento ("Editar", "Eliminar"). Se guarda la primera
   * vez para poder devolverlo: al bloquear se pisa con el motivo, y sin esto
   * un control que vuelve a habilitarse se quedaría sin su tooltip original.
   */
  private titleOriginal: string | null = null;
  private guardado = false;

  /**
   * Si el `disabled` actual lo puso esta directiva. Sin esto, al habilitar se
   * pisaría un [disabled] del propio template (ej. mientras corre una
   * importación): Angular no vuelve a escribirlo porque para él no cambió, y el
   * botón quedaría activo justo durante la operación que debía bloquearlo.
   */
  private deshabilitadoPorMi = false;

  private aplicar(habilitado: boolean) {
    const nodo = this.el.nativeElement;

    if (!this.guardado) {
      this.titleOriginal = nodo.getAttribute('title');
      this.guardado = true;
    }

    if (habilitado) {
      this.renderer.removeClass(nodo, 'sin-permiso');
      this.renderer.removeAttribute(nodo, 'aria-disabled');
      // Va por propiedad y no por atributo porque así se puso al bloquear:
      // removeAttribute no limpia una propiedad seteada desde JS.
      if (this.deshabilitadoPorMi) {
        this.renderer.setProperty(nodo, 'disabled', false);
        this.deshabilitadoPorMi = false;
      }
      if (this.titleOriginal === null) this.renderer.removeAttribute(nodo, 'title');
      else this.renderer.setAttribute(nodo, 'title', this.titleOriginal);
      return;
    }

    this.renderer.addClass(nodo, 'sin-permiso');
    this.renderer.setAttribute(nodo, 'aria-disabled', 'true');
    this.renderer.setAttribute(nodo, 'title', this.motivo());

    // `disabled` solo existe en los controles de formulario. En lo demás
    // (un <a>, una fila, un <div> clickeable) la clase corta los clicks con
    // pointer-events, que es lo que hace que el handler no llegue a correr.
    if ('disabled' in nodo && !(nodo as HTMLInputElement).disabled) {
      this.renderer.setProperty(nodo, 'disabled', true);
      this.deshabilitadoPorMi = true;
    }
  }

  private motivo() {
    if (this.appPuedeMotivo()) return this.appPuedeMotivo();
    // El código del permiso ('curso.crear') es lo que hay que pedirle al
    // administrador, así que va en el tooltip en vez de un "no autorizado" seco.
    return `No tienes permiso para esta acción (${CODIGO_POR_ID[this.appPuede()]})`;
  }
}
