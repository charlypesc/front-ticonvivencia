import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { comprimirImagen } from '../../shared/utils/comprimir-imagen';

type Paso = 'upload' | 'validacion';

/** Mismo tope que el multer del backend. */
// Tope de la subida, alineado con el multer del backend. No es el límite de
// Document AI (20 MB): si el archivo llega por encima de eso, el backend lo
// comprime antes de mandarlo a procesar. Rechazar acá a los 20 MB dejaba
// afuera fotos y PDF que el sistema sí sabe manejar.
const MAX_SUBIDA = 50 * 1024 * 1024;

@Component({
  selector: 'app-subir-documento',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede],
  templateUrl: './subir-documento.html',
  styleUrl: './subir-documento.scss',
})
export class SubirDocumento {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  paso = signal<Paso>('upload');
  archivo = signal<File | null>(null);
  dragging = signal(false);
  loading = signal(false);
  comprimiendo = signal(false);
  error = signal('');
  respuestaIA = signal<any>(null);

  // Formulario editable con datos de la IA
  form = {
    fecha_incidente: '',
    asunto: '',
    antecedentes: '',
    acuerdos: '',
    id_tipo_falta: null as number | null,
    estudiantes: [] as any[],
    validado_humanamente: false,
  };

  // Confianza por campo (del nivel_confianza global por ahora)
  confianza = signal<Record<string, number>>({});

  constructor(
    private api: ApiService,
    private router: Router,
  ) {}

  // ── DRAG & DROP ──────────────────────────────
  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave() {
    this.dragging.set(false);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.setArchivo(file);
  }

  onFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.setArchivo(file);
  }

  async setArchivo(file: File) {
    this.error.set('');
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
    ];
    // Safari/Android a veces entregan las fotos HEIC con type vacío o
    // application/octet-stream, así que caemos a la extensión del nombre.
    const esHeicPorExtension = /\.(heic|heif)$/i.test(file.name);
    if (!allowed.includes(file.type) && !esHeicPorExtension) {
      this.error.set('Formato no admitido. Use JPG, PNG, HEIC o PDF');
      return;
    }
    // Las fotos pesadas no se rechazan: se comprimen. Solo si después de
    // comprimir sigue sin entrar (típicamente un PDF enorme, que el navegador
    // no puede recomprimir) le avisamos a la persona.
    this.comprimiendo.set(true);
    let archivo = file;
    try {
      archivo = await comprimirImagen(file);
    } catch {
      // Si la compresión falla por lo que sea, subimos el original.
    } finally {
      this.comprimiendo.set(false);
    }

    if (archivo.size > MAX_SUBIDA) {
      this.error.set('El archivo es demasiado grande para subirlo (máximo 50 MB)');
      return;
    }
    this.archivo.set(archivo);
  }

  // ── SUBIR ────────────────────────────────────
  cargarDocumento() {
    if (!this.archivo()) {
      this.error.set('Seleccione un archivo primero');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const formData = new FormData();
    formData.append('archivo', this.archivo()!);

    this.api.subirDocumento(formData).subscribe({
      next: (res: any) => {
        this.respuestaIA.set(res);
        this.poblarFormulario(res);
        this.loading.set(false);
        this.paso.set('validacion');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Error al procesar el documento');
      },
    });
  }

  poblarFormulario(res: any) {
    const d = res.datos_estructurados;
    this.form.fecha_incidente = d.fecha_incidente ?? '';
    this.form.asunto = d.asunto ?? '';
    this.form.antecedentes = d.antecedentes ?? '';
    this.form.acuerdos = d.acuerdos ?? '';
    this.form.id_tipo_falta = d.id_tipo_falta ?? null;
    this.form.estudiantes = d.estudiantes ?? [];

    // Simula confianza por campo basada en nivel_confianza global
    // Cuando Document AI retorne por campo, reemplazar aquí
    const c = res.nivel_confianza ?? 0;
    this.confianza.set({
      fecha_incidente: Math.min(c + 0.09, 1),
      asunto: Math.min(c + 0.03, 1),
      antecedentes: Math.max(c - 0.09, 0),
      acuerdos: Math.max(c - 0.14, 0),
    });
  }

  // ── VALIDACIÓN ───────────────────────────────
  getPct(campo: string): number {
    return Math.round((this.confianza()[campo] ?? 0) * 100);
  }

  getBarClass(campo: string): string {
    const pct = this.getPct(campo);
    if (pct >= 85) return 'bar--verde';
    if (pct >= 60) return 'bar--amarillo';
    return 'bar--rojo';
  }

  confirmar() {
    this.loading.set(true);
    this.api
      .confirmarRegistro(this.respuestaIA().id_registro, {
        ...this.form,
        estado_validacion: 'validado',
      })
      .subscribe({
        next: () => this.router.navigate(['/registros']),
        error: () => {
          this.loading.set(false);
          this.error.set('Error al confirmar el registro');
        },
      });
  }

  guardarPendiente() {
    this.router.navigate(['/registros']);
  }

  volver() {
    this.paso.set('upload');
    this.archivo.set(null);
    this.error.set('');
  }
}
