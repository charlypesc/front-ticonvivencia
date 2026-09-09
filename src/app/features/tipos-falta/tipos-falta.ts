import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';

@Component({
  selector: 'app-tipos-falta',
  standalone: true,
  imports: [EtiquetaPipe, CommonModule, FormsModule, Puede, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './tipos-falta.html',
  styleUrl: './tipos-falta.scss',
})
export class TiposFalta implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  tiposFalta = signal<any[]>([]);
  /** Protocolos que el establecimiento tiene adoptados, para poder vincularlos. */
  protocolos = signal<any[]>([]);
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

  // Vínculo con los protocolos que esta falta debe disparar (Ley 21.809).
  //
  // Se edita como un mapa id -> obligatorio en vez de un arreglo porque el
  // template necesita saber, por cada protocolo de la lista, si está tildado y
  // en qué modo. Se arma el arreglo recién al guardar.
  vinculos: Record<number, 'sugerido' | 'obligatorio'> = {};

  estadoVinculo(id: number): string {
    return this.vinculos[id] ?? '';
  }

  cambiarVinculo(id: number, valor: string) {
    if (!valor) delete this.vinculos[id];
    else this.vinculos[id] = valor as 'sugerido' | 'obligatorio';
  }

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getProtocolosEstablecimiento().subscribe({
      next: (data) => this.protocolos.set(data),
      // Sin protocolos adoptados no se puede vincular nada, pero el mantenedor
      // de faltas tiene que seguir funcionando igual.
      error: () => this.protocolos.set([]),
    });
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
      this.vinculos = {};
      for (const p of tipo.protocolos ?? [])
        this.vinculos[p.id_protocolo_establecimiento] = p.obligatorio ? 'obligatorio' : 'sugerido';
    } else {
      this.editando.set(null);
      this.form = { nombre: '', gravedad: '', descripcion: '', medida_sugerida: '' };
      this.vinculos = {};
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
      next: (res: any) => this.guardarVinculos(this.editando()?.id_tipo_falta ?? res?.id_tipo_falta),
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  /**
   * Los vínculos van en un segundo request porque son otro endpoint (y otro
   * permiso: quien edita el texto de una falta no necesariamente decide qué
   * protocolo dispara). Si este falla, la falta ya quedó guardada y hay que
   * decirlo, igual que hace el formulario de registros con la activación.
   */
  private guardarVinculos(idTipoFalta: number | undefined) {
    const exito = this.editando() ? 'Tipo actualizado' : 'Tipo creado';

    if (!idTipoFalta) {
      this.success.set(exito);
      this.cerrarForm();
      this.cargar();
      return;
    }

    const protocolos = Object.entries(this.vinculos).map(([id, modo]) => ({
      id_protocolo_establecimiento: Number(id),
      obligatorio: modo === 'obligatorio',
    }));

    this.api.setProtocolosTipoFalta(idTipoFalta, protocolos).subscribe({
      next: () => {
        this.success.set(exito);
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => {
        this.cargar();
        this.error.set(
          `${exito}, pero no se pudieron guardar los protocolos vinculados: ` +
            (err.error?.message ?? 'error del servidor'),
        );
      },
    });
  }

  async eliminar(tipo: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${tipo.nombre}"?`))) return;
    this.api.deleteTipoFalta(tipo.id_tipo_falta).subscribe({
      next: () => {
        this.success.set('Tipo eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
