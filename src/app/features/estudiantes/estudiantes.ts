import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-estudiantes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estudiantes.html',
  styleUrl: './estudiantes.scss',
})
export class Estudiantes implements OnInit {
  estudiantes = signal<any[]>([]);
  cursos = signal<any[]>([]);
  loading = signal(true);
  busqueda = signal('');
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  filtrados = computed(() => {
    const q = this.busqueda().toLowerCase();
    return this.estudiantes().filter(
      (e) =>
        e.nombre?.toLowerCase().includes(q) ||
        e.apellido?.toLowerCase().includes(q) ||
        e.run?.includes(q),
    );
  });

  form = {
    run: '',
    dv: '',
    nombre: '',
    apellido: '',
    sexo: '',
    id_curso: null as number | null,
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
    this.api.getCursos().subscribe((data) => this.cursos.set(data));
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

  toggle(e: any) {
    this.api.toggleEstudiante(e.id_estudiante).subscribe(() => this.cargar());
  }

  eliminar(e: any) {
    if (!confirm(`¿Eliminar a ${e.nombre} ${e.apellido}?`)) return;
    this.error.set('');
    this.api.deleteEstudiante(e.id_estudiante).subscribe({
      next: () => {
        this.success.set('Estudiante eliminado');
        this.cargar();
      },
      error: (err) => {
        alert(err.error?.message);
      },
    });
  }
}
