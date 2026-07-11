import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-consultar-rut',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consultar-rut.html',
  styleUrl: './consultar-rut.scss',
})
export class ConsultarRut {
  rut = '';
  loading = signal(false);
  error = signal('');
  estudiante = signal<any | null>(null);
  registros = signal<any[]>([]);

  constructor(private api: ApiService) {}

  validarFormatoRut(rut: string): boolean {
    return /^\d{7,8}-[\dkK]$/.test(rut.trim());
  }

  buscar() {
    this.error.set('');
    this.estudiante.set(null);
    this.registros.set([]);

    if (!this.rut.trim()) {
      this.error.set('Ingrese un RUT para buscar');
      return;
    }

    if (!this.validarFormatoRut(this.rut)) {
      this.error.set('Ingrese un RUT válido (ej: 12345678-9)');
      return;
    }

    this.loading.set(true);

    this.api.consultarRut(this.rut.trim()).subscribe({
      next: (res: any) => {
        if (!res.estudiante) {
          this.error.set('No se encontraron registros para el RUT ingresado');
        } else {
          this.estudiante.set(res.estudiante);
          this.registros.set(res.registros);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Error al consultar');
      },
    });
  }

  limpiar() {
    this.rut = '';
    this.error.set('');
    this.estudiante.set(null);
    this.registros.set([]);
  }
}
