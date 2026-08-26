import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.services';

/**
 * Campana de la barra superior: la bandeja de avisos del usuario en sesión.
 *
 * Hasta acá el sistema era 100% "pull" — todo quedaba en la bitácora de cada
 * caso, pero nadie se enteraba de un paso asignado ni de un plazo vencido si no
 * entraba a mirar. Este es el primer canal; correo y push se agregan después
 * enganchándose al mismo servicio del backend, sin tocar esta pantalla.
 *
 * El badge se refresca por polling y no por websocket a propósito: un aviso que
 * llega hasta un minuto tarde no cambia nada (los plazos son de horas o días) y
 * un socket abierto agrega infraestructura que hoy no se necesita.
 */
@Component({
  selector: 'app-campana-notificaciones',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campana-notificaciones.html',
  styleUrl: './campana-notificaciones.scss',
})
export class CampanaNotificaciones implements OnInit, OnDestroy {
  abierto = signal(false);
  sinLeer = signal(0);
  items = signal<any[]>([]);
  cargando = signal(false);

  /** El badge no muestra números grandes: "99+" ocupa lo mismo y se lee igual. */
  badge = computed(() => (this.sinLeer() > 99 ? '99+' : String(this.sinLeer())));

  private timer: any = null;
  private readonly INTERVALO_MS = 60_000;

  constructor(
    private api: ApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.refrescarContador();
    this.timer = setInterval(() => this.refrescarContador(), this.INTERVALO_MS);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** El error se traga: la campana es accesoria y no debe llenar la pantalla de
   *  alertas si el backend está caído — el resto de la app ya lo va a avisar. */
  private refrescarContador() {
    this.api.getContadorNotificaciones().subscribe({
      next: (r) => this.sinLeer.set(r.sin_leer),
      error: () => {},
    });
  }

  alternar() {
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    // El listado se pide al abrir y no en cada refresco del contador: el badge
    // se consulta cada minuto y traer 30 filas cada vez sería gratuito solo en
    // apariencia.
    if (abrir) this.cargar();
  }

  cerrar() {
    this.abierto.set(false);
  }

  private cargar() {
    this.cargando.set(true);
    this.api.getNotificaciones().subscribe({
      next: (data) => {
        this.items.set(data);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  /**
   * Click en un aviso: lo marca leído y lleva al caso.
   *
   * El contador se baja acá mismo en vez de esperar la respuesta: si el PUT
   * falla, el badge vuelve a su valor real en el siguiente refresco, y mientras
   * tanto la campana no se queda mostrando algo que la persona ya leyó.
   */
  abrirNotificacion(n: any) {
    if (!n.leida) {
      n.leida = true;
      this.sinLeer.update((v) => Math.max(0, v - 1));
      this.api.marcarNotificacionLeida(n.id_notificacion).subscribe({ error: () => {} });
    }
    this.cerrar();
    if (n.url) this.router.navigateByUrl(n.url);
  }

  marcarTodas() {
    this.api.marcarTodasNotificacionesLeidas().subscribe({
      next: () => {
        this.items.update((lista) => lista.map((n) => ({ ...n, leida: true })));
        this.sinLeer.set(0);
      },
      error: () => {},
    });
  }

  icono(tipo: string) {
    return (
      {
        paso_en_curso: 'ti-player-play',
        paso_reasignado: 'ti-user-share',
        paso_vencido: 'ti-alert-triangle',
        protocolo_activado: 'ti-shield-check',
        protocolo_cerrado: 'ti-lock',
        protocolo_anulado: 'ti-ban',
      }[tipo] ?? 'ti-bell'
    );
  }
}
