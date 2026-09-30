import { Component, DestroyRef, OnInit, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { ConfidencialService } from '../../core/services/confidencial.service';
import { RegistroForm } from './registros-form/registro-form';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-registros',
  standalone: true,
  imports: [FechaPipe, CommonModule, FormsModule, RegistroForm, Puede],
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
  private destroyRef = inject(DestroyRef);
  // ── Filtros ───────────────────────────────────────────────────────────────
  // Todos en el cliente: la lista ya viene completa del backend y filtrar acá
  // es instantáneo. Se combinan entre sí y con la búsqueda de texto.
  panelFiltro = signal<'fecha' | 'motivo' | null>(null);
  /** 'yyyy-MM-dd' contra fecha_incidente (DATE, llega como string: se compara tal cual). */
  fechaDesde = signal('');
  fechaHasta = signal('');
  motivosElegidos = signal<string[]>([]);

  /** Los motivos que aparecen en los registros, con cuántos hay de cada uno. */
  motivosDisponibles = computed(() => {
    const cuenta = new Map<string, number>();
    for (const r of this.registros())
      if (r.tipo_falta_nombre) cuenta.set(r.tipo_falta_nombre, (cuenta.get(r.tipo_falta_nombre) ?? 0) + 1);
    return [...cuenta.entries()]
      .map(([nombre, n]) => ({ nombre, n }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  hayFiltroFecha = computed(() => !!(this.fechaDesde() || this.fechaHasta()));

  filtrados = computed(() => {
    const q = this.busqueda().toLowerCase();
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();
    const motivos = this.motivosElegidos();
    return this.registros().filter((r) => {
      const fecha = String(r.fecha_incidente ?? '').slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (motivos.length && !motivos.includes(r.tipo_falta_nombre)) return false;
      // Sin texto no se descarta nada: un confidencial bloqueado no trae asunto
      // ni motivo, y la comparación de abajo lo dejaba fuera de la lista.
      if (!q) return true;
      return (
        r.asunto?.toLowerCase().includes(q) || r.tipo_falta_nombre?.toLowerCase().includes(q) ||
        r.encargado_nombre?.toLowerCase().includes(q) || r.alumno_nombre?.toLowerCase().includes(q)
      );
    });
  });

  alternarPanel(panel: 'fecha' | 'motivo') {
    this.panelFiltro.set(this.panelFiltro() === panel ? null : panel);
  }

  /** Atajos de fecha: días hacia atrás desde hoy, o 'mes' para el mes en curso. */
  atajoFecha(atajo: number | 'mes') {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hoy = new Date();
    const desde = atajo === 'mes'
      ? new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atajo);
    this.fechaDesde.set(iso(desde));
    this.fechaHasta.set(iso(hoy));
  }

  limpiarFecha() {
    this.fechaDesde.set('');
    this.fechaHasta.set('');
  }

  alternarMotivo(nombre: string) {
    const actuales = this.motivosElegidos();
    this.motivosElegidos.set(
      actuales.includes(nombre) ? actuales.filter((m) => m !== nombre) : [...actuales, nombre],
    );
  }

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
    private confidencial: ConfidencialService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cargar();

    // El dashboard y la campana abren un registro puntual navegando con
    // ?abrir=<id>. Se abre sin esperar la lista: el formulario pide el detalle
    // por su cuenta. Suscripción y no snapshot: una notificación clickeada
    // estando ya en esta pantalla solo cambia el query param, no la recrea.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const abrir = Number(q.get('abrir'));
      if (!abrir || this.itemMove?.id_registro === abrir) return;
      // Cerrar y reabrir en el tick siguiente: si ya había otro registro
      // abierto, el formulario tiene que recrearse para cargar el nuevo.
      this.mostrarForm.set(false);
      setTimeout(() => this.abrirForm({ id_registro: abrir }));
    });
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

  vencida(fecha: string | null) {
    return !!fecha && new Date(fecha).getTime() < Date.now();
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
