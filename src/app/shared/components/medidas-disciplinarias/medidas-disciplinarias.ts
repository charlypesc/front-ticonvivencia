import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hoyIso, ahoraIso } from '../../utils/fecha';
import { FechaPipe } from '../../pipes/fecha.pipe';
import { EtiquetaPipe } from '../../pipes/etiqueta.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../directives/permiso.directive';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../directives/guardar-con-cmd-enter.directive';
import { PasoQueOrdenaMedida, TipoMedidaRequerida } from '../../../core/constants/pasos';

// Mismo orden y mismos catorce valores que TIPOS_MEDIDA en
// medidasDisciplinarias.controller.js, de menor a mayor gravedad. Los cuatro
// antes de 'otra' son las medidas excepcionales de la Circular 482 p. 47: solo
// proceden si hay peligro real para la integridad física o psicológica de
// alguien de la comunidad educativa, y son las únicas con plazo en días
// hábiles.
//
// 'retiro_sala' y 'suspension_actividades' no suspenden el derecho a asistir a
// clases (por eso no llevan plazo): la primera se agota en la clase de la que
// se retira al estudiante, la segunda en la actividad o ceremonia de la que
// queda excluido.
const TIPOS_MEDIDA = [
  'amonestacion', 'citacion_apoderado', 'medida_formativa', 'medida_reparatoria',
  'servicio_comunitario', 'derivacion', 'retiro_sala', 'suspension_actividades',
  'condicionalidad', 'suspension', 'reduccion_jornada', 'separacion_temporal',
  'asistencia_solo_evaluaciones', 'otra',
] as const;
const TIPOS_CON_PLAZO = ['suspension', 'reduccion_jornada', 'separacion_temporal', 'asistencia_solo_evaluaciones'];

/**
 * Medidas disciplinarias aplicadas en el caso, con su resultado, más las
 * suspensiones cautelares del art. 6 letra d.
 *
 * El resultado se pide aparte y no junto con la medida porque cuando se aplica
 * todavía no hay resultado que contar. Y se insiste con él en la pantalla
 * porque es el dato que el informe previo de expulsión exige explicitar ("con
 * indicación de los resultados obtenidos") y el que, si no se pide, nunca se
 * completa: sin él ese informe hay que escribirlo a mano desde cero.
 *
 * La cautelar vive acá y no en una pantalla propia porque es la medida que el
 * inspector aplica en el mismo momento y en el mismo lugar del expediente. Lo
 * que sí tiene propio es el panel de plazos: a diferencia de una medida
 * disciplinaria común, la cautelar arranca dos relojes desde la notificación
 * (diez días hábiles para resolver, cinco para pedir reconsideración) y pasado
 * el primero el caso queda en infracción.
 *
 * Las medidas disciplinarias cuelgan del registro y las cautelares del caso, y
 * por eso el componente recibe los dos ids.
 */
