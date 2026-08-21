import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.services';

/** Ignora tildes y mayúsculas: "ñuñoa" tiene que encontrar "ÑUÑOA". */
const normalizar = (t: string) =>
  (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Selector de establecimiento, visible SOLO para el ADMIN.
 *
 * El ADMIN es global (`id_establecimiento = null`), y el backend le exige
 * `?id_establecimiento=` en los módulos operativos: sin elegir uno, todas esas
 * pantallas le responden 400. Este control es el que alimenta al
 * establecimientoInterceptor.
 *
 * Es un buscador y no un <select> porque se busca por RBD: el RBD es el
 * identificador con el que trabaja el MINEDUC y con el que la gente tiene el
 * dato a mano, mientras que el nombre se escribe de varias formas. Un <select>
 * obliga a reconocer el colegio de vista en una lista que crece con cada alta.
 *
 * Lista solo los tenants (`es_tenant = TRUE`), no las 7.847 filas del directorio
 * nacional: son los únicos a los que se puede entrar. Un RBD del directorio que
 * todavía no tiene usuarios no es un destino válido, y se dice explícitamente en
 * vez de devolver "sin resultados", que se confunde con un RBD mal escrito.
 */
@Component({
  selector: 'app-selector-establecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (auth.esAdmin()) {
      <div class="selector-est">
        <i class="ti ti-building"></i>

        <div class="selector-est__campo">
          <input
            type="text"
            [ngModel]="abierto() ? filtro() : etiquetaActual()"
            (ngModelChange)="filtro.set($event)"
            (focus)="abrir()"
            (blur)="cerrarConDelay()"
            (keydown.escape)="cerrar()"
            (keydown.enter)="elegirPrimero()"
            [placeholder]="cargando() ? 'Cargando…' : 'Buscar por nombre o RBD…'"
            [class.selector-est__input--vacio]="auth.establecimientoActivo() === null"
          />
          <i class="ti" [class.ti-chevron-down]="!abierto()" [class.ti-x]="abierto()"></i>

          @if (abierto()) {
            <div class="selector-est__lista">
              @for (e of filtrados(); track e.id_establecimiento) {
                <div
                  class="selector-est__item"
                  [class.selector-est__item--activo]="e.id_establecimiento === auth.establecimientoActivo()"
                  (mousedown)="elegir(e)"
                >
                  <span class="selector-est__nombre">{{ e.nombre }}</span>
                  <span class="selector-est__rbd">RBD {{ e.rbd }}</span>
                </div>
              } @empty {
                <div class="selector-est__vacio">
                  @if (establecimientos().length === 0) {
                    No hay establecimientos dados de alta todavía.
                  } @else if (pareceRbd()) {
                    El RBD "{{ filtro().trim() }}" no está disponible. Solo se puede entrar
                    a los establecimientos que ya tienen usuarios creados.
                  } @else {
                    Sin resultados para "{{ filtro().trim() }}".
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (auth.establecimientoActivo() === null) {
          <span class="selector-est__aviso">Elegí un establecimiento para ver sus datos</span>
        }
      </div>
    }
  `,
  styles: [
    `
      .selector-est {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .selector-est__campo {
        position: relative;
        display: flex;
        align-items: center;
      }
      .selector-est__campo > .ti {
        position: absolute;
        right: 0.5rem;
        pointer-events: none;
        color: #98a2b3;
        font-size: 0.95rem;
      }
      .selector-est__campo input {
        width: 22rem;
        max-width: 60vw;
        padding: 0.35rem 1.75rem 0.35rem 0.5rem;
        border-radius: 6px;
        border: 1px solid var(--border, #d0d5dd);
        font: inherit;
        text-overflow: ellipsis;
      }
      .selector-est__input--vacio::placeholder {
        color: #b54708;
      }
      .selector-est__lista {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 50;
        max-height: 17rem;
        overflow-y: auto;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      .selector-est__item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.45rem 0.6rem;
        cursor: pointer;
        font-size: 0.85rem;
      }
      .selector-est__item:hover {
        background: #f3f4f6;
      }
      .selector-est__item--activo {
        background: #eef2fb;
        font-weight: 600;
      }
      .selector-est__nombre {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .selector-est__rbd {
        flex-shrink: 0;
        font-size: 0.75rem;
        color: #4b5563;
        background: #f3f4f6;
        border-radius: 999px;
        padding: 1px 7px;
      }
      .selector-est__vacio {
        padding: 0.6rem;
        font-size: 0.8rem;
        color: #6b7280;
      }
      .selector-est__aviso {
        font-size: 0.8rem;
        color: #b54708;
      }
    `,
  ],
})
export class SelectorEstablecimiento implements OnInit {
  establecimientos = signal<any[]>([]);
  cargando = signal(false);
  abierto = signal(false);
  filtro = signal('');

  /** Lo que se ve cuando el buscador está cerrado: el colegio elegido y su RBD. */
  etiquetaActual = computed(() => {
    const id = this.auth.establecimientoActivo();
    const e = this.establecimientos().find((x) => x.id_establecimiento === id);
    return e ? `${e.nombre} · RBD ${e.rbd}` : '';
  });

  /**
   * Se busca contra nombre y RBD a la vez. El RBD se compara también sin el
   * dígito verificador ("31338" encuentra "31338-2"): la gente lo dicta y lo
   * anota de las dos formas, y exigir el guión haría que una búsqueda válida
   * pareciera un colegio inexistente.
   */
  filtrados = computed(() => {
    const q = normalizar(this.filtro().trim());
    const lista = this.establecimientos();
    if (!q) return lista;

    return lista.filter((e) => {
      const rbd = String(e.rbd ?? '');
      return (
        normalizar(e.nombre).includes(q) ||
        normalizar(rbd).includes(q) ||
        rbd.split('-')[0].includes(q)
      );
    });
  });

  /** Distingue "escribí un RBD que no está de alta" de "no encontré ese nombre". */
  pareceRbd = computed(() => /^\d[\d-]*$/.test(this.filtro().trim()));

  constructor(
    public auth: AuthService,
    private api: ApiService,
  ) {}

  ngOnInit() {
    if (!this.auth.esAdmin()) return;
    this.cargando.set(true);
    this.api.getEstablecimientos().subscribe({
      next: (data) => {
        this.establecimientos.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.establecimientos.set([]);
        this.cargando.set(false);
      },
    });
  }

  abrir() {
    // Se abre con el filtro vacío para que la lista completa quede a la vista:
    // arrancar filtrado por el colegio actual mostraría un solo resultado, que
    // es justo el que no se quiere elegir.
    this.filtro.set('');
    this.abierto.set(true);
  }

  cerrar() {
    this.abierto.set(false);
    this.filtro.set('');
  }

  // El (blur) del input llega antes que el (mousedown) del ítem: sin esta espera
  // la lista se cierra y el clic nunca aterriza en la opción.
  cerrarConDelay() {
    setTimeout(() => this.cerrar(), 150);
  }

  elegirPrimero() {
    const [primero] = this.filtrados();
    if (primero) this.elegir(primero);
  }

  elegir(e: any) {
    this.cerrar();
    if (e.id_establecimiento === this.auth.establecimientoActivo()) return;
    this.cambiar(e.id_establecimiento);
  }

  cambiar(id: number | null) {
    this.auth.setEstablecimientoActivo(id);
    // Recarga para que todas las vistas abiertas vuelvan a pedir sus datos con
    // el nuevo establecimiento, en vez de quedar mostrando las del anterior.
    window.location.reload();
  }
}
