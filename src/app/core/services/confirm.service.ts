import { Injectable, signal } from '@angular/core';

interface ConfirmState {
  mensaje: string;
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  state = signal<ConfirmState | null>(null);

  confirmarAccion(mensaje: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ mensaje, resolve });
    });
  }

  resolver(valor: boolean) {
    this.state()?.resolve(valor);
    this.state.set(null);
  }
}
