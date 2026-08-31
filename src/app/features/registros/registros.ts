import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { ConfidencialService } from '../../core/services/confidencial.service';
import { RegistroForm } from './registros-form/registro-form';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';

@Component({
  selector: 'app-registros',
  standalone: true,
  imports: [CommonModule, FormsModule, RegistroForm, Puede, EtiquetaPipe],
  templateUrl: './registros.html',
  styleUrl: './registros.scss',
})
export class Registros implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  registros = signal<any[]>([]);
  loading = signal(true);
  busqueda = signal('');
  mostrarForm = signal(false);
  error = signal('');
  success = signal('');
  itemMove: any;
  filtrados = computed(() => {
    const q = this.busqueda().toLowerCase();
    return this.registros().filter(
      (r) =>
        r.asunto?.toLowerCase().includes(q) || r.tipo_falta_nombre?.toLowerCase().includes(q),
    );
  });

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
    private confidencial: ConfidencialService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cargar();

    // El dashboard abre un registro puntual navegando con ?abrir=<id>. Se abre
    // sin esperar la lista: el formulario pide el detalle por su cuenta.
    const abrir = Number(this.route.snapshot.queryParamMap.get('abrir'));
    if (abrir) this.abrirForm({ id_registro: abrir });
  }

  private cargar() {
    this.loading.set(true);
    this.api.getRegistros().subscribe({
      next: (data) => {
        this.registros.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  esConfidencialBloqueado(r: any) {
    return this.confidencial.estaBloqueado(r);
  }

  /**
   * Lleva al caso del protocolo activado del registro. El backend ya elige
   * cuál: prefiere uno todavía activo y, entre varios, el más reciente. Si
   * hubiera más de uno, desde el caso se puede volver al listado completo.
   */
  seguirProtocolo(r: any) {
    if (!r.id_protocolo_activado) return;
    this.router.navigate(['/protocolos-activados', r.id_protocolo_activado]);
  }

  abrirForm(item: any = null) {
    // Se avisa con el modal del proyecto en vez de abrir el formulario: el
    // backend igual respondería 403, y así queda claro por qué no se abre.
    if (item && this.confidencial.bloqueaApertura(item)) return;

    this.itemMove = item;
    this.mostrarForm.set(true);
  }
  /**
   * `mensaje` solo llega cuando el modal se cerró por un guardado. Cancelar o
   * cerrar con la X no cambió nada en la base, así que ahí no se recarga: el
   * getAll de registros trae todo el listado con varias subconsultas por fila
   * y pedirlo de nuevo para nada agrega medio segundo a cada abrir-y-cerrar.
   */
  cerrarForm(mensaje?: string) {
    this.mostrarForm.set(false);
    this.itemMove = null;
    // Sin limpiar ?abrir el registro se volvería a abrir solo al recargar.
    if (this.route.snapshot.queryParamMap.has('abrir')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    }
    if (!mensaje) return;
    this.mostrarExito(mensaje);
    this.cargar();
  }

  /** El aviso se limpia solo: si no, queda pegado arriba el resto de la sesión. */
  private mostrarExito(mensaje: string) {
    this.success.set(mensaje);
    setTimeout(() => this.success.set(''), 4000);
  }

  async eliminar(r: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar el registro "${r.asunto}", esto eliminará los estudiantes asociados y el documento digitalizado asociado, estas seguro?`,
    );
    if (!confirmado) return;
    this.error.set('');
    this.api.deleteRegistro(r.id_registro).subscribe({
      next: () => this.cerrarForm('Registro eliminado'),
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al eliminar');
      },
    });
  }
}
