import { Component, OnInit, Output, EventEmitter, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../../shared/directives/permiso.directive';

@Component({
  selector: 'app-registro-form',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede],
  templateUrl: './registro-form.html',
  styleUrl: './registro-form.scss',
})
export class RegistroForm implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  @Output() cerrar = new EventEmitter<void>();
  @Input() registro: any | null;
  @Input() estudiantePreseleccionado: number | null = null;
  tiposFalta = signal<any[]>([]);
  estudiantes = signal<any[]>([]);
  loading = signal(false);
  error = signal('');
  success = signal(false);

  // Lo decide el backend (autor del registro o permiso
  // registro.editar_confidencialidad). Al crear siempre se puede: la
  // restricción es para levantar la confidencialidad de un registro ajeno.
  puedeEditarConfidencialidad = signal(true);

  // Selección múltiple de estudiantes
  estudiantesSeleccionados: { id_estudiante: number; rol_en_incidente: string }[] = [];

  // Buscador para agregar estudiantes a la lista de involucrados
  busquedaEstudiante = signal('');
  mostrarSugerenciasEstudiante = signal(false);

  involucrados() {
    return this.estudiantes().filter((e) => this.isSeleccionado(e.id_estudiante));
  }

  sugerenciasEstudiante() {
    const q = this.busquedaEstudiante().toLowerCase().trim();
    if (q.length < 2) return [];

    // Mismo criterio que el buscador de Estudiantes: cada palabra escrita se
    // busca por separado, sin importar el orden ni qué haya en el medio.
    const tokens = q.split(/\s+/);
    return this.estudiantes()
      .filter((e) => !this.isSeleccionado(e.id_estudiante))
      .filter((e) => {
        const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
        return tokens.every((t) => nombreCompleto.includes(t)) || e.run?.includes(q);
      })
      .slice(0, 8);
  }

  seleccionarEstudianteSugerido(id: number) {
    this.toggleEstudiante(id);
    this.busquedaEstudiante.set('');
    this.mostrarSugerenciasEstudiante.set(false);
  }

  ocultarSugerenciasEstudianteConDelay() {
    setTimeout(() => this.mostrarSugerenciasEstudiante.set(false), 150);
  }

  form = {
    fecha_incidente: '',
    tematica: '',
    antecedentes: '',
    acuerdos: '',
    id_tipo_falta: null as number | null,
    es_confidencial: false,
    nota_confidencial: '',
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Carga tipos de falta y estudiantes en paralelo
    this.api.getTiposFalta().subscribe((data) => this.tiposFalta.set(data));
    this.api.getEstudiantes().subscribe((data) => this.estudiantes.set(data));
    if (this.registro) {
      this.api.getRegistro(this.registro.id_registro).subscribe({
        next: (data) => {
          this.registro = data;
          this.estudiantesSeleccionados = data.estudiantes;
          this.puedeEditarConfidencialidad.set(data.puede_editar_confidencialidad !== false);
          // El detalle manda: quien abre desde el dashboard solo pasa el id, así
          // que sin este segundo llenado el formulario quedaría en blanco.
          this.cargarForm(data);
        },
        // Si el detalle no se pudo cargar (403 por confidencial, por ejemplo),
        // el formulario queda con datos incompletos: se cierra en vez de
        // dejarlo editable y que un guardado pise el registro con lo que haya.
        error: (err) => {
          this.error.set(err.error?.message ?? 'No se pudo cargar el registro');
          this.puedeEditarConfidencialidad.set(false);
          setTimeout(() => this.cerrar.emit(), 1500);
        },
      });
      this.cargarForm(this.registro);
    } else if (this.estudiantePreseleccionado) {
      this.toggleEstudiante(this.estudiantePreseleccionado);
    }
  }
  private cargarForm(reg: any) {
    this.form = {
      ...this.form,
      ...reg,
      fecha_incidente: reg.fecha_incidente
        ? String(reg.fecha_incidente).slice(0, 10) // Formato YYYY-MM-DD cortamos con el slice y tomamos los primeros 10 caracteres para que el inpunt lo lea correctamte
        : '',
      es_confidencial: !!reg.es_confidencial, // llega como 0/1 desde MySQL
      nota_confidencial: reg.nota_confidencial ?? '',
    };
  }

  //Es el toggle: si el estudiante ya está en la lista de seleccionados, splice lo saca (deselecciona); si no esta, lo agrega con push.
  toggleEstudiante(id: number) {
    const idx = this.estudiantesSeleccionados.findIndex((e) => e.id_estudiante === id);
    if (idx >= 0) {
      this.estudiantesSeleccionados.splice(idx, 1);
    } else {
      this.estudiantesSeleccionados.push({ id_estudiante: id, rol_en_incidente: 'víctima' });
    }
  }

  setRol(id: number, rol: string) {
    const e = this.estudiantesSeleccionados.find((e) => e.id_estudiante === id);
    if (e) e.rol_en_incidente = rol;
  }

  isSeleccionado(id: number) {
    return this.estudiantesSeleccionados.some((e) => e.id_estudiante === id);
  }

  getRol(id: number) {
    return (
      this.estudiantesSeleccionados.find((e) => e.id_estudiante === id)?.rol_en_incidente ?? ''
    );
  }

  // Registros antiguos (o importados por IA) pueden traer un rol libre que no
  // calza con las 3 opciones del select (ej: "involucrado") — sin esto el
  // <select> se ve vacío aunque el dato exista.
  rolesConocidos = ['víctima', 'agresor', 'testigo'];
  esRolConocido(rol: string) {
    return this.rolesConocidos.includes(rol);
  }

  guardar() {
    this.error.set('');
    const { fecha_incidente, tematica, antecedentes, id_tipo_falta } = this.form;

    if (!fecha_incidente || !tematica || !antecedentes || !id_tipo_falta) {
      this.error.set('Complete todos los campos requeridos');
      return;
    }

    if (this.form.es_confidencial && !this.form.nota_confidencial.trim()) {
      this.error.set('Indique la nota de confidencialidad');
      return;
    }

    this.loading.set(true);
    if (this.registro === null) {
      this.api
        .createRegistro({
          ...this.form,
          estudiantes: this.estudiantesSeleccionados,
        })
        .subscribe({
          next: () => {
            this.success.set(true);
            setTimeout(() => this.cerrar.emit(), 1200);
          },
          error: () => {
            this.loading.set(false);
            this.error.set('Error al guardar el registro');
          },
        });
    } else {
      this.api
        .updateRegistro({
          ...this.form,
          estudiantes: this.estudiantesSeleccionados,
        })
        .subscribe({
          next: () => {
            this.success.set(true);
            setTimeout(() => this.cerrar.emit(), 1200);
          },
          error: () => {
            this.loading.set(false);
            this.error.set('Error al guardar el registro');
          },
        });
    }
  }
}
