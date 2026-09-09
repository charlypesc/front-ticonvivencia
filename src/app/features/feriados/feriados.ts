import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';

/**
 * Calendario de feriados.
 *
 * No es un mantenedor más: de esta tabla dependen todos los plazos que la Ley
 * 21.809 cuenta en días hábiles (los 15 de la suspensión, los 5 para informar a
 * la Superintendencia y a la SEREMI). Un feriado que falte acá adelanta una
 * fecha límite; uno de más la atrasa.
 *
 * Los feriados son globales, no por establecimiento: no los define cada
 * colegio. Un feriado sin región es nacional; con región, rige solo ahí.
 */
@Component({
  selector: 'app-feriados',
  standalone: true,
  imports: [FechaPipe, CommonModule, FormsModule, Puede, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './feriados.html',
  styleUrl: './feriados.scss',
})
export class Feriados implements OnInit {
  protected readonly Permiso = Permiso;

  feriados = signal<any[]>([]);
  regiones = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  error = signal('');
  success = signal('');

  anio = new Date().getFullYear();

  form = {
    fecha: '',
    nombre: '',
    tipo: 'civil',
    irrenunciable: false,
    id_region: null as number | null,
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getRegiones().subscribe({
      next: (data) => this.regiones.set(data),
      error: () => this.regiones.set([]),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getFeriados(this.anio).subscribe({
      next: (data) => {
        this.feriados.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  cambiarAnio(delta: number) {
    this.anio += delta;
    this.cargar();
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = { fecha: '', nombre: '', tipo: 'civil', irrenunciable: false, id_region: null };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.fecha || !this.form.nombre) {
      this.error.set('Fecha y nombre son requeridos');
      return;
    }

    this.api.createFeriado(this.form).subscribe({
      next: () => {
        this.success.set('Feriado creado');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminar(f: any) {
    // Se avisa la consecuencia, no solo la acción: borrar un feriado cambia
    // fechas límite que ya se calcularon.
    const ok = await this.confirmService.confirmarAccion(
      `¿Eliminar el feriado "${f.nombre}" del ${f.fecha}? Los plazos en días hábiles que se calculen ` +
        'desde ahora van a contar ese día como hábil.',
    );
    if (!ok) return;

    this.api.deleteFeriado(f.id_feriado).subscribe({
      next: () => {
        this.success.set('Feriado eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
