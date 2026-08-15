import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';

@Component({
  selector: 'app-estudiantes',
  standalone: true,
  imports: [CommonModule, FormsModule, CursoNombrePipe],
  templateUrl: './estudiantes.html',
  styleUrl: './estudiantes.scss',
})
export class Estudiantes implements OnInit, AfterViewInit {
  @ViewChild('buscarInput') buscarInput!: ElementRef<HTMLInputElement>;

  estudiantes = signal<any[]>([]);
  cursos = signal<any[]>([]);
  loading = signal(true);
  busqueda = signal('');
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');
  mostrarSugerencias = signal(false);
  filtroCurso = signal<number | null>(null);

  cursoFiltrado = computed(() => {
    const id = this.filtroCurso();
    return id ? this.cursos().find((c) => c.id_curso === id) ?? null : null;
  });

  filtrados = computed(() => {
    const idCurso = this.filtroCurso();
    const base = idCurso ? this.estudiantes().filter((e) => e.id_curso === idCurso) : this.estudiantes();

    const q = this.busqueda().toLowerCase().trim();
    if (!q) return base;

    // Cada palabra escrita se busca por separado, sin importar el orden ni
    // qué haya en el medio (ej. "rodrigo paredes" matchea "Rodrigo Andrés
    // Paredes Escobar" aunque tenga un segundo nombre entre medio).
    const tokens = q.split(/\s+/);
    return base.filter((e) => {
      const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
      return tokens.every((t) => nombreCompleto.includes(t)) || e.run?.includes(q);
    });
  });

  sugerencias = computed(() => {
    if (this.busqueda().trim().length < 2) return [];
    return this.filtrados().slice(0, 8);
  });

  form = {
    run: '',
    dv: '',
    nombre: '',
    apellido: '',
    sexo: '',
    id_curso: null as number | null,
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
    private router: Router,
    private route: ActivatedRoute,
    private destroyRef: DestroyRef,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getCursos().subscribe((data) => this.cursos.set(data));
    this.leerFiltroCurso();

    // El Router reusa la misma instancia del componente cuando se navega a
    // /estudiantes estando ya en /estudiantes (ej. desde "Ver alumnos" en
    // Cursos, o al presionar "Estudiantes" en el sidebar de nuevo) — en ese
    // caso ngOnInit/ngAfterViewInit NO se vuelven a disparar. Escuchando
    // NavigationEnd nos aseguramos de reenfocar el buscador siempre.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.leerFiltroCurso();
        this.enfocarBuscador();
      });
  }

  private leerFiltroCurso() {
    const curso = this.route.snapshot.queryParamMap.get('curso');
    this.filtroCurso.set(curso ? Number(curso) : null);
  }

  limpiarFiltroCurso() {
    this.filtroCurso.set(null);
    this.router.navigate([], { queryParams: {} });
  }

  ngAfterViewInit() {
    this.enfocarBuscador();
  }

  private enfocarBuscador() {
    this.buscarInput?.nativeElement.focus();
  }

  cargar() {
    this.loading.set(true);
    this.api.getEstudiantes().subscribe({
      next: (data) => {
        this.estudiantes.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(estudiante?: any) {
    this.error.set('');
    this.success.set('');
    if (estudiante) {
      this.editando.set(estudiante);
      this.form = {
        run: estudiante.run,
        dv: estudiante.dv,
        nombre: estudiante.nombre,
        apellido: estudiante.apellido,
        sexo: estudiante.sexo,
        id_curso: estudiante.id_curso,
      };
    } else {
      this.editando.set(null);
      this.form = { run: '', dv: '', nombre: '', apellido: '', sexo: '', id_curso: null };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    const { run, dv, nombre, apellido, sexo, id_curso } = this.form;

    if (!run || !dv || !nombre || !apellido || !sexo || !id_curso) {
      this.error.set('Complete todos los campos requeridos');
      return;
    }

    const request = this.editando()
      ? this.api.updateEstudiante(this.editando().id_estudiante, this.form)
      : this.api.createEstudiante(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Estudiante actualizado' : 'Estudiante creado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al guardar');
      },
    });
  }

  ocultarSugerenciasConDelay() {
    setTimeout(() => this.mostrarSugerencias.set(false), 150);
  }

  seleccionarEstudiante(e: any) {
    this.mostrarSugerencias.set(false);
    this.busqueda.set('');
    this.router.navigate(['/consultar-rut'], { queryParams: { rut: `${e.run}-${e.dv}` } });
  }

  verEnConsultarRut(e: any) {
    this.router.navigate(['/consultar-rut'], { queryParams: { rut: `${e.run}-${e.dv}` } });
  }

  toggle(e: any) {
    this.api.toggleEstudiante(e.id_estudiante).subscribe(() => this.cargar());
  }

  async eliminar(e: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar a ${e.nombre} ${e.apellido}?`,
    );
    if (!confirmado) return;
    this.error.set('');
    this.api.deleteEstudiante(e.id_estudiante).subscribe({
      next: () => {
        this.success.set('Estudiante eliminado');
        this.cargar();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al eliminar');
      },
    });
  }
}
