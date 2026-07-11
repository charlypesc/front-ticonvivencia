import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-tipos-falta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tipos-falta.html',
  styleUrl: './tipos-falta.scss',
})
export class TiposFalta implements OnInit {
  tiposFalta = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  form = {
    nombre: '',
    gravedad: '',
    descripcion: '',
    medida_sugerida: '',
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getTiposFalta().subscribe({
      next: (data) => {
        this.tiposFalta.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(tipo?: any) {
    this.error.set('');
    this.success.set('');
    if (tipo) {
      this.editando.set(tipo);
      this.form = {
        nombre: tipo.nombre,
        gravedad: tipo.gravedad,
        descripcion: tipo.descripcion ?? '',
        medida_sugerida: tipo.medida_sugerida ?? '',
      };
    } else {
      this.editando.set(null);
      this.form = { nombre: '', gravedad: '', descripcion: '', medida_sugerida: '' };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.nombre || !this.form.gravedad) {
      this.error.set('Nombre y gravedad son requeridos');
      return;
    }

    const request = this.editando()
      ? this.api.updateTipoFalta(this.editando().id_tipo_falta, this.form)
      : this.api.createTipoFalta(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Tipo actualizado' : 'Tipo creado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  eliminar(tipo: any) {
    if (!confirm(`¿Eliminar "${tipo.nombre}"?`)) return;
    this.api.deleteTipoFalta(tipo.id_tipo_falta).subscribe({
      next: () => {
        this.success.set('Tipo eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