@Component({
  selector: 'app-medidas-disciplinarias',
  standalone: true,
  imports: [FechaPipe, EtiquetaPipe, CommonModule, FormsModule, Puede, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './medidas-disciplinarias.html',
  styleUrl: './medidas-disciplinarias.scss',
})
export class MedidasDisciplinarias implements OnInit {
  @Input({ required: true }) idRegistro!: number;
  @Input({ required: true }) idCaso!: number;
  @Input() estudiantes: any[] = [];
  @Input() casoActivo = true;
  /**
   * Los pasos del protocolo que ordenan una medida, para dejar dicho de cuál
   * salió ésta. Sin el vínculo el paso sigue reclamando una medida que ya está
   * cargada.
   */
  @Input() pasosConMedida: PasoQueOrdenaMedida[] = [];

  /**
   * De los pasos que ordenan medida, los que cumple cada uno de los dos
   * formularios de esta tarjeta. No son el mismo instituto y no se cumplen
   * entre sí: la sanción resuelve el caso, la cautelar solo suspende al señalado
   * mientras se resuelve, y ninguna de las dos protege a la persona afectada.
   * Ofrecer el paso equivocado deja al paso esperando una medida que alguien
   * creyó haber registrado.
   *
   * El paso sin clase declarada entra en los dos: es lo que hacía antes de que
   * la clase existiera.
   */
  get pasosDisciplinarios(): PasoQueOrdenaMedida[] {
    return this.pasosQueCumple('disciplinaria');
  }

  get pasosCautelares(): PasoQueOrdenaMedida[] {
    return this.pasosQueCumple('cautelar');
  }

  private pasosQueCumple(clase: TipoMedidaRequerida): PasoQueOrdenaMedida[] {
    return this.pasosConMedida.filter(
      (p) => p.tipo === clase || p.tipo === 'cualquiera' || p.tipo === null,
    );
  }

  /** El paso que se propone al abrir un formulario: si hay exactamente uno
   *  esperando su medida, es ése. */
  private sugerido(pasos: PasoQueOrdenaMedida[]): number | null {
    const pendientes = pasos.filter((p) => p.pendiente);
    return pendientes.length === 1 ? pendientes[0].id_activado_paso : null;
  }

  /** Abren el formulario ya atado a un paso concreto. Los llama la pantalla del
   *  caso desde el aviso del paso, para que el usuario no tenga que bajar a
   *  buscar la tarjeta ni volver a elegir el paso. */
  abrirParaPaso(id_activado_paso: number) {
    this.abrirForm();
    this.form.id_activado_paso = id_activado_paso;
  }

  abrirCautelarParaPaso(id_activado_paso: number) {
    this.abrirFormCautelar();
    this.formCautelar.id_activado_paso = id_activado_paso;
  }

  protected readonly Permiso = Permiso;

  medidas = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  // ── Suspensión cautelar (art. 6 letra d) ──────────────────────────────────
  cautelares = signal<any[]>([]);
  cargandoCautelares = signal(true);

  mostrarFormCautelar = signal(false);
  formCautelar = {
    fundamento: '',
    // La notificación es un momento, no un día: de ella arrancan los plazos y
    // en una fiscalización se pregunta cuándo se entregó.
    fecha_notificacion: ahoraIso(),
    medio_notificacion: 'presencial',
    id_estudiante: null as number | null,
    id_activado_paso: null as number | null,
  };

  reconsiderarDe = signal<any | null>(null);
  formReconsideracion = {
    fecha_reconsideracion: hoyIso(),
    consejo_profesores_acta: '',
    fecha_consejo: '',
  };

  resolverDe = signal<any | null>(null);
  formResolver = {
    fecha_resolucion: hoyIso(),
    resultado_reconsideracion: '' as '' | 'acogida' | 'rechazada',
    consejo_profesores_acta: '',
    fecha_consejo: '',
  };

  mostrarForm = signal(false);
  form = {
    descripcion: '',
    tipo_medida: '' as typeof TIPOS_MEDIDA[number] | '',
    fundamento: '',
    dias_habiles: null as number | null,
    fecha_aplicacion: hoyIso(),
    fecha_revision: '',
    es_prorroga: false,
    id_medida_prorrogada: null as number | null,
    id_estudiante: null as number | null,
    id_activado_paso: null as number | null,
  };

  protected readonly TIPOS_MEDIDA = TIPOS_MEDIDA;

  /** Solo las cuatro excepcionales de la Circular 482 llevan plazo en días
   *  hábiles y exigen fundamento por escrito antes de aplicarse. */
  get llevaPlazo(): boolean {
    return TIPOS_CON_PLAZO.includes(this.form.tipo_medida);
  }

  get esCondicionalidad(): boolean {
    return this.form.tipo_medida === 'condicionalidad';
  }

  /** Medidas de las cuatro excepcionales, vigentes, que ya podrían prorrogarse
   *  (para el selector "es prórroga de"). */
  get medidasProrrogables(): any[] {
    return this.medidas().filter(
      (m) => TIPOS_CON_PLAZO.includes(m.tipo_medida) && m.estado === 'vigente',
    );
  }

  resultadoDe = signal<any | null>(null);
  formResultado = { resultado: '', fecha_resultado: hoyIso() };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
    this.cargarCautelares();
  }

  cargar() {
    this.loading.set(true);
    this.api.getMedidasDisciplinarias(this.idRegistro).subscribe({
      next: (data) => {
        this.medidas.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  get sinResultado(): number {
    return this.medidas().filter((m) => !m.resultado).length;
  }

  /** Suspensiones/excepcionales cuyo término ya pasó y siguen 'vigente': el
   *  job todavía no corrió, o el caso sigue activo y nadie cerró el ciclo. */
  get vencidasSinResolver(): number {
    return this.medidas().filter((m) => m.vencida).length;
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = {
      descripcion: '',
      tipo_medida: '',
      fundamento: '',
      dias_habiles: null,
      fecha_aplicacion: hoyIso(),
      fecha_revision: '',
      es_prorroga: false,
      id_medida_prorrogada: null,
      id_estudiante: null,
      id_activado_paso: this.sugerido(this.pasosDisciplinarios),
    };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.descripcion.trim()) {
      this.error.set('Describí la medida aplicada');
      return;
    }
    // Mismas reglas que el backend (Circular 482 p. 47): sin este par de datos
    // el expediente no puede sostener por qué correspondía justo esta medida.
    if (this.llevaPlazo && !this.form.fundamento.trim()) {
      this.error.set('Esta medida requiere fundamentar por qué correspondía (Circular 482 p. 47)');
      return;
    }
    if (this.llevaPlazo && !this.form.dias_habiles) {
      this.error.set('Esta medida requiere indicar los días hábiles');
      return;
    }
    this.api.createMedidaDisciplinaria(this.idRegistro, this.form).subscribe({
      next: (r: any) => {
        // El plazo lo calcula el backend con los feriados de la región: se
        // repite acá porque es justo el dato que la persona no puede sacar de
        // memoria (mismo patrón que medidas de protección y suspensión cautelar).
        this.success.set(
          [
            'Medida registrada',
            r?.fecha_termino ? `Vence el ${r.fecha_termino}` : '',
            r?.aviso ?? '',
          ].filter(Boolean).join('. '),
        );
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al registrar la medida'),
    });
  }

  abrirResultado(m: any) {
    this.error.set('');
    this.formResultado = {
      resultado: m.resultado ?? '',
      fecha_resultado: m.fecha_resultado ?? hoyIso(),
    };
    this.resultadoDe.set(m);
  }

  cerrarResultado() {
    this.resultadoDe.set(null);
  }

  guardarResultado() {
    if (!this.formResultado.resultado.trim()) {
      this.error.set('Indicá el resultado obtenido');
      return;
    }
    this.api.registrarResultadoMedida(this.resultadoDe().id_medida, this.formResultado).subscribe({
      next: () => {
        this.success.set('Resultado registrado');
        this.cerrarResultado();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al registrar el resultado'),
    });
  }

  // ── Suspensión cautelar ───────────────────────────────────────────────────

  cargarCautelares() {
    this.cargandoCautelares.set(true);
    this.api.getSuspensionesCautelares(this.idCaso).subscribe({
      next: (data) => {
        this.cautelares.set(data);
        this.cargandoCautelares.set(false);
      },
      error: () => this.cargandoCautelares.set(false),
    });
  }

  /** Cautelares cuyo plazo de diez días hábiles se venció sin resolver. */
  get cautelaresEnInfraccion(): number {
    return this.cautelares().filter((c) => c.en_infraccion).length;
  }

  /**
   * Cautelar que se está corrigiendo, si el modal se abrió para editar.
   *
   * La medida se notifica por escrito, así que esto no reescribe lo notificado:
   * es la ventana para arreglar el error de digitación. Se cierra apenas hay
   * reconsideración interpuesta (el apoderado pidió reconsiderar ESTOS
   * fundamentos) o resolución, que es la misma regla del backend.
   */
  editandoCautelar = signal<any | null>(null);

  puedeEditarCautelar(c: any): boolean {
    return c.estado !== 'resuelta' && !c.fecha_reconsideracion;
  }

  abrirFormCautelar(c?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoCautelar.set(c ?? null);
    this.formCautelar = c
      ? {
          fundamento: c.fundamento ?? '',
          // El input es datetime-local: necesita 'YYYY-MM-DDTHH:mm'.
          fecha_notificacion: String(c.fecha_notificacion).replace(' ', 'T').slice(0, 16),
          medio_notificacion: c.medio_notificacion,
          id_estudiante: c.id_estudiante ?? null,
          id_activado_paso: c.id_activado_paso ?? null,
        }
      : {
          fundamento: '',
          fecha_notificacion: ahoraIso(),
          medio_notificacion: 'presencial',
          id_estudiante: null,
          id_activado_paso: this.sugerido(this.pasosCautelares),
        };
    this.mostrarFormCautelar.set(true);
  }

  cerrarFormCautelar() {
    this.mostrarFormCautelar.set(false);
    this.editandoCautelar.set(null);
  }

  guardarCautelar() {
    this.error.set('');
    if (!this.formCautelar.fundamento.trim()) {
      this.error.set(
        'Escribí los fundamentos: la ley obliga a notificarlos junto con la decisión de suspender'
      );
      return;
    }

    const editada = this.editandoCautelar();
    const request = editada
      ? this.api.updateSuspensionCautelar(editada.id_suspension_cautelar, this.formCautelar)
      : this.api.createSuspensionCautelar(this.idCaso, this.formCautelar);

    request.subscribe({
      next: (r) => {
        // El plazo lo recalcula el backend con los feriados de la región: se
        // repite acá porque al corregir la fecha de notificación cambia, y es
        // justo el dato que la persona no puede sacar de memoria.
        this.success.set(
          `${editada ? 'Suspensión cautelar corregida' : 'Suspensión cautelar registrada'}. ` +
            `Hay plazo para resolver hasta el ${r.fecha_limite_resolucion}.`
        );
        this.cerrarFormCautelar();
        this.cargarCautelares();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar la suspensión cautelar'),
    });
  }

  abrirReconsideracion(c: any) {
    this.error.set('');
    this.formReconsideracion = {
      fecha_reconsideracion: hoyIso(),
      consejo_profesores_acta: '',
      fecha_consejo: '',
    };
    this.reconsiderarDe.set(c);
  }

  cerrarReconsideracion() {
    this.reconsiderarDe.set(null);
  }

  guardarReconsideracion() {
    this.error.set('');
    this.api
      .registrarReconsideracionCautelar(
        this.reconsiderarDe().id_suspension_cautelar,
        this.formReconsideracion
      )
      .subscribe({
        next: (r) => {
          // El aviso de fuera de plazo no es un error: la reconsideración queda
          // registrada igual y admitirla es decisión del director.
          this.success.set(r.aviso ?? 'Reconsideración registrada. La suspensión se amplía hasta resolverla.');
          this.cerrarReconsideracion();
          this.cargarCautelares();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al registrar la reconsideración'),
      });
  }

  abrirResolver(c: any) {
    this.error.set('');
    this.formResolver = {
      fecha_resolucion: hoyIso(),
      resultado_reconsideracion: '',
      consejo_profesores_acta: c.consejo_profesores_acta ?? '',
      fecha_consejo: c.fecha_consejo ?? '',
    };
    this.resolverDe.set(c);
  }

  cerrarResolver() {
    this.resolverDe.set(null);
  }

  guardarResolucion() {
    this.error.set('');
    const c = this.resolverDe();
    if (c.fecha_reconsideracion && !this.formResolver.resultado_reconsideracion) {
      this.error.set('Indicá si la reconsideración se acoge o se rechaza');
      return;
    }
    if (c.fecha_reconsideracion && !this.formResolver.consejo_profesores_acta.trim()) {
      this.error.set(
        'Falta el pronunciamiento por escrito del Consejo de Profesores: la ley lo exige antes de resolver'
      );
      return;
    }
    this.api.resolverSuspensionCautelar(c.id_suspension_cautelar, this.formResolver).subscribe({
      next: (r) => {
        this.success.set(r.aviso ?? 'Suspensión cautelar resuelta');
        this.cerrarResolver();
        this.cargarCautelares();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al resolver la suspensión cautelar'),
    });
  }
}
