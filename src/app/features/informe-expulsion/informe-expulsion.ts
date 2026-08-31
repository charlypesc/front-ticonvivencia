import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

/**
 * Informe previo de expulsión o cancelación de matrícula.
 *
 * Es el único documento con contenido tasado en la Ley 21.809 (art. 2 N° 5), y
 * por eso esta pantalla no es un formulario libre: los campos son los que la
 * norma enumera y el backend no deja emitir si falta alguno o si los tres
 * integrantes de la comisión no firmaron.
 *
 * El aporte real del sistema está en el bloque de medidas previas: la parte más
 * laboriosa del informe ("cada medida aplicada con indicación de los resultados
 * obtenidos") ya está registrada en el caso y se muestra acá para volcarla.
 */
@Component({
  selector: 'app-informe-expulsion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Puede],
  templateUrl: './informe-expulsion.html',
  styleUrl: './informe-expulsion.scss',
})
export class InformeExpulsion implements OnInit {
  protected readonly Permiso = Permiso;

  idCaso = 0;
  informe = signal<any | null>(null);
  usuarios = signal<any[]>([]);
  estudiantes = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  success = signal('');

  /** Alta: qué medida y sobre quién. */
  formAlta = { id_estudiante: null as number | null, medida: 'expulsion' };

  form: any = {
    antecedentes_conductuales: '',
    antecedentes_pedagogicos: '',
    informes_psicosociales: '',
    proporcionalidad: '',
    gravedad_afectacion: '',
    medidas_previas_insuficientes: '',
    constancia_alternativas: '',
    recomendacion: '',
    fundamento_recomendacion: '',
  };

  /** Comisión: un usuario por cada uno de los tres roles que exige la ley. */
  comision: Record<string, number | null> = {
    profesor_jefe: null,
    coordinador_convivencia: null,
    equipo_tecnico_pedagogico: null,
  };

  readonly rolesComision = [
    { codigo: 'profesor_jefe', etiqueta: 'Profesor jefe' },
    { codigo: 'coordinador_convivencia', etiqueta: 'Coordinador de convivencia educativa' },
    { codigo: 'equipo_tecnico_pedagogico', etiqueta: 'Integrante del equipo técnico pedagógico' },
  ];

  formDecision = {
    decision: '',
    fundamento_director: '',
    fecha_notificacion_apoderado: new Date().toISOString().slice(0, 10),
  };

  formEnvios = { fecha_informe_superintendencia: '', fecha_informe_seremi: '' };

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.idCaso = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
    this.api.getUsuarios().subscribe({
      next: (data) => this.usuarios.set(data),
      error: () => this.usuarios.set([]),
    });
    this.api.getProtocoloActivado(this.idCaso).subscribe({
      next: (caso) => this.estudiantes.set(caso?.estudiantes ?? []),
      error: () => this.estudiantes.set([]),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getInformeExpulsion(this.idCaso).subscribe({
      next: (data) => {
        this.informe.set(data);
        for (const k of Object.keys(this.form)) this.form[k] = data[k] ?? '';
        for (const r of this.rolesComision) {
          const i = (data.comision ?? []).find((c: any) => c.rol_comision === r.codigo);
          this.comision[r.codigo] = i?.id_usuario ?? null;
        }
        this.loading.set(false);
      },
      // 404 no es un error: significa que este caso todavía no tiene informe y
      // hay que ofrecer crearlo.
      error: () => {
        this.informe.set(null);
        this.loading.set(false);
      },
    });
  }

  get emitido(): boolean {
    return this.informe()?.estado === 'emitido';
  }

  get resuelto(): boolean {
    return this.informe()?.decision_director !== 'pendiente';
  }

  /** El director contradice a la comisión: la ley le exige fundamentar. */
  get contradiceRecomendacion(): boolean {
    return this.formDecision.decision === 'aplica' && this.informe()?.recomendacion === 'no_aplicar';
  }

  firmaDe(rol: string): any {
    return (this.informe()?.comision ?? []).find((c: any) => c.rol_comision === rol) ?? null;
  }

  crear() {
    this.error.set('');
    if (!this.formAlta.id_estudiante) {
      this.error.set('Indicá sobre qué estudiante recae la medida');
      return;
    }
    this.api.createInformeExpulsion(this.idCaso, this.formAlta).subscribe({
      next: () => {
        this.success.set('Informe iniciado en borrador');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al crear el informe'),
    });
  }

  guardar() {
    this.error.set('');
    this.api.updateInformeExpulsion(this.informe().id_informe, this.form).subscribe({
      next: () => {
        this.success.set('Informe guardado');
        this.guardarComision();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  private guardarComision() {
    const integrantes = Object.entries(this.comision)
      .filter(([, id]) => !!id)
      .map(([rol_comision, id_usuario]) => ({ rol_comision, id_usuario }));

    this.api.setComisionInforme(this.informe().id_informe, integrantes).subscribe({
      next: () => this.cargar(),
      error: (err) => {
        this.cargar();
        this.error.set(
          'El informe se guardó, pero no se pudo actualizar la comisión: ' +
            (err.error?.message ?? 'error del servidor'),
        );
      },
    });
  }

  firmar() {
    this.error.set('');
    this.api.firmarInformeExpulsion(this.informe().id_informe).subscribe({
      next: () => {
        this.success.set('Informe firmado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo firmar'),
    });
  }

  async emitir() {
    const ok = await this.confirmService.confirmarAccion(
      '¿Emitir el informe? Una vez emitido no se puede editar, porque es el documento que acompaña ' +
        'la decisión.',
    );
    if (!ok) return;

    this.error.set('');
    this.api.emitirInformeExpulsion(this.informe().id_informe).subscribe({
      next: () => {
        this.success.set('Informe emitido');
        this.cargar();
      },
      error: (err) => {
        // El backend devuelve la lista de lo que falta: mostrarla es la
        // diferencia entre "no se pudo" y saber qué completar.
        const faltan = err.error?.faltan;
        this.error.set(
          faltan?.length
            ? `No se puede emitir. Falta: ${faltan.join('; ')}.`
            : (err.error?.message ?? 'No se pudo emitir'),
        );
      },
    });
  }

  async decidir() {
    this.error.set('');
    if (!this.formDecision.decision) {
      this.error.set('Indicá si la medida se aplica o no');
      return;
    }
    if (this.contradiceRecomendacion && !this.formDecision.fundamento_director.trim()) {
      this.error.set(
        'El informe no recomienda la medida: para aplicarla igual hay que indicar de forma ' +
          'pormenorizada los fundamentos de la decisión.',
      );
      return;
    }

    const ok = await this.confirmService.confirmarAccion(
      `¿Registrar la decisión de ${this.formDecision.decision === 'aplica' ? 'aplicar' : 'no aplicar'} la medida?`,
    );
    if (!ok) return;

    this.api.decidirInformeExpulsion(this.informe().id_informe, this.formDecision).subscribe({
      next: (res: any) => {
        this.success.set(
          res?.fecha_limite_informes
            ? `Decisión registrada. Hay plazo hasta el ${res.fecha_limite_informes} para informar a la ` +
              'Superintendencia y a la SEREMI.'
            : 'Decisión registrada',
        );
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar la decisión'),
    });
  }

  guardarEnvios() {
    this.error.set('');
    this.api.registrarEnviosInforme(this.informe().id_informe, this.formEnvios).subscribe({
      next: () => {
        this.success.set('Envíos registrados');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al registrar los envíos'),
    });
  }
}
