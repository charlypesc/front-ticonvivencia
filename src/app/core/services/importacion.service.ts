import { Injectable, computed, signal } from '@angular/core';
import { ApiService } from './api.services';

export type TipoImportacion = 'cursos' | 'geo';

export interface ImportacionActiva {
  jobId: string;
  tipo: TipoImportacion;
  etiqueta: string;
  procesadas: number;
  total: number;
  estado: 'procesando' | 'completado' | 'error';
  mensaje?: string;
}

const STORAGE_KEY = 'tc_importaciones';
const INTERVALO_MS = 800;

/**
 * Sigue las importaciones de Excel a nivel de aplicación, no de pantalla.
 *
 * El backend procesa el archivo en segundo plano y no espera a terminar
 * (ver `procesarImportacion` en los controladores): si el usuario se va de la
 * pantalla, la importación NO se cancela — solo se perdía el seguimiento del
 * progreso, que era justamente lo confuso. Al vivir en un servicio `root`, el
 * polling continúa mientras se navega, y el widget global muestra el avance
 * hasta que termina.
 *
 * Los jobs activos se guardan en localStorage para poder retomar el seguimiento
 * si se recarga la página en medio de una importación.
 */
@Injectable({ providedIn: 'root' })
export class ImportacionService {
  activas = signal<ImportacionActiva[]>([]);

  hayEnCurso = computed(() => this.activas().some((i) => i.estado === 'procesando'));

  private timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private api: ApiService) {
    this.retomarPendientes();
  }

  seguir(jobId: string, tipo: TipoImportacion, etiqueta: string, total: number) {
    this.activas.update((as) => [
      ...as.filter((a) => a.jobId !== jobId),
      { jobId, tipo, etiqueta, procesadas: 0, total, estado: 'procesando' },
    ]);
    this.persistir();
    this.pollear(jobId, tipo);
  }

  descartar(jobId: string) {
    this.detener(jobId);
    this.activas.update((as) => as.filter((a) => a.jobId !== jobId));
    this.persistir();
  }

  private pollear(jobId: string, tipo: TipoImportacion) {
    this.detener(jobId);
    const id = setInterval(() => {
      const req =
        tipo === 'cursos'
          ? this.api.getProgresoImportacion(jobId)
          : this.api.getProgresoImportacionEstablecimientosGeo(jobId);

      req.subscribe({
        next: (job) => {
          if (job.estado === 'completado') {
            this.finalizar(jobId, 'completado', this.resumen(tipo, job));
          } else if (job.estado === 'error') {
            this.finalizar(jobId, 'error', job.message ?? 'Error durante la importación');
          } else {
            this.actualizar(jobId, { procesadas: job.procesadas, total: job.total });
          }
        },
        // El backend descarta el job 5 minutos después de terminar, y si se
        // reinicia los pierde (viven en memoria). En ese caso no se puede saber
        // si completó: se deja de seguir sin afirmar que falló.
        error: () =>
          this.finalizar(jobId, 'error', 'Se perdió el seguimiento de la importación'),
      });
    }, INTERVALO_MS);
    this.timers.set(jobId, id);
  }

  private resumen(tipo: TipoImportacion, job: any): string {
    if (tipo === 'cursos')
      return `${job.cursos_creados} curso(s), ${job.estudiantes_creados} estudiante(s) creado(s), ${job.estudiantes_omitidos} omitido(s) por RUN ya existente.`;
    return `${job.importados} establecimiento(s) creado(s), ${job.omitidos} omitido(s), ${job.filas_invalidas} fila(s) inválida(s).`;
  }

  private actualizar(jobId: string, cambios: Partial<ImportacionActiva>) {
    this.activas.update((as) => as.map((a) => (a.jobId === jobId ? { ...a, ...cambios } : a)));
    this.persistir();
  }

  private finalizar(jobId: string, estado: 'completado' | 'error', mensaje: string) {
    this.detener(jobId);
    this.actualizar(jobId, { estado, mensaje });
    this.persistir();
  }

  private detener(jobId: string) {
    const t = this.timers.get(jobId);
    if (t) clearInterval(t);
    this.timers.delete(jobId);
  }

  /** Solo se persisten las que siguen procesando: las terminadas no se retoman. */
  private persistir() {
    const pendientes = this.activas().filter((a) => a.estado === 'procesando');
    if (pendientes.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(pendientes));
  }

  private retomarPendientes() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const pendientes: ImportacionActiva[] = JSON.parse(raw);
      this.activas.set(pendientes);
      pendientes.forEach((p) => this.pollear(p.jobId, p.tipo));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
