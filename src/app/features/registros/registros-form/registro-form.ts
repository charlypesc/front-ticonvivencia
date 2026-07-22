import { Component, OnInit, Output, EventEmitter, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';

@Component({
  selector: 'app-registro-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro-form.html',
  styleUrl: './registro-form.scss',
})
export class RegistroForm implements OnInit {
  @Output() cerrar = new EventEmitter<void>();
  @Input() registro: any | null;
  tiposFalta = signal<any[]>([]);
  estudiantes = signal<any[]>([]);
  loading = signal(false);
  error = signal('');
  success = signal(false);

  // Selección múltiple de estudiantes
  estudiantesSeleccionados: { id_estudiante: number; rol_en_incidente: string }[] = [];

  form = {
    fecha_incidente: '',
    tematica: '',
    antecedentes: '',
    acuerdos: '',
    id_tipo_falta: null as number | null,
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Carga tipos de falta y estudiantes en paralelo
    this.api.getTiposFalta().subscribe((data) => this.tiposFalta.set(data));
    this.api.getEstudiantes().subscribe((data) => this.estudiantes.set(data));
    if (this.registro) {
      this.api
        .getRegistro(this.registro.id_registro)
        .subscribe(
          (data) => ((this.registro = data), (this.estudiantesSeleccionados = data.estudiantes)),
        );
      this.form = {
        ...this.registro,
        fecha_incidente: this.registro.fecha_incidente
          ? String(this.registro.fecha_incidente).slice(0, 10) // Formato YYYY-MM-DD cortamos con el slice y tomamos los primeros 10 caracteres para que el inpunt lo lea correctamte
          : '',
      };
    }
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

  guardar() {
    this.error.set('');
    const { fecha_incidente, tematica, antecedentes, id_tipo_falta } = this.form;

    if (!fecha_incidente || !tematica || !antecedentes || !id_tipo_falta) {
      this.error.set('Complete todos los campos requeridos');
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
