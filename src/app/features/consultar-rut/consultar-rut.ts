import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';
import { RegistroForm } from '../registros/registros-form/registro-form';

@Component({
  selector: 'app-consultar-rut',
  standalone: true,
  imports: [CommonModule, FormsModule, CursoNombrePipe, RegistroForm],
  templateUrl: './consultar-rut.html',
  styleUrl: './consultar-rut.scss',
})
export class ConsultarRut implements OnInit {
  rut = '';
  loading = signal(false);
  error = signal('');
  success = signal('');
  estudiante = signal<any | null>(null);
  registros = signal<any[]>([]);

  cursos = signal<any[]>([]);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);

  mostrarRegistroForm = signal(false);
  registroSeleccionado: any = null;
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
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.api.getCursos().subscribe((data) => this.cursos.set(data));
    const rut = this.route.snapshot.queryParamMap.get('rut');
    if (rut) {
      this.rut = rut;
      this.buscar();
    }
  }

  validarFormatoRut(rut: string): boolean {
    return /^\d{7,8}-[\dkK]$/.test(rut.trim());
  }

  buscar() {
    this.error.set('');
    this.estudiante.set(null);
    this.registros.set([]);

    if (!this.rut.trim()) {
      this.error.set('Ingrese un RUT para buscar');
      return;
    }

    if (!this.validarFormatoRut(this.rut)) {
      this.error.set('Ingrese un RUT válido (ej: 12345678-9)');
      return;
    }

    this.loading.set(true);

    this.api.consultarRut(this.rut.trim()).subscribe({
      next: (res: any) => {
        if (!res.estudiante) {
          this.error.set('No se encontraron registros para el RUT ingresado');
        } else {
          this.estudiante.set(res.estudiante);
          this.registros.set(res.registros);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Error al consultar');
      },
    });
  }

  limpiar() {
    this.rut = '';
    this.error.set('');
    this.estudiante.set(null);
    this.registros.set([]);
  }

  abrirRegistro(registro: any) {
    this.registroSeleccionado = registro;
    this.mostrarRegistroForm.set(true);
  }

  abrirNuevoRegistro() {
    this.registroSeleccionado = null;
    this.mostrarRegistroForm.set(true);
  }

  cerrarRegistroForm() {
    this.mostrarRegistroForm.set(false);
    this.refrescarRegistros();
  }

  // A diferencia de buscar(), no limpia estudiante()/registros() antes de
  // responder — evita el pestañeo de la tarjeta de perfil y la tabla al
  // cerrar el modal de registro (donde el estudiante ya está cargado).
  private refrescarRegistros() {
    const estudiante = this.estudiante();
    if (!estudiante) return;

    this.api.consultarRut(`${estudiante.run}-${estudiante.dv}`).subscribe({
      next: (res: any) => {
        if (res.estudiante) {
          this.estudiante.set(res.estudiante);
          this.registros.set(res.registros);
        }
      },
    });
  }

  async abrirForm() {
    const estudiante = this.estudiante();
    if (!estudiante) return;

    const confirmado = await this.confirmService.confirmarAccion(
      `¿Seguro que quieres editar a ${estudiante.nombre} ${estudiante.apellido}?`,
    );
    if (!confirmado) return;

    this.error.set('');
    this.success.set('');
    this.editando.set(estudiante);
    this.form = {
      run: estudiante.run,
      dv: estudiante.dv,
      nombre: estudiante.nombre,
      apellido: estudiante.apellido,
      sexo: estudiante.sexo,
      id_curso: estudiante.id_curso,
    };
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

    this.api.updateEstudiante(this.editando().id_estudiante, this.form).subscribe({
      next: () => {
        this.success.set('Estudiante actualizado');
        this.cerrarForm();
        this.buscar();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al guardar');
      },
    });
  }
}
