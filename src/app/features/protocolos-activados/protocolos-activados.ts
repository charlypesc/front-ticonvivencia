import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';

@Component({
  selector: 'app-protocolos-activados',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, EtiquetaPipe],
  templateUrl: './protocolos-activados.html',
  styleUrl: './protocolos-activados.scss',
})
export class ProtocolosActivados implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

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

  constructor(
    private api: ApiService,
    private router: Router,
    private confirmService: ConfirmService,
  ) {}

  /** El caso se abre en su propia pantalla: es donde se ejecuta el protocolo. */
  abrirCaso(activado: any) {
    this.router.navigate(['/protocolos-activados', activado.id_protocolo_activado]);
  }

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

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.editando.set(null);
    this.form = { id_protocolo_establecimiento: null, id_registro: null };
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

    // Activar materializa el grafo del protocolo sobre el caso, así que la
    // respuesta trae el id: se entra directo a ejecutarlo en vez de dejar al
    // usuario buscándolo en la lista.
    this.api.createProtocoloActivado(this.form).subscribe({
      next: (r: any) => {
        this.cerrarForm();
        this.router.navigate(['/protocolos-activados', r.id_protocolo_activado]);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al activar');
        // El backend responde qué está mal en el grafo cuando no es publicable.
        if (err.error?.problemas?.length)
          this.error.set(`${err.error.message}: ${err.error.problemas.join(' · ')}`);
      },
    });
  }

  async eliminar(activado: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar la activación del protocolo "${activado.nombre}"?`,
    );
    if (!confirmado) return;
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
