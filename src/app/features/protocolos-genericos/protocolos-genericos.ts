import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-protocolos-genericos',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoAjustarTextarea, Puede],
  templateUrl: './protocolos-genericos.html',
  styleUrl: './protocolos-genericos.scss',
})
export class ProtocolosGenericos implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  protocolos = signal<any[]>([]);
  /**
   * Genéricos que el establecimiento ya adoptó: id_protocolo →
   * id_protocolo_establecimiento. Se guarda el id de la adopción, no solo un
   * flag, porque es el que necesita el DELETE para quitarla.
   */
  adoptados = signal<Map<number, number>>(new Map());
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');
  adoptandoTodos = signal(false);

  /** Los que aún no adoptó el establecimiento: lo que haría "Adoptar todos". */
  pendientes = computed(() =>
    this.protocolos().filter((p) => !this.adoptados().has(p.id_protocolo)),
  );

  form = {
    nombre: '',
    descripcion: '',
  };

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private confirmService: ConfirmService,
  ) {}

  // El catálogo genérico es compartido por todos los establecimientos: solo el
  // ADMIN lo escribe.
  puedeCrear = () => this.auth.can(Permiso.ProtocoloGenericoCrear);
  puedeEditar = () => this.auth.can(Permiso.ProtocoloGenericoEditar);
  puedeEliminar = () => this.auth.can(Permiso.ProtocoloGenericoEliminar);

  // Quien puede adoptar (encargado, psicólogo) lo hace desde este mismo
  // catálogo: es la pantalla donde ve la oferta completa. La copia adoptada
  // después se adapta en "Protocolos del establecimiento".
  puedeAdoptar = () => this.auth.can(Permiso.ProtocoloEstablecimientoCrear);
  puedeQuitar = () => this.auth.can(Permiso.ProtocoloEstablecimientoEliminar);

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
    this.cargarAdoptados();
  }

  private cargarAdoptados() {
    if (!this.puedeAdoptar() && !this.puedeQuitar()) return;
    this.api.getProtocolosEstablecimiento().subscribe({
      // Un ADMIN sin establecimiento elegido recibe 400: no es un error que
      // deba mostrarse, simplemente no hay adopciones que marcar.
      next: (data) =>
        this.adoptados.set(
          new Map(data.map((p: any) => [p.id_protocolo, p.id_protocolo_establecimiento])),
        ),
      error: () => this.adoptados.set(new Map()),
    });
  }

  yaAdoptado = (protocolo: any) => this.adoptados().has(protocolo.id_protocolo);

  adoptar(protocolo: any) {
    if (!this.puedeAdoptar() || this.yaAdoptado(protocolo)) return;
    this.error.set('');
    this.success.set('');
    this.api.createProtocoloEstablecimiento({ id_protocolo: protocolo.id_protocolo }).subscribe({
      next: () => {
        this.success.set(`"${protocolo.nombre}" adoptado. Ya puedes adaptarlo en Protocolos del establecimiento.`);
        this.cargarAdoptados();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al adoptar el protocolo'),
    });
  }

  async adoptarTodos() {
    const pendientes = this.pendientes();
    if (!this.puedeAdoptar() || pendientes.length === 0 || this.adoptandoTodos()) return;

    const confirmado = await this.confirmService.confirmarAccion(
      `¿Adoptar los ${pendientes.length} protocolos que aún no tiene tu establecimiento? Después podrás quitar los que no apliquen.`,
    );
    if (!confirmado) return;

    this.error.set('');
    this.success.set('');
    this.adoptandoTodos.set(true);

    // Secuencial y no en paralelo: son pocas filas y así un fallo a mitad de
    // camino deja un estado claro (los anteriores quedaron adoptados) en vez de
    // una ráfaga de peticiones simultáneas contra el pool de conexiones.
    let adoptados = 0;
    for (const p of pendientes) {
      try {
        await firstValueFrom(
          this.api.createProtocoloEstablecimiento({ id_protocolo: p.id_protocolo }),
        );
        adoptados++;
      } catch (err: any) {
        // 409 = ya estaba adoptado (otra pestaña, o la lista quedó vieja): no
        // es un fallo real, se sigue con el resto.
        if (err.status === 409) continue;
        this.error.set(
          `Se adoptaron ${adoptados} de ${pendientes.length}. Falló en "${p.nombre}": ${err.error?.message ?? 'error al adoptar'}`,
        );
        break;
      }
    }

    this.adoptandoTodos.set(false);
    if (adoptados > 0 && !this.error())
      this.success.set(`${adoptados} protocolo(s) adoptados por tu establecimiento`);
    this.cargarAdoptados();
  }

  async quitar(protocolo: any) {
    const idAdopcion = this.adoptados().get(protocolo.id_protocolo);
    if (!this.puedeQuitar() || !idAdopcion) return;

    // Quitar la adopción borra también el texto que el establecimiento hubiera
    // adaptado, así que se avisa antes de confirmar.
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Quitar "${protocolo.nombre}" de tu establecimiento? Se perderá el texto que hayas adaptado. El protocolo genérico no se elimina.`,
    );
    if (!confirmado) return;

    this.error.set('');
    this.success.set('');
    this.api.deleteProtocoloEstablecimiento(idAdopcion).subscribe({
      next: () => {
        this.success.set(`"${protocolo.nombre}" quitado de tu establecimiento`);
        this.cargarAdoptados();
      },
      // El backend responde 409 si el protocolo tiene activaciones asociadas.
      error: (err) => this.error.set(err.error?.message ?? 'Error al quitar el protocolo'),
    });
  }

  abrirForm(protocolo?: any) {
    if (protocolo ? !this.puedeEditar() : !this.puedeCrear()) return;
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
