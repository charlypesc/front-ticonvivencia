import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';
import { Permiso } from '../../../core/constants/permisos';
import { Puede } from '../../directives/permiso.directive';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';

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
  imports: [CommonModule, FormsModule, Puede, CerrarConEsc],
  templateUrl: './medidas-disciplinarias.html',
  styleUrl: './medidas-disciplinarias.scss',
})
export class MedidasDisciplinarias implements OnInit {
  @Input({ required: true }) idRegistro!: number;
  @Input({ required: true }) idCaso!: number;
  @Input() estudiantes: any[] = [];
  @Input() casoActivo = true;

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
    fecha_notificacion: new Date().toISOString().slice(0, 16),
    medio_notificacion: 'presencial',
    id_estudiante: null as number | null,
  };

  reconsiderarDe = signal<any | null>(null);
  formReconsideracion = {
    fecha_reconsideracion: new Date().toISOString().slice(0, 10),
    consejo_profesores_acta: '',
    fecha_consejo: '',
  };

  resolverDe = signal<any | null>(null);
  formResolver = {
    fecha_resolucion: new Date().toISOString().slice(0, 10),
    resultado_reconsideracion: '' as '' | 'acogida' | 'rechazada',
    consejo_profesores_acta: '',
    fecha_consejo: '',
  };

  mostrarForm = signal(false);
  form = {
    descripcion: '',
    tipo_medida: '',
    fecha_aplicacion: new Date().toISOString().slice(0, 10),
    id_estudiante: null as number | null,
  };

  resultadoDe = signal<any | null>(null);
  formResultado = { resultado: '', fecha_resultado: new Date().toISOString().slice(0, 10) };

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

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = {
      descripcion: '',
      tipo_medida: '',
      fecha_aplicacion: new Date().toISOString().slice(0, 10),
      id_estudiante: null,
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
    this.api.createMedidaDisciplinaria(this.idRegistro, this.form).subscribe({
      next: () => {
        this.success.set('Medida registrada');
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
      fecha_resultado: m.fecha_resultado ?? new Date().toISOString().slice(0, 10),
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

  abrirFormCautelar() {
    this.error.set('');
    this.success.set('');
    this.formCautelar = {
      fundamento: '',
      fecha_notificacion: new Date().toISOString().slice(0, 16),
      medio_notificacion: 'presencial',
      id_estudiante: null,
    };
    this.mostrarFormCautelar.set(true);
  }

  cerrarFormCautelar() {
    this.mostrarFormCautelar.set(false);
  }

  guardarCautelar() {
    this.error.set('');
    if (!this.formCautelar.fundamento.trim()) {
      this.error.set(
        'Escribí los fundamentos: la ley obliga a notificarlos junto con la decisión de suspender'
      );
      return;
    }
    this.api.createSuspensionCautelar(this.idCaso, this.formCautelar).subscribe({
      next: (r) => {
        this.success.set(
          `Suspensión cautelar registrada. Hay plazo para resolver hasta el ${r.fecha_limite_resolucion}.`
        );
        this.cerrarFormCautelar();
        this.cargarCautelares();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al registrar la suspensión cautelar'),
    });
  }

  abrirReconsideracion(c: any) {
    this.error.set('');
    this.formReconsideracion = {
      fecha_reconsideracion: new Date().toISOString().slice(0, 10),
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
      fecha_resolucion: new Date().toISOString().slice(0, 10),
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
