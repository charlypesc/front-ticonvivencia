import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule, CursoNombrePipe],
  templateUrl: './cursos.html',
  styleUrl: './cursos.scss',
})
export class Cursos implements OnInit {
  cursos = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');
  importando = signal(false);
  progreso = signal<{ procesadas: number; total: number } | null>(null);
  progresoPct = computed(() => {
    const p = this.progreso();
    return p && p.total > 0 ? Math.round((p.procesadas / p.total) * 100) : 0;
  });

  form = {
    nombre: '',
    grado: '',
    nivel: '',
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getCursos().subscribe({
      next: (data) => {
        this.cursos.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(curso?: any) {
    this.error.set('');
    this.success.set('');
    if (curso) {
      this.editando.set(curso);
      this.form = {
        nombre: curso.nombre,
        grado: curso.grado,
        nivel: curso.nivel,
      };
    } else {
      this.editando.set(null);
      this.form = { nombre: '', grado: '', nivel: '' };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.nombre || !this.form.grado || !this.form.nivel) {
      this.error.set('Nombre, grado y nivel son requeridos');
      return;
    }

    const request = this.editando()
      ? this.api.updateCurso(this.editando().id_curso, this.form)
      : this.api.createCurso(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Curso actualizado' : 'Curso creado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async onSeleccionarExcel(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    const confirmado = await this.confirmService.confirmarAccion(
      `¿Importar "${archivo.name}"? Se crearán los cursos que falten y se dará de alta cada estudiante del archivo en su curso correspondiente (se omiten los RUN ya existentes).`,
    );
    if (!confirmado) {
      input.value = '';
      return;
    }

    this.error.set('');
    this.success.set('');
    this.importando.set(true);
    input.value = '';

    const formData = new FormData();
    formData.append('archivo', archivo);

    this.api.importarCursosExcel(formData).subscribe({
      next: (res) => {
        this.progreso.set({ procesadas: 0, total: res.total });
        this.pollearProgreso(res.job_id);
      },
      error: (err) => {
        this.importando.set(false);
        this.progreso.set(null);
        this.error.set(err.error?.message ?? 'Error al importar el archivo');
      },
    });
  }

  private pollearProgreso(jobId: string) {
    const intervalId = setInterval(() => {
      this.api.getProgresoImportacion(jobId).subscribe({
        next: (job) => {
          this.progreso.set({ procesadas: job.procesadas, total: job.total });

          if (job.estado === 'completado') {
            clearInterval(intervalId);
            this.importando.set(false);
            this.progreso.set(null);
            this.success.set(
              `Importación completada: ${job.cursos_creados} curso(s) creado(s), ${job.estudiantes_creados} estudiante(s) creado(s), ${job.estudiantes_omitidos} omitido(s) por RUN ya existente.`,
            );
            this.cargar();
          } else if (job.estado === 'error') {
            clearInterval(intervalId);
            this.importando.set(false);
            this.progreso.set(null);
            this.error.set(job.message ?? 'Error al importar el archivo');
          }
        },
        error: () => {
          clearInterval(intervalId);
          this.importando.set(false);
          this.progreso.set(null);
          this.error.set('Se perdió la conexión durante la importación');
        },
      });
    }, 800);
  }

  verAlumnos(curso: any) {
    this.router.navigate(['/estudiantes'], { queryParams: { curso: curso.id_curso } });
  }

  async eliminar(curso: any) {
    const confirmado = await this.confirmService.confirmarAccion(`¿Eliminar "${curso.nombre}"?`);
    if (!confirmado) return;
    this.api.deleteCurso(curso.id_curso).subscribe({
      next: () => {
        this.success.set('Curso eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
