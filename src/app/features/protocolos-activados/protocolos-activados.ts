import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-protocolos-activados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './protocolos-activados.html',
  styleUrl: './protocolos-activados.scss',
})
export class ProtocolosActivados implements OnInit {
  activados = signal<any[]>([]);
  protocolosEstablecimiento = signal<any[]>([]);
  registros = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  form = {
    id_protocolo_establecimiento: null as number | null,
    id_registro: null as number | null,
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
    this.api.getProtocolosEstablecimiento().subscribe({
      next: (data) => this.protocolosEstablecimiento.set(data),
    });
    this.api.getRegistros().subscribe({
      next: (data) => this.registros.set(data),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocolosActivados().subscribe({
      next: (data) => {
        this.activados.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(activado?: any) {
    this.error.set('');
    this.success.set('');
    if (activado) {
      this.editando.set(activado);
      this.form = {
        id_protocolo_establecimiento: activado.id_protocolo_establecimiento,
        id_registro: activado.id_registro,
      };
    } else {
      this.editando.set(null);
      this.form = { id_protocolo_establecimiento: null, id_registro: null };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.id_protocolo_establecimiento || !this.form.id_registro) {
      this.error.set('Debe seleccionar un protocolo y un registro');
      return;
    }

    const request = this.editando()
      ? this.api.updateProtocoloActivado(this.editando().id_protocolo_activado, this.form)
      : this.api.createProtocoloActivado(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Protocolo actualizado' : 'Protocolo activado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  eliminar(activado: any) {
    if (!confirm(`¿Eliminar la activación del protocolo "${activado.nombre}"?`)) return;
    this.error.set('');
    this.api.deleteProtocoloActivado(activado.id_protocolo_activado).subscribe({
      next: () => {
        this.success.set('Activación eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
