import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hoyIso } from '../../utils/fecha';
import { FechaPipe } from '../../pipes/fecha.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../directives/permiso.directive';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../directives/guardar-con-cmd-enter.directive';
import { EtiquetaPipe } from '../../pipes/etiqueta.pipe';
import { PasoQueOrdenaMedida } from '../../../core/constants/pasos';

// Mismo orden y mismos doce valores que TIPOS_MEDIDA en
// medidasProteccion.controller.js, de la medida menos gravosa a la más
// gravosa. El orden importa en pantalla: la suspensión va última porque la ley
// la admite solo cuando ninguna de las anteriores alcanza para resguardar a la
// persona afectada.
const TIPOS_MEDIDA = [
  'separacion_aula', 'prohibicion_contacto', 'cambio_curso', 'cambio_jornada',
  'acompanamiento', 'derivacion_red', 'resguardo_confidencialidad',
  'reorganizacion_espacios', 'separacion_funciones', 'teletrabajo',
  'suspension', 'otra',
] as const;

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
  imports: [FechaPipe, EtiquetaPipe, CommonModule, FormsModule, Puede, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './medidas-proteccion.html',
  styleUrl: './medidas-proteccion.scss',
})
export class MedidasProteccion implements OnInit {
  @Input({ required: true }) idCaso!: number;
  @Input() estudiantes: any[] = [];
  @Input() casoActivo = true;
  /**
   * Los pasos del protocolo que ordenan una medida. Sirven para dejar dicho de
   * cuál salió ésta: sin el vínculo, el paso de resguardo sigue reclamando una
   * medida que ya está cargada, solo que sin decir a qué paso responde.
   */
  @Input() pasosConMedida: PasoQueOrdenaMedida[] = [];

  /**
   * De los pasos que ordenan medida, los que ESTA tarjeta puede cumplir.
   *
   * Un paso de resolución pide la sanción y uno cautelar pide la suspensión del
   * señalado: ofrecerlos acá invita a atarles una medida de protección, y el
   * paso queda esperando para siempre una medida que alguien creyó haber
   * registrado. 'cualquiera' entra porque no se comprometió a una vía, y el paso
   * sin clase declarada también: es lo que hacían todos antes de que la clase
   * existiera.
   */
  get pasosDeProteccion(): PasoQueOrdenaMedida[] {
    return this.pasosConMedida.filter(
      (p) => p.tipo === 'proteccion' || p.tipo === 'cualquiera' || p.tipo === null,
    );
  }

  /** Abre el formulario ya atado a un paso concreto. Lo llama la pantalla del
   *  caso desde el aviso del paso: el usuario aprieta ahí y no tiene que bajar
   *  a buscar la tarjeta ni elegir el paso de nuevo. */
  abrirParaPaso(id_activado_paso: number) {
    this.abrirForm();
    this.form.id_activado_paso = id_activado_paso;
  }

  protected readonly Permiso = Permiso;
  protected readonly TIPOS_MEDIDA = TIPOS_MEDIDA;
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
    fecha_inicio: hoyIso(),
    dias_habiles: null as number | null,
    es_reaplicacion: false,
    id_activado_paso: null as number | null,
  };

  /** El paso que se propone al abrir el formulario: si hay exactamente uno
   *  esperando su medida, es ése; con varios se elige a mano. */
  private get pasoSugerido(): number | null {
    const pendientes = this.pasosDeProteccion.filter((p) => p.pendiente);
    return pendientes.length === 1 ? pendientes[0].id_activado_paso : null;
  }

  /** Medida sobre la que se está registrando seguimiento, si alguna. */
  seguimientoDe = signal<any | null>(null);
  // El art. 16 E letra j impone dos deberes distintos sobre el estudiante
  // suspendido: el monitoreo pedagógico y el resguardo de la continuidad de su
  // trayectoria educativa. Se registran por separado para poder responder cuál
  // se cumplió, en vez de dar los dos por hechos porque hay 'algún' registro.
  formSeguimiento = {
    fecha: hoyIso(),
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

  /**
   * Medida que se está corrigiendo, si el modal se abrió para editar.
   *
   * Corregir es para el error de carga, no para reescribir el expediente: el
   * backend solo lo acepta mientras la medida sigue vigente y todavía no tiene
   * seguimientos encima. Acá se refleja la misma regla para no ofrecer un botón
   * que va a terminar en un 409.
   */
  editando = signal<any | null>(null);

  puedeEditar(medida: any): boolean {
    return medida.estado === 'vigente' && (medida.seguimientos?.length ?? 0) === 0;
  }

  abrirForm(medida?: any) {
    this.error.set('');
    this.success.set('');
    this.editando.set(medida ?? null);
    this.form = medida
      ? {
          tipo: medida.tipo,
          descripcion: medida.descripcion ?? '',
          fundamento: medida.fundamento ?? '',
          id_estudiante: medida.id_estudiante ?? null,
          fecha_inicio: String(medida.fecha_inicio).slice(0, 10),
          dias_habiles: medida.dias_habiles ?? null,
          es_reaplicacion: !!medida.es_reaplicacion,
          id_activado_paso: medida.id_activado_paso ?? null,
        }
      : {
          tipo: '',
          descripcion: '',
          fundamento: '',
          id_estudiante: null,
          fecha_inicio: hoyIso(),
          dias_habiles: null,
          es_reaplicacion: false,
          id_activado_paso: this.pasoSugerido,
        };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
    this.editando.set(null);
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

    const editada = this.editando();
    const request = editada
      ? this.api.updateMedidaProteccion(editada.id_medida_proteccion, this.form)
      : this.api.createMedidaProteccion(this.idCaso, this.form);

    request.subscribe({
      next: (res: any) => {
        // El término lo calcula el backend con los feriados de la región: se
        // muestra porque es el dato que la persona no puede sacar de memoria.
        const que = editada ? 'Medida corregida' : 'Medida registrada';
        this.success.set(res?.fecha_termino ? `${que}. Vence el ${res.fecha_termino}.` : que);
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar la medida'),
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
      fecha: hoyIso(),
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
