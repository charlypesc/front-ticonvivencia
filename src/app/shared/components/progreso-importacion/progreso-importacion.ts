import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImportacionService } from '../../../core/services/importacion.service';

/**
 * Widget flotante con el avance de las importaciones en curso.
 *
 * Vive en el layout, así que sigue visible al navegar entre pantallas: la
 * importación corre en el servidor y no se interrumpe al salir de Cursos o Geo.
 */
@Component({
  selector: 'app-progreso-importacion',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (imp.activas().length > 0) {
      <div class="prog">
        @for (i of imp.activas(); track i.jobId) {
          <div class="prog__item" [class.prog__item--error]="i.estado === 'error'">
            <div class="prog__head">
              <span class="prog__titulo">
                @if (i.estado === 'procesando') {
                  <i class="ti ti-loader-2 prog__spin"></i>
                } @else if (i.estado === 'completado') {
                  <i class="ti ti-circle-check"></i>
                } @else {
                  <i class="ti ti-alert-triangle"></i>
                }
                {{ i.etiqueta }}
              </span>
              @if (i.estado !== 'procesando') {
                <button class="prog__cerrar" (click)="imp.descartar(i.jobId)" title="Cerrar">
                  <i class="ti ti-x"></i>
                </button>
              }
            </div>

            @if (i.estado === 'procesando') {
              <div class="prog__barra">
                <div class="prog__relleno" [style.width.%]="pct(i)"></div>
              </div>
              <small>{{ i.procesadas }} de {{ i.total }} ({{ pct(i) }}%)</small>
              <small class="prog__nota">
                Podés seguir navegando: el proceso continúa aunque cambies de página.
              </small>
            } @else {
              <small>{{ i.mensaje }}</small>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .prog {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: min(22rem, calc(100vw - 2rem));
      }
      .prog__item {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #d0d5dd);
        border-left: 3px solid var(--primary, #2f6fed);
        border-radius: 8px;
        padding: 0.75rem;
        box-shadow: 0 6px 20px rgb(16 24 40 / 12%);
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .prog__item--error {
        border-left-color: #d92d20;
      }
      .prog__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .prog__titulo {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .prog__cerrar {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--muted, #667085);
      }
      .prog__barra {
        height: 6px;
        background: var(--border, #eaecf0);
        border-radius: 999px;
        overflow: hidden;
      }
      .prog__relleno {
        height: 100%;
        background: var(--primary, #2f6fed);
        transition: width 0.2s ease;
      }
      .prog__nota {
        color: var(--muted, #667085);
      }
      .prog__spin {
        animation: prog-giro 1s linear infinite;
      }
      @keyframes prog-giro {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class ProgresoImportacion {
  constructor(public imp: ImportacionService) {}

  pct(i: { procesadas: number; total: number }) {
    return i.total > 0 ? Math.round((i.procesadas / i.total) * 100) : 0;
  }
}
