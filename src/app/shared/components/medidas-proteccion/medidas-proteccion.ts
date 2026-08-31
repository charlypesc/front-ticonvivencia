import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../directives/permiso.directive';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';

/**
 * Medidas de protección de un caso (art. 16 E letra j de la Ley 21.809).
 *
 * Va como componente aparte y no dentro de protocolo-caso porque no es un paso
 * del grafo: tiene su propio ciclo de vida. Una medida se aplica, corre en
 * paralelo a los pasos y se cierra por su cuenta.
 *
 * Lo que la pantalla tiene que dejar imposible de pasar por alto:
 *  - la suspensión no puede durar más de 15 días hábiles;
 *  - si vence y el caso sigue abierto, hay que reemplazarla por otra medida,
 *    no extenderla;
 *  - mientras está vigente hay que registrar el monitoreo pedagógico.
 */
@Component({
  selector: 'app-medidas-proteccion',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, CerrarConEsc],
  templateUrl: './medidas-proteccion.html',
  styleUrl: './medidas-proteccion.scss',
})
export class MedidasProteccion implements OnInit {
  @Input({ required: true }) idCaso!: number;
  @Input() estudiantes: any[] = [];
  @Input() casoActivo = true;

  protected readonly Permiso = Permiso;
  readonly MAX_DIAS_SUSPENSION = 15;

  medidas = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  mostrarForm = signal(false);
  form = {
    tipo: '',
    descripcion: '',
    fundamento: '',
    id_estudiante: null as number | null,
    fecha_inicio: new Date().toISOString().slice(0, 10),
    dias_habiles: null as number | null,
    es_reaplicacion: false,
  };

  /** Medida sobre la que se está registrando seguimiento, si alguna. */
  seguimientoDe = signal<any | null>(null);
  // El art. 16 E letra j impone dos deberes distintos sobre el estudiante
  // suspendido: el monitoreo pedagógico y el resguardo de la continuidad de su
  // trayectoria educativa. Se registran por separado para poder responder cuál
  // se cumplió, en vez de dar los dos por hechos porque hay 'algún' registro.
  formSeguimiento = {
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: '',
    tipo: 'monitoreo_pedagogico' as 'monitoreo_pedagogico' | 'continuidad_trayectoria' | 'otro',
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getMedidasProteccion(this.idCaso).subscribe({
      next: (data) => {
        this.medidas.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  get esSuspension(): boolean {
    return this.form.tipo === 'suspension';
  }

  /** Medidas que pueden sustituir a una vencida: las que siguen vigentes. */
  sustitutasPosibles(medida: any): any[] {
    return this.medidas().filter(
      (m) => m.id_medida_proteccion !== medida.id_medida_proteccion && m.estado === 'vigente',
    );
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = {
      tipo: '',
      descripcion: '',
      fundamento: '',
      id_estudiante: null,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      dias_habiles: null,
      es_reaplicacion: false,
    };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.tipo || !this.form.fecha_inicio) {
      this.error.set('Indicá el tipo de medida y la fecha de inicio');
      return;
    }
    if (this.esSuspension && !this.form.fundamento.trim()) {
      this.error.set(
        'La suspensión solo procede cuando no es posible resguardar con otra medida: indicá por qué.',
      );
      return;
    }
    if (this.esSuspension && !this.form.dias_habiles) {
      this.error.set('Indicá los días hábiles de la suspensión');
      return;
    }
    if (this.esSuspension && this.form.dias_habiles! > this.MAX_DIAS_SUSPENSION) {
      this.error.set(`La suspensión no puede superar los ${this.MAX_DIAS_SUSPENSION} días hábiles`);
      return;
    }

    this.api.createMedidaProteccion(this.idCaso, this.form).subscribe({
      next: (res: any) => {
        // El término lo calcula el backend con los feriados de la región: se
        // muestra porque es el dato que la persona no puede sacar de memoria.
        this.success.set(
          res?.fecha_termino
            ? `Medida registrada. Vence el ${res.fecha_termino}.`
            : 'Medida registrada',
        );
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al registrar la medida'),
    });
  }

  async finalizar(medida: any) {
    const sustitutas = this.sustitutasPosibles(medida);
    const debeSustituir = medida.tipo === 'suspension' && medida.vencida && this.casoActivo;

    if (debeSustituir && sustitutas.length === 0) {
      this.error.set(
        'La suspensión venció y el procedimiento sigue abierto: registrá primero la medida que la ' +
          'sustituye. La ley no permite extender la suspensión.',
      );
      return;
    }

    const ok = await this.confirmService.confirmarAccion(
      debeSustituir
        ? `¿Cerrar la suspensión indicando que la sustituye "${sustitutas[0].tipo}"?`
        : '¿Dar por concluida esta medida de protección?',
    );
    if (!ok) return;

    this.api
      .finalizarMedidaProteccion(
        medida.id_medida_proteccion,
        debeSustituir ? sustitutas[0].id_medida_proteccion : undefined,
      )
      .subscribe({
        next: () => {
          this.success.set('Medida finalizada');
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al finalizar la medida'),
      });
  }

  abrirSeguimiento(medida: any) {
    this.error.set('');
    this.formSeguimiento = {
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: '',
      // Se abre en el deber que falte: si el monitoreo pedagógico ya está
      // cargado, lo pendiente es la continuidad de la trayectoria.
      tipo: medida.falta_monitoreo_pedagogico ? 'monitoreo_pedagogico' : 'continuidad_trayectoria',
    };
    this.seguimientoDe.set(medida);
  }

  cerrarSeguimiento() {
    this.seguimientoDe.set(null);
  }

  guardarSeguimiento() {
    if (!this.formSeguimiento.descripcion.trim()) {
      this.error.set('Describí el seguimiento realizado');
      return;
    }
    this.api
      .registrarSeguimientoMedida(this.seguimientoDe().id_medida_proteccion, this.formSeguimiento)
      .subscribe({
        next: () => {
          this.success.set('Seguimiento registrado');
          this.cerrarSeguimiento();
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al registrar el seguimiento'),
      });
  }
}
