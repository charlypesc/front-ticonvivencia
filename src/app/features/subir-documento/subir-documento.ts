import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';

type Paso = 'upload' | 'validacion';

@Component({
  selector: 'app-subir-documento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subir-documento.html',
  styleUrl: './subir-documento.scss',
})
export class SubirDocumento {
  paso = signal<Paso>('upload');
  archivo = signal<File | null>(null);
  dragging = signal(false);
  loading = signal(false);
  error = signal('');
  respuestaIA = signal<any>(null);

  // Formulario editable con datos de la IA
  form = {
    fecha_incidente: '',
    tematica: '',
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

  setArchivo(file: File) {
    this.error.set('');
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.error.set('Formato no admitido. Use JPG, PNG o PDF');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.error.set('El archivo supera el tamaño máximo permitido (10 MB)');
      return;
    }
    this.archivo.set(file);
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
    this.form.tematica = d.tematica ?? '';
    this.form.antecedentes = d.antecedentes ?? '';
    this.form.acuerdos = d.acuerdos ?? '';
    this.form.id_tipo_falta = d.id_tipo_falta ?? null;
    this.form.estudiantes = d.estudiantes ?? [];

    // Simula confianza por campo basada en nivel_confianza global
    // Cuando Document AI retorne por campo, reemplazar aquí
    const c = res.nivel_confianza ?? 0;
    this.confianza.set({
      fecha_incidente: Math.min(c + 0.09, 1),
      tematica: Math.min(c + 0.03, 1),
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
