import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FechaPipe } from '../../shared/pipes/fecha.pipe';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';
import { Buscador } from '../../shared/components/buscador/buscador';

/** Sin tildes ni mayúsculas, y el RUT sin puntos ni guion: "perez" encuentra
 *  a "Pérez" y "12345678" al 12.345.678-9. */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\-]/g, '').toLowerCase().trim();

@Component({
  selector: 'app-protocolos-activados',
  standalone: true,
  imports: [FechaPipe, CommonModule, FormsModule, Puede, EtiquetaPipe, CerrarConEsc, GuardarConCmdEnter, Buscador],
  templateUrl: './protocolos-activados.html',
  styleUrl: './protocolos-activados.scss',
})
export class ProtocolosActivados implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  activados = signal<any[]>([]);

  // ── Buscador por alumno ─────────────────────────────────────────────────
  // Sugiere solo a los estudiantes que figuran en algún caso: buscar a alguien
  // sin protocolos no llevaría a ningún lado. Al elegirlo, la tabla queda con
  // sus casos.
  busquedaAlumno = signal('');
  alumnoFiltro = signal<any | null>(null);

  /** Un estudiante por fila aunque esté en varios casos, con cuántos son. */
  private alumnosInvolucrados = computed(() => {
    const porId = new Map<number, any>();
    for (const a of this.activados())
      for (const e of a.estudiantes ?? []) {
        const previo = porId.get(e.id_estudiante);
        if (previo) previo.casos.add(a.id_protocolo_activado);
        else porId.set(e.id_estudiante, { ...e, casos: new Set([a.id_protocolo_activado]) });
      }
    return [...porId.values()];
  });

  sugerenciasAlumno = computed(() => {
    const q = normalizar(this.busquedaAlumno());
    if (!q) return [];
    return this.alumnosInvolucrados()
      .filter((e) => normalizar(`${e.nombre ?? ''} ${e.rut ?? ''}`).includes(q))
      .slice(0, 20);
  });

  activadosFiltrados = computed(() => {
    const alumno = this.alumnoFiltro();
    if (!alumno) return this.activados();
    return this.activados().filter((a) =>
      (a.estudiantes ?? []).some((e: any) => e.id_estudiante === alumno.id_estudiante),
    );
  });

  elegirAlumno(e: any) {
    this.alumnoFiltro.set(e);
    this.busquedaAlumno.set('');
  }

  quitarFiltroAlumno() {
    this.alumnoFiltro.set(null);
  }

  /** Los nombres de los estudiantes del caso, para la columna de la tabla. Un
   *  mismo alumno puede figurar dos veces con roles distintos: se nombra una. */
  nombresEstudiantes(a: any): string {
    return [...new Set((a.estudiantes ?? []).map((e: any) => e.nombre))].join(', ');
  }
  protocolosEstablecimiento = signal<any[]>([]);
  registros = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  form = {
    id_protocolo_establecimiento: null as number | null,
    id_registro: null as number | null,
  };

  constructor(
    private api: ApiService,
    private router: Router,
    private confirmService: ConfirmService,
  ) {}

  /** El caso se abre en su propia pantalla: es donde se ejecuta el protocolo. */
  abrirCaso(activado: any) {
    this.router.navigate(['/protocolos-activados', activado.id_protocolo_activado]);
  }

  ngOnInit() {
    this.cargar();
    this.api.getProtocolosEstablecimiento().subscribe({
      next: (data) => this.protocolosEstablecimiento.set(data),
    });
    this.api.getRegistros().subscribe({
      next: (data) => this.registros.set(data),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocolosActivados().subscribe({
      next: (data) => {
        this.activados.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.editando.set(null);
    this.form = { id_protocolo_establecimiento: null, id_registro: null };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    if (!this.form.id_protocolo_establecimiento || !this.form.id_registro) {
      this.error.set('Debe seleccionar un protocolo y un registro');
      return;
    }

    // Activar materializa el grafo del protocolo sobre el caso, así que la
    // respuesta trae el id: se entra directo a ejecutarlo en vez de dejar al
    // usuario buscándolo en la lista.
    this.api.createProtocoloActivado(this.form).subscribe({
      next: (r: any) => {
        this.cerrarForm();
        this.router.navigate(['/protocolos-activados', r.id_protocolo_activado]);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al activar');
        // El backend responde qué está mal en el grafo cuando no es publicable.
        if (err.error?.problemas?.length)
          this.error.set(`${err.error.message}: ${err.error.problemas.join(' · ')}`);
      },
    });
  }

  async eliminar(activado: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar la activación del protocolo "${activado.nombre}"?`,
    );
    if (!confirmado) return;
    this.error.set('');
    this.api.deleteProtocoloActivado(activado.id_protocolo_activado).subscribe({
      next: () => {
        this.success.set('Activación eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }
}
