import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-establecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './establecimiento.html',
  styleUrl: './establecimiento.scss',
})
export class Establecimiento implements OnInit {
  loading = signal(true);
  error = signal('');
  success = signal('');

  form = {
    nombre: '',
    rbd: '',
    region: '',
    comuna: '',
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getEstablecimiento().subscribe({
      next: (data) => {
        this.form = {
          nombre: data.nombre,
          rbd: data.rbd,
          region: data.region ?? '',
          comuna: data.comuna ?? '',
        };
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  guardar() {
    this.error.set('');
    this.success.set('');
    if (!this.form.nombre || !this.form.rbd) {
      this.error.set('Nombre y RBD son requeridos');
      return;
    }

    this.api.updateEstablecimiento(this.form).subscribe({
      next: () => this.success.set('Establecimiento actualizado'),
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }
}
