import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import QRCode from 'qrcode';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { RegistroForm } from '../registros/registros-form/registro-form';
import { descargarPdf, imprimirPdf } from '../../shared/utils/pdf-salida';

/**
 * "QR denuncias": el canal de denuncias con reserva de identidad que exige la
 * Ley 21.809 (art. 46 letra e de la LGE).
 *
 * Arriba, el QR y el link del formulario público para difundirlo (afiche
 * imprimible). Abajo, la bandeja de lo que entra: cada denuncia se convierte en
 * registro —y desde el registro se deriva o se activa protocolo, como siempre—
 * o se desestima con motivo.
 *
 * La identidad de quien denunció con reserva no viene en el listado ni en el
 * detalle: se pide aparte y el backend deja constancia de quién la miró.
 */
@Component({
  selector: 'app-denuncias',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, CerrarConEsc, AutoAjustarTextarea, FechaPipe, RegistroForm],
  templateUrl: './denuncias.html',
  styleUrl: './denuncias.scss',
})
export class Denuncias implements OnInit {
  protected readonly Permiso = Permiso;
  private destroyRef = inject(DestroyRef);

  // Canal
  token = signal('');
  nombreColegio = signal('');
  qr = signal('');
  copiado = signal(false);
  mostrarAfiche = signal(false);
  link = computed(() => (this.token() ? `${location.origin}/denuncia/${this.token()}` : ''));

  // Bandeja
  denuncias = signal<any[]>([]);
  loading = signal(true);
  filtro = signal('');
  error = signal('');
  success = signal('');
  pendientes = computed(
    () => this.denuncias().filter((d) => d.estado === 'nueva' || d.estado === 'en_revision').length,
  );

  // Detalle
  detalle = signal<any | null>(null);
  cargandoDetalle = signal(false);
  identidad = signal<any | null>(null);
  errorDetalle = signal('');
  mostrarDesestimar = signal(false);
  motivo = '';
  enviando = signal(false);

  // Crear registro desde la denuncia
  denunciaParaRegistro = signal<any | null>(null);

  readonly estados = [
    { valor: '', etiqueta: 'Todas' },
    { valor: 'nueva', etiqueta: 'Nuevas' },
    { valor: 'en_revision', etiqueta: 'En revisión' },
    { valor: 'convertida', etiqueta: 'Con registro' },
    { valor: 'desestimada', etiqueta: 'Desestimadas' },
  ];

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private confirmService: ConfirmService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cargarCanal();
    this.cargar();

