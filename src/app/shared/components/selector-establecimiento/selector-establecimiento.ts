import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.services';
import { Buscador } from '../buscador/buscador';
import { normalizar, ordenarPorCoincidencia } from '../../utils/coincidencia';

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
  imports: [CommonModule, FormsModule, Buscador],
  template: `
    @if (auth.esAdmin()) {
      <div class="selector-est">
        <i class="ti ti-building"></i>

        <app-buscador
          class="selector-est__campo"
          variante="compacto"
          [items]="filtrados()"
          [texto]="filtro()"
          (textoChange)="filtro.set($event)"
          [minimoCaracteres]="0"
          [limpiarAlAbrir]="true"
          [etiquetaCerrado]="etiquetaActual()"
          [placeholder]="cargando() ? 'Cargando…' : 'Buscar por nombre o RBD…'"
          [claseInput]="auth.establecimientoActivo() === null ? 'selector-est__input--vacio' : ''"
          (elegir)="elegir($event)"
        >
          <ng-template #item let-e>
            <span class="sugerencia__fila">
              <span>{{ e.nombre }}</span>
              <span class="sugerencia__pill">RBD {{ e.rbd }}</span>
            </span>
          </ng-template>
          <ng-template #vacio>
            @if (establecimientos().length === 0) {
              No hay establecimientos dados de alta todavía.
            } @else if (pareceRbd()) {
              El RBD "{{ filtro().trim() }}" no está disponible. Solo se puede entrar
              a los establecimientos que ya tienen usuarios creados.
            } @else {
              Sin resultados para "{{ filtro().trim() }}".
            }
          </ng-template>
        </app-buscador>

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
      /* El campo, el dropdown y el chevron los pinta <app-buscador>; acá
         solo se le fija el ancho, que es propio del header. */
      .selector-est__campo {
        display: block;
        width: 22rem;
        max-width: 60vw;
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

    const coincidencias = lista.filter((e) => {
      const rbd = String(e.rbd ?? '');
      return (
        normalizar(e.nombre).includes(q) ||
        normalizar(rbd).includes(q) ||
        rbd.split('-')[0].includes(q)
      );
    });

    // Ordenado por parecido: el buscador resalta el primero y Enter lo confirma,
    // así que escribir el RBD completo tiene que dejar ese colegio arriba.
    return ordenarPorCoincidencia(coincidencias, q, (e: any) => `${e.nombre} ${e.rbd}`);
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

  elegir(e: any) {
    this.filtro.set('');
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
