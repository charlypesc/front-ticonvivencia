import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-protocolos-establecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoAjustarTextarea, Puede],
  templateUrl: './protocolos-establecimiento.html',
  styleUrl: './protocolos-establecimiento.scss',
})
export class ProtocolosEstablecimiento implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  protocolos = signal<any[]>([]);
  catalogo = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  // Al adoptar se elige el genérico; al editar solo se reescribe el texto local
  // (el backend ignora id_protocolo en el PUT).
  form = {
    id_protocolo: null as number | null,
    nombre: '',
    descripcion: '',
  };

  catalogoDisponible = computed(() => {
    const adoptados = new Set(this.protocolos().map((p) => p.id_protocolo));
    return this.catalogo().filter((c) => !adoptados.has(c.id_protocolo));
  });

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private confirmService: ConfirmService,
  ) {}

  puedeAdoptar = () => this.auth.can(Permiso.ProtocoloEstablecimientoCrear);
  puedeCrearPropio = () => this.auth.can(Permiso.ProtocoloEstablecimientoCrearPropio);
  puedeEditar = () => this.auth.can(Permiso.ProtocoloEstablecimientoEditar);
  puedeEliminar = () => this.auth.can(Permiso.ProtocoloEstablecimientoEliminar);

  /**
   * El mismo modal sirve para tres cosas distintas, y cada una es un permiso
   * aparte: adaptar el texto de un protocolo ya adoptado, redactar uno propio,
   * o adoptar uno del catálogo genérico.
   */
  permisoDelForm = () => {
    if (this.editando()) return Permiso.ProtocoloEstablecimientoEditar;
    if (this.creandoPropio()) return Permiso.ProtocoloEstablecimientoCrearPropio;
    return Permiso.ProtocoloEstablecimientoCrear;
  };

  /** true mientras el modal está creando un protocolo propio desde cero. */
  creandoPropio = signal(false);

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
    this.creandoPropio.set(false);
    if (protocolo) {
      if (!this.puedeEditar()) return;
      this.editando.set(protocolo);
      // Se precarga el texto efectivo (propio o heredado) para que el encargado
      // parta del genérico y lo ajuste, en vez de escribirlo desde cero.
      this.form = {
        id_protocolo: protocolo.id_protocolo,
        nombre: protocolo.nombre ?? '',
        descripcion: protocolo.descripcion ?? '',
      };
    } else {
      this.editando.set(null);
      this.form = { id_protocolo: null, nombre: '', descripcion: '' };
    }
    this.mostrarForm.set(true);
  }

  /** Abre el modal en blanco para redactar un protocolo propio del colegio. */
  abrirFormPropio() {
    if (!this.puedeCrearPropio()) return;
    this.error.set('');
    this.success.set('');
    this.editando.set(null);
    this.creandoPropio.set(true);
    this.form = { id_protocolo: null, nombre: '', descripcion: '' };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  /** Descarta la versión local y vuelve al texto del catálogo genérico. */
  restaurarGenerico() {
    const p = this.editando();
    if (!p) return;
    this.form.nombre = p.nombre_generico ?? '';
    this.form.descripcion = p.descripcion_generica ?? '';
  }

  guardar() {
    this.error.set('');

    if (this.creandoPropio()) {
      if (!this.form.nombre.trim()) {
        this.error.set('Nombre es requerido');
        return;
      }
      this.api
        .createProtocoloPropio({
          nombre: this.form.nombre.trim(),
          descripcion: this.form.descripcion.trim(),
        })
        .subscribe({
          next: () => {
            this.success.set('Protocolo propio creado');
            this.cerrarForm();
            this.cargar();
          },
          error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
        });
      return;
    }

    if (this.editando()) {
      if (!this.form.nombre.trim()) {
        this.error.set('Nombre es requerido');
        return;
      }
      const p = this.editando();
      // En un protocolo propio no hay genérico detrás: su texto se guarda tal
      // cual. En uno adoptado, enviar null cuando el texto quedó igual al
      // genérico deja la fila heredando, para que una corrección futura del
      // admin sí le llegue.
      const body = p.propio
        ? { nombre: this.form.nombre.trim(), descripcion: this.form.descripcion.trim() }
        : {
            nombre:
              this.form.nombre.trim() === (p.nombre_generico ?? '') ? null : this.form.nombre.trim(),
            descripcion:
              this.form.descripcion.trim() === (p.descripcion_generica ?? '')
                ? null
                : this.form.descripcion.trim(),
          };
      this.api.updateProtocoloEstablecimiento(p.id_protocolo_establecimiento, body).subscribe({
        next: () => {
          this.success.set('Protocolo actualizado');
          this.cerrarForm();
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
      });
      return;
    }

    if (!this.form.id_protocolo) {
      this.error.set('Debe seleccionar un protocolo');
      return;
    }
    this.api.createProtocoloEstablecimiento({ id_protocolo: this.form.id_protocolo }).subscribe({
      next: () => {
        this.success.set('Protocolo adoptado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminar(protocolo: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar el protocolo "${protocolo.nombre}" del establecimiento?`,
    );
    if (!confirmado) return;
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
