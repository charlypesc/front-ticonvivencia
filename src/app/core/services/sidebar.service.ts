import { Injectable, signal } from '@angular/core';

const CLAVE = 'sidebar-colapsado';

/**
 * Estado del menú lateral, compartido entre la navbar (que tiene el botón) y
 * el layout/sidebar (que se acomodan).
 *
 * Son dos estados distintos a propósito:
 *  - `colapsado` es de escritorio: el menú queda como una franja de íconos y
 *    el contenido gana ancho. Se recuerda entre sesiones.
 *  - `abierto` es de celular/tablet: ahí el menú no ocupa lugar, se abre
 *    encima del contenido y se cierra al elegir una opción o tocar afuera.
 */
@Injectable({ providedIn: 'root' })
export class SidebarService {
  colapsado = signal(this.leer());
  abierto = signal(false);

  /** Mismo corte que el CSS: bajo esto el menú pasa a ser un panel que se abre encima. */
  private esMovil() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  }

  alternar() {
    if (this.esMovil()) {
      this.abierto.update((v) => !v);
      return;
    }
    this.colapsado.update((v) => !v);
    try {
      localStorage.setItem(CLAVE, this.colapsado() ? '1' : '0');
    } catch {}
  }

  cerrarMovil() {
    this.abierto.set(false);
  }

  private leer() {
    try {
      return localStorage.getItem(CLAVE) === '1';
    } catch {
      return false;
    }
  }
}
