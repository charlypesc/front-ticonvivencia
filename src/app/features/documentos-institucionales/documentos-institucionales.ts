import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hoyIso } from '../../shared/utils/fecha';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';

/**
 * RICE y Plan de Gestión, y las constancias de que se entregaron (art. 16 G).
 *
 * La ley obliga a entregarlos a los apoderados al matricular o renovar, y a
 * dejar constancia de la recepción. El sistema no entrega: el colegio entrega
 * por su canal y acá registra la fecha y adjunta el papel firmado.
 *
 * La pantalla se organiza alrededor de los PENDIENTES y no de lo entregado:
 * la obligación no se cumple sabiendo a quiénes se les entregó, sino sabiendo
 * a quiénes falta.
 */
@Component({
  selector: 'app-documentos-institucionales',
  standalone: true,
  imports: [FechaPipe, CommonModule, FormsModule, Puede, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './documentos-institucionales.html',
  styleUrl: './documentos-institucionales.scss',
})
export class DocumentosInstitucionales implements OnInit {
  protected readonly Permiso = Permiso;

  documentos = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  // Alta de versión
  mostrarForm = signal(false);
  archivo: File | null = null;
  form = {
    tipo: 'rice',
    titulo: '',
    descripcion: '',
    fecha_aprobacion: '',
    vigente_desde: '',
  };

  // Constancias del documento abierto
  documentoAbierto = signal<any | null>(null);
  constancias = signal<any[]>([]);
  pendientes = signal<any[]>([]);
  cargandoConstancias = signal(false);

  mostrarFormConstancia = signal(false);
  archivoConstancia: File | null = null;
  formConstancia = {
    id_estudiante: null as number | null,
    apoderado_nombre: '',
    apoderado_run: '',
    canal: 'impreso',
    motivo: 'matricula',
    fecha_entrega: hoyIso(),
    observaciones: '',
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getDocumentosInstitucionales().subscribe({
      next: (data) => {
        this.documentos.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  etiquetaTipo(tipo: string): string {
    return tipo === 'rice' ? 'Reglamento interno (RICE)' : 'Plan de Gestión';
  }

  // ── Alta de versión ───────────────────────────────────────────────────────

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.archivo = null;
    this.form = { tipo: 'rice', titulo: '', descripcion: '', fecha_aprobacion: '', vigente_desde: '' };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  /**
   * El value del input se limpia apenas se captura el archivo, no al final:
   * en Android el evento de selección puede dispararse dos veces y sin esto se
   * procesaría el mismo archivo dos veces.
   */
  onArchivo(ev: Event, destino: 'documento' | 'constancia') {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (destino === 'documento') this.archivo = file;
    else this.archivoConstancia = file;
  }

  guardar() {
    this.error.set('');
    if (!this.form.titulo.trim()) {
      this.error.set('Indicá el título del documento');
      return;
    }
    if (!this.archivo) {
      this.error.set('Adjuntá el documento');
      return;
    }

    const fd = new FormData();
    for (const [k, v] of Object.entries(this.form)) if (v) fd.append(k, v);
    fd.append('archivo', this.archivo);

    this.api.createDocumentoInstitucional(fd).subscribe({
      next: (res: any) => {
        this.success.set(res?.message ?? 'Documento cargado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al cargar el documento'),
    });
  }

  async publicar(doc: any) {
    const ok = await this.confirmService.confirmarAccion(
      `¿Poner vigente la versión ${doc.version} de "${doc.titulo}"? La versión vigente anterior ` +
        'queda como reemplazada, y las constancias nuevas se registran contra esta.',
    );
    if (!ok) return;

    this.api.publicarDocumentoInstitucional(doc.id_documento_institucional).subscribe({
      next: (res: any) => {
        this.success.set(res?.message ?? 'Documento vigente');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al publicar'),
    });
  }

  /** Abre el archivo en una pestaña. Va por blob porque el token viaja en la cabecera. */
  verDocumento(doc: any) {
    this.api.getArchivoDocumentoInstitucional(doc.id_documento_institucional).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.error.set('No se pudo abrir el documento'),
    });
  }

  verConstanciaFirmada(c: any) {
    this.api.getArchivoConstancia(c.id_constancia).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.error.set('No se pudo abrir la constancia'),
    });
  }

  // ── Constancias ───────────────────────────────────────────────────────────

  abrirConstancias(doc: any) {
    this.error.set('');
    this.documentoAbierto.set(doc);
    this.cargarConstancias();
  }

  cerrarConstancias() {
    this.documentoAbierto.set(null);
    this.constancias.set([]);
    this.pendientes.set([]);
  }

  cargarConstancias() {
    this.cargandoConstancias.set(true);
    this.api.getConstancias(this.documentoAbierto().id_documento_institucional).subscribe({
      next: (data) => {
        this.constancias.set(data.constancias ?? []);
        this.pendientes.set(data.pendientes ?? []);
        this.cargandoConstancias.set(false);
      },
      error: () => this.cargandoConstancias.set(false),
    });
  }

  abrirFormConstancia(estudiante?: any) {
    this.error.set('');
    this.archivoConstancia = null;
    this.formConstancia = {
      id_estudiante: estudiante?.id_estudiante ?? null,
      apoderado_nombre: '',
      apoderado_run: '',
      canal: 'impreso',
      motivo: 'matricula',
      fecha_entrega: hoyIso(),
      observaciones: '',
    };
    this.mostrarFormConstancia.set(true);
  }

  cerrarFormConstancia() {
    this.mostrarFormConstancia.set(false);
  }

  guardarConstancia() {
    this.error.set('');
    if (!this.formConstancia.id_estudiante || !this.formConstancia.apoderado_nombre.trim()) {
      this.error.set('Indicá el estudiante y el nombre del apoderado');
      return;
    }

    const fd = new FormData();
    for (const [k, v] of Object.entries(this.formConstancia)) if (v) fd.append(k, String(v));
    // El firmado es opcional: la entrega se anota el mismo día y el papel se
    // escanea después.
    if (this.archivoConstancia) fd.append('archivo', this.archivoConstancia);

    this.api
      .registrarConstancia(this.documentoAbierto().id_documento_institucional, fd)
      .subscribe({
        next: () => {
          this.success.set('Constancia registrada');
          this.cerrarFormConstancia();
          this.cargarConstancias();
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al registrar la constancia'),
      });
  }

  /** Adjuntar el firmado a una constancia que se registró sin él. */
  onFirmadaSeleccionada(ev: Event, c: any) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const fd = new FormData();
    fd.append('archivo', file);
    this.api.adjuntarConstanciaFirmada(c.id_constancia, fd).subscribe({
      next: () => {
        this.success.set('Constancia firmada adjuntada');
        this.cargarConstancias();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al adjuntar'),
    });
  }
}
