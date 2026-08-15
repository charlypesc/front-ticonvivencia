import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';

@Component({
  selector: 'app-protocolos-genericos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './protocolos-genericos.html',
  styleUrl: './protocolos-genericos.scss',
})
export class ProtocolosGenericos implements OnInit {
  protocolos = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  form = {
    nombre: '',
    descripcion: '',
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocolosGenericos().subscribe({
      next: (data) => {
        this.protocolos.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(protocolo?: any) {
    this.error.set('');
    this.success.set('');
    if (protocolo) {
      this.editando.set(protocolo);
      this.form = {
        nombre: protocolo.nombre,
        descripcion: protocolo.descripcion ?? '',
      };
    } else {
      this.editando.set(null);
      this.form = { nombre: '', descripcion: '' };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.nombre) {
      this.error.set('Nombre es requerido');
      return;
    }

    const request = this.editando()
      ? this.api.updateProtocoloGenerico(this.editando().id_protocolo, this.form)
      : this.api.createProtocoloGenerico(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Protocolo actualizado' : 'Protocolo creado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminar(protocolo: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar el protocolo genérico "${protocolo.nombre}"?`,
    );
    if (!confirmado) return;
    this.error.set('');
    this.api.deleteProtocoloGenerico(protocolo.id_protocolo).subscribe({
      next: () => {
        this.success.set('Protocolo eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
