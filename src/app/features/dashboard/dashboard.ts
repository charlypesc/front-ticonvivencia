import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfidencialService } from '../../core/services/confidencial.service';
import { Permiso } from '../../core/constants/permisos';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FechaPipe, CursoNombrePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  loading = signal(true);
  resumen = signal<any>(null);
  usuario = computed(() => this.auth.usuario());
  protected readonly Permiso = Permiso;

  /**
   * El bloque de cumplimiento solo muestra alertas (las que están en cero se
   * ocultan): si no hay ninguna, tampoco se muestra el título solo.
   */
  cumplimiento = computed(() => {
    const c = this.resumen()?.cumplimiento;
    if (!c) return null;
    const hayAlertas =
      c.pasos_por_vencer > 0 || c.pasos_vencidos > 0 || c.registros_sin_protocolo > 0 ||
      c.cautelares_sin_resolver > 0 || c.notificaciones_pendientes > 0 ||
      c.medidas_vencidas > 0 || c.investigaciones_fuera_de_plazo > 0;
    return hayAlertas ? c : null;
  });

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private confidencial: ConfidencialService,
  ) {}

  readonly MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  readonly mesActual = new Date().getMonth();

  /** Registros por mes: cada barra en % del mes más alto (mínimo 1 para no dividir por 0). */
  porMes = computed(() => {
    const datos: number[] = this.resumen()?.graficos?.registros_por_mes ?? [];
    const max = Math.max(1, ...datos);
    return datos.map((n, i) => ({ mes: this.MESES[i], n, alto: (n / max) * 100 }));
  });

  protocolosPorTipo = computed(() => {
    const datos: any[] | null = this.resumen()?.graficos?.protocolos_por_tipo ?? null;
    if (!datos) return null;
    const max = Math.max(1, ...datos.map((d) => d.n));
    return datos.map((d) => ({ ...d, ancho: (d.n / max) * 100 }));
  });

  /** Lo que se ingresó en el año por tipo de documento (el "ingresos" de MiConvivencia). */
  ingresos = computed(() => {
    const i = this.resumen()?.graficos?.ingresos;
    if (!i) return [];
    const filas = [
      { nombre: 'Registros', n: i.registros },
      { nombre: 'Protocolos activados', n: i.protocolos },
      { nombre: 'Medidas disciplinarias', n: i.medidas_disciplinarias },
      { nombre: 'Medidas de protección', n: i.medidas_proteccion },
    ].filter((f) => f.n !== undefined && f.n !== null);
    const max = Math.max(1, ...filas.map((f) => f.n));
    return filas.map((f) => ({ ...f, ancho: (f.n / max) * 100 }));
  });

  hayAlertasEstudiantes = computed(() => {
    const a = this.resumen()?.alertas;
    return !!a && (a.afectados_reiterados.length > 0 || a.senalados_bullying.length > 0);
  });

  atendiendo = signal<number | null>(null);
  errorAtender = signal('');

  /** El coordinador ataja el registro y lo abre para trabajarlo o derivarlo. */
  atender(r: any, ev: Event) {
    ev.stopPropagation();
    this.atendiendo.set(r.id_registro);
    this.errorAtender.set('');
    this.api.atenderRegistro(r.id_registro).subscribe({
      next: () => {
        this.atendiendo.set(null);
        this.abrirRegistro(r);
      },
      error: (err) => {
        this.atendiendo.set(null);
        this.errorAtender.set(err.error?.message ?? 'No se pudo tomar el registro');
        this.cargar();
      },
    });
  }

  verEstudiante(e: any) {
    this.router.navigate(['/estudiantes'], { queryParams: { rut: `${e.run}-${e.dv}` } });
  }

  ngOnInit() {
    this.cargar();
  }

  private cargar() {
    this.api.getDashboard().subscribe({
      next: (data) => {
        this.resumen.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  esConfidencialBloqueado(r: any) {
    return this.confidencial.estaBloqueado(r);
  }

  abrirRegistro(r: any) {
    if (this.confidencial.bloqueaApertura(r)) return;
    // El id viaja por query param: la lista de registros es la dueña del
    // formulario, así que abrirlo desde acá es pedirle a ella que lo abra.
    this.router.navigate(['/registros'], { queryParams: { abrir: r.id_registro } });
  }
}
