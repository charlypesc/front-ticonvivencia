import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-protocolos-establecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './protocolos-establecimiento.html',
  styleUrl: './protocolos-establecimiento.scss',
})
export class ProtocolosEstablecimiento implements OnInit {
  protocolos = signal<any[]>([]);
  catalogo = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  form = {
    id_protocolo: null as number | null,
  };

  catalogoDisponible = computed(() => {
    const adoptados = new Set(this.protocolos().map((p) => p.id_protocolo));
    return this.catalogo().filter(
      (c) => !adoptados.has(c.id_protocolo) || c.id_protocolo === this.editando()?.id_protocolo,
    );
  });

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
    this.api.getProtocolosGenericos().subscribe({
      next: (data) => this.catalogo.set(data),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocolosEstablecimiento().subscribe({
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
      this.form = { id_protocolo: protocolo.id_protocolo };
    } else {
      this.editando.set(null);
      this.form = { id_protocolo: null };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.id_protocolo) {
      this.error.set('Debe seleccionar un protocolo');
      return;
    }

    const request = this.editando()
      ? this.api.updateProtocoloEstablecimiento(
          this.editando().id_protocolo_establecimiento,
          this.form,
        )
      : this.api.createProtocoloEstablecimiento(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Protocolo actualizado' : 'Protocolo adoptado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  eliminar(protocolo: any) {
    if (!confirm(`¿Eliminar el protocolo "${protocolo.nombre}" del establecimiento?`)) return;
    this.error.set('');
    this.api.deleteProtocoloEstablecimiento(protocolo.id_protocolo_establecimiento).subscribe({
      next: () => {
        this.success.set('Protocolo eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
