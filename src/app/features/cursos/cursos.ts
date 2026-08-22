import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportacionService } from '../../core/services/importacion.service';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-cursos',
  standalone: true,
  imports: [CommonModule, FormsModule, CursoNombrePipe, Puede],
  templateUrl: './cursos.html',
  styleUrl: './cursos.scss',
})
export class Cursos implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  cursos = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');
  /** Ventana entre el clic y la respuesta del POST: todavía no hay job que seguir. */
  private subiendo = signal(false);

  // El progreso vive en el servicio global, así que la barra de esta pantalla y
  // el widget flotante muestran siempre lo mismo, sin duplicar el polling.
  private jobCursos = computed(
    () => this.importacion.activas().find((a) => a.tipo === 'cursos' && a.estado === 'procesando') ?? null,
  );
  importando = computed(() => this.subiendo() || this.jobCursos() !== null);
  progreso = computed(() => {
    const j = this.jobCursos();
    return j ? { procesadas: j.procesadas, total: j.total } : null;
  });
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
    private importacion: ImportacionService,
    public auth: AuthService,
    private router: Router,
  ) {
    // La lista se refresca cuando termina una importación de cursos, sin importar
    // en qué pantalla estaba el usuario mientras corría.
    effect(() => {
      for (const imp of this.importacion.activas()) {
        if (imp.tipo !== 'cursos' || imp.estado === 'procesando') continue;
        if (this.jobsResueltos.has(imp.jobId)) continue;
        this.jobsResueltos.add(imp.jobId);

        if (imp.estado === 'completado') {
          this.success.set(`Importación completada: ${imp.mensaje}`);
          this.cargar();
        } else {
          this.error.set(imp.mensaje ?? 'Error al importar el archivo');
        }
      }
    });
  }

  /** Evita reaccionar dos veces al mismo job cuando el effect se vuelve a correr. */
  private jobsResueltos = new Set<string>();

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
    this.subiendo.set(true);
    input.value = '';

    const formData = new FormData();
    formData.append('archivo', archivo);

    this.api.importarCursosExcel(formData).subscribe({
      next: (res) => {
        this.subiendo.set(false);
        // El seguimiento pasa al servicio global: la importación corre en el
        // servidor y no se interrumpe si el usuario navega a otra pantalla, así
        // que el progreso lo muestra el widget flotante del layout.
        this.importacion.seguir(res.job_id, 'cursos', `Importando "${archivo.name}"`, res.total);
      },
      error: (err) => {
        this.subiendo.set(false);
        this.error.set(err.error?.message ?? 'Error al importar el archivo');
      },
    });
  }

  /**
   * Borrado masivo para deshacer una importación. Solo lo ve quien tenga
   * curso.eliminar_masivo (hoy, únicamente el ADMIN).
   *
   * Se piden los números al backend antes de confirmar: un modal que diga
   * "¿eliminar todos los cursos?" no le da al usuario forma de dimensionar lo
   * que está por borrar.
   */
  async eliminarTodos() {
    this.error.set('');
    this.success.set('');

    this.api.getResumenEliminacionCursos().subscribe({
      next: async (r) => {
        if (r.cursos === 0 && r.estudiantes === 0) {
          this.error.set('No hay cursos ni estudiantes para eliminar');
          return;
        }

        if (r.estudiantes_con_registros > 0) {
          this.error.set(
            `No se puede eliminar: ${r.estudiantes_con_registros} estudiante(s) están asociados a ` +
              `registros de convivencia. Eliminá primero esos registros.`,
          );
          return;
        }

        const confirmado = await this.confirmService.confirmarAccion(
          `Se eliminarán ${r.cursos} curso(s) y ${r.estudiantes} estudiante(s) del establecimiento. ` +
            `Esta acción no se puede deshacer. ¿Continuar?`,
        );
        if (!confirmado) return;

        this.api.eliminarTodosLosCursos().subscribe({
          next: (res) => {
            this.success.set(res.message);
            this.cargar();
          },
          error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
        });
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al obtener el resumen'),
    });
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