    // La campana abre una denuncia puntual con ?abrir=<id>, igual que registros.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const abrir = Number(q.get('abrir'));
      if (abrir && this.detalle()?.id_denuncia !== abrir) this.abrir({ id_denuncia: abrir });
    });
  }

  // ── Canal ──────────────────────────────────────────────────────────────────

  private cargarCanal() {
    this.api.getCanalDenuncias().subscribe({
      next: (c) => {
        this.nombreColegio.set(c.nombre_establecimiento);
        this.ponerToken(c.token);
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar el canal de denuncias'),
    });
  }

  private ponerToken(token: string) {
    this.token.set(token);
    QRCode.toDataURL(this.link(), { width: 360, margin: 1, errorCorrectionLevel: 'M' })
      .then((url: string) => this.qr.set(url))
      .catch(() => this.qr.set(''));
  }

  async copiarLink() {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.error.set('No se pudo copiar: selecciona el link y cópialo a mano');
    }
  }

  async regenerar() {
    const ok = await this.confirmService.confirmarAccion(
      'Se generará un QR y un link nuevos. Los afiches impresos y el link que ya circulan dejarán de funcionar. ¿Continuar?',
    );
    if (!ok) return;
    this.api.regenerarCanalDenuncias().subscribe({
      next: (r) => {
        this.ponerToken(r.token);
        this.mostrarExito(r.message);
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo regenerar el QR'),
    });
  }

  /**
   * El afiche se dibuja en un canvas y sale como imagen: así "Imprimir" y
   * "Descargar" entregan exactamente lo mismo, y no hace falta generar un PDF
   * en el servidor para algo que es solo un QR con un par de líneas de texto.
   */
  private async afiche(): Promise<Blob> {
    const W = 1240;
    const H = 1754; // A4 a 150 dpi
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1e3a6e';
    g.fillRect(0, 0, W, 260);

    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = 'bold 72px Inter, system-ui, sans-serif';
    g.fillText('¿Te pasó algo?', W / 2, 130);
    g.font = '40px Inter, system-ui, sans-serif';
    g.fillText('Cuéntanos. Puedes hacerlo sin decir tu nombre.', W / 2, 200);

    const qrUrl = await QRCode.toDataURL(this.link(), { width: 760, margin: 1, errorCorrectionLevel: 'M' });
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail();
      img.src = qrUrl;
    });
    g.drawImage(img, (W - 760) / 2, 340, 760, 760);

    g.fillStyle = '#111827';
    g.font = 'bold 44px Inter, system-ui, sans-serif';
    g.fillText('Escanea el código con la cámara de tu teléfono', W / 2, 1200);
    g.fillStyle = '#4b5563';
    g.font = '34px Inter, system-ui, sans-serif';
    const lineas = [
      'Acoso, burlas, peleas, discriminación, algo en redes sociales',
      'o cualquier situación que te haga sentir mal o insegura/o.',
      'Lo recibe el equipo de convivencia escolar y tu identidad se resguarda.',
    ];
    lineas.forEach((l, i) => g.fillText(l, W / 2, 1290 + i * 52));

    g.fillStyle = '#9ca3af';
    g.font = '28px Inter, system-ui, sans-serif';
    g.fillText(this.link(), W / 2, 1520);
    g.fillStyle = '#1e3a6e';
    g.font = 'bold 40px Inter, system-ui, sans-serif';
    g.fillText(this.nombreColegio(), W / 2, 1640);

    return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'));
  }

  async salidaAfiche(accion: 'imprimir' | 'descargar') {
    const blob = await this.afiche();
    if (accion === 'descargar') descargarPdf(blob, 'afiche-canal-denuncias.png');
    else imprimirImagen(blob);
    this.mostrarAfiche.set(false);
  }

  // ── Bandeja ────────────────────────────────────────────────────────────────

  cargar() {
    this.loading.set(true);
    this.api.getDenuncias(this.filtro()).subscribe({
      next: (data) => {
        this.denuncias.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'No se pudieron cargar las denuncias');
      },
    });
  }

  filtrar(valor: string) {
    this.filtro.set(valor);
    this.cargar();
  }

  etiquetaEstado(estado: string) {
    return this.estados.find((e) => e.valor === estado)?.etiqueta.replace(/s$/, '') ?? estado;
  }

  abrir(d: any) {
    this.detalle.set(null);
    this.identidad.set(null);
    this.errorDetalle.set('');
    this.mostrarDesestimar.set(false);
    this.motivo = '';
    this.cargandoDetalle.set(true);
    this.api.getDenuncia(d.id_denuncia).subscribe({
      next: (det) => {
        this.detalle.set(det);
        this.cargandoDetalle.set(false);
        // Abrirla la pasa a "en revisión": el listado tiene que reflejarlo.
        this.denuncias.update((l) =>
          l.map((x) => (x.id_denuncia === det.id_denuncia ? { ...x, estado: det.estado } : x)),
        );
      },
      error: (err) => {
        this.cargandoDetalle.set(false);
        this.error.set(err.error?.message ?? 'No se pudo abrir la denuncia');
        this.limpiarAbrir();
      },
    });
  }

  cerrarDetalle() {
    this.detalle.set(null);
    this.identidad.set(null);
    this.limpiarAbrir();
  }

  private limpiarAbrir() {
    if (this.route.snapshot.queryParamMap.has('abrir'))
      this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  async verIdentidad() {
    const ok = await this.confirmService.confirmarAccion(
      'Vas a ver quién hizo esta denuncia con reserva de identidad. Quedará registrado que la consultaste. ¿Continuar?',
    );
    if (!ok) return;
    this.api.getIdentidadDenuncia(this.detalle().id_denuncia).subscribe({
      next: (i) => this.identidad.set(i),
      error: (err) => this.errorDetalle.set(err.error?.message ?? 'No se pudo obtener la identidad'),
    });
  }

  verArchivo(a: any) {
    this.api.getArchivoDenuncia(this.detalle().id_denuncia, a.id_archivo).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.errorDetalle.set('No se pudo abrir el archivo'),
    });
  }

  gestionable(d: any) {
    return d?.estado === 'nueva' || d?.estado === 'en_revision';
  }

  desestimar() {
    if (!this.motivo.trim()) {
      this.errorDetalle.set('Indica el motivo para desestimar la denuncia');
      return;
    }
    this.enviando.set(true);
    this.api.desestimarDenuncia(this.detalle().id_denuncia, this.motivo.trim()).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.cerrarDetalle();
        this.mostrarExito(r.message);
        this.cargar();
      },
      error: (err) => {
        this.enviando.set(false);
        this.errorDetalle.set(err.error?.message ?? 'No se pudo desestimar la denuncia');
      },
    });
  }

  crearRegistro() {
    this.denunciaParaRegistro.set(this.detalle());
    this.detalle.set(null);
  }

  cerrarRegistro(mensaje?: string) {
    this.denunciaParaRegistro.set(null);
    this.limpiarAbrir();
    if (!mensaje) return;
    this.mostrarExito(`${mensaje}. La denuncia quedó vinculada al registro; derívalo desde Registros si corresponde.`);
    this.cargar();
  }

  irAlRegistro(d: any) {
    this.router.navigate(['/registros'], { queryParams: { abrir: d.id_registro } });
  }

  private mostrarExito(mensaje: string) {
    this.success.set(mensaje);
    setTimeout(() => this.success.set(''), 6000);
  }
}

/** Mismo iframe oculto que imprimirPdf, pero con la imagen dentro de una página. */
function imprimirImagen(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const html = `<!doctype html><html><head><style>
    @page { size: A4; margin: 0 } html,body { margin: 0 } img { width: 100%; display: block }
  </style></head><body><img src="${url}"></body></html>`;
  imprimirPdf(new Blob([html], { type: 'text/html' }));
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
