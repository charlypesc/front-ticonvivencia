import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  mensaje: string;
  resolve: (value: boolean) => void;
  // Un aviso usa el mismo modal pero sin decisión que tomar: título propio y
  // un solo botón. Sin esto habría que mostrar "Cancelar / Confirmar" para
  // algo que el usuario no puede aceptar ni rechazar.
  soloAviso?: boolean;
  titulo?: string;
  icono?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  state = signal<ConfirmState | null>(null);

  confirmarAccion(mensaje: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve });
    });
  }

  avisar(mensaje: string, titulo = 'Aviso', icono = 'ti-info-circle'): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve, soloAviso: true, titulo, icono });
    });
  }

  resolver(valor: boolean) {
    this.state()?.resolve(valor);
    this.state.set(null);
  }
}
