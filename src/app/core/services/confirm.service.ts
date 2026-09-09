import { Injectable, signal } from '@angular/core';

/**
 * El texto que se pide dentro del propio modal (el motivo de una omisión, el
 * comentario de una aprobación). Va acá y no como un campo suelto en la pantalla
 * porque sólo tiene sentido mientras se está tomando la decisión: fuera de ese
 * momento es un campo que el usuario llena creyendo que se guarda con el paso.
 */
export interface CampoConfirm {
  etiqueta: string;
  placeholder?: string;
  /** Sin texto no se puede confirmar: el botón avisa en vez de cerrar. */
  obligatorio?: boolean;
}

interface ConfirmState {
  mensaje: string;
  resolve: (value: any) => void;
  // Un aviso usa el mismo modal pero sin decisión que tomar: título propio y
  // un solo botón. Sin esto habría que mostrar "Cancelar / Confirmar" para
  // algo que el usuario no puede aceptar ni rechazar.
  soloAviso?: boolean;
  titulo?: string;
  icono?: string;
  campo?: CampoConfirm;
  /** Lo que se va escribiendo, para que el modal no necesite estado propio. */
  texto?: string;
  /** "Este motivo es obligatorio": se muestra sin cerrar el modal. */
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  state = signal<ConfirmState | null>(null);

  confirmarAccion(mensaje: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve });
    });
  }

  /**
   * Confirma y además pide un texto. Devuelve lo escrito, o `null` si canceló
   * — y no `''`, para poder distinguir "confirmó sin escribir nada" de "no
   * confirmó" cuando el campo es opcional.
   */
  pedirTexto(mensaje: string, campo: CampoConfirm): Promise<string | null> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve, campo, texto: '' });
    });
  }

  avisar(mensaje: string, titulo = 'Aviso', icono = 'ti-info-circle'): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve, soloAviso: true, titulo, icono });
    });
  }

  /** Lo que va escribiendo el usuario en el campo del modal. */
  escribir(texto: string) {
    const actual = this.state();
    if (actual) this.state.set({ ...actual, texto, error: '' });
  }

  resolver(valor: boolean) {
    const actual = this.state();
    if (!actual) return;

    if (actual.campo) {
      const texto = (actual.texto ?? '').trim();
      // Cancelar nunca se traba, aunque el campo sea obligatorio.
      if (valor && actual.campo.obligatorio && !texto) {
        this.state.set({ ...actual, error: 'Escribe el motivo para poder continuar.' });
        return;
      }
      actual.resolve(valor ? texto : null);
      this.state.set(null);
      return;
    }

    actual.resolve(valor);
    this.state.set(null);
  }
}
