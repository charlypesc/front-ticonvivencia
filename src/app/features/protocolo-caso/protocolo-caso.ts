import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import {
  GrafoProtocolo,
  NodoGrafo,
  AristaGrafo,
} from '../../shared/components/grafo-protocolo/grafo-protocolo';
import { EtiquetaPipe, etiquetaDe, humanizar } from '../../shared/pipes/etiqueta.pipe';

/**
 * Un protocolo en ejecución sobre un caso.
 *
 * La pantalla se organiza alrededor del paso en curso, no de la lista completa:
 * lo que alguien necesita saber al abrirla es qué le toca hacer ahora y hasta
 * cuándo. Los demás pasos quedan como línea de tiempo debajo, con el estado en
 * que están.
 *
 * El formulario del paso se arma con los campos que vienen del backend (el
 * schema congelado al activar), no con campos escritos a mano acá: son los
 * mismos que alimentan las condiciones de las transiciones, y duplicarlos en el
 * front significaría que un protocolo nuevo no se puede ejecutar sin desplegar.
 */
@Component({
  selector: 'app-protocolo-caso',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Puede, GrafoProtocolo, EtiquetaPipe],
  templateUrl: './protocolo-caso.html',
  styleUrl: './protocolo-caso.scss',
})
export class ProtocoloCaso implements OnInit {
  protected readonly Permiso = Permiso;

  id = 0;
  caso = signal<any | null>(null);
  bitacora = signal<any[]>([]);
  usuarios = signal<any[]>([]);
  loading = signal(true);
  guardando = signal(false);
  error = signal('');
  success = signal('');

  /** Respuestas del paso en curso, indexadas por código de campo. */
  datos: Record<string, any> = {};
  aprobado: boolean | null = null;
  comentario = '';
  nota = '';
  mostrarBitacora = signal(false);
  mostrarReasignar = signal(false);
  reasignarA: number | null = null;

  pasoActual = computed(() =>
    this.caso()?.pasos?.find((p: any) => ['en_curso', 'vencido'].includes(p.estado)) ?? null,
  );

  /** El campo 'aprobado' lo decide el botón, no el formulario. */
  camposEditables = computed(() =>
    (this.pasoActual()?.campos ?? []).filter((c: any) => c.codigo !== 'aprobado'),
  );

  activo = computed(() => this.caso()?.estado === 'activo');

  mostrarGrafo = signal(false);

  mostrarDetalle = signal(false);
  /** Paso que muestra el modal de detalle. Se guarda el id: tras completar un
   *  paso el caso se recarga entero y el objeto viejo quedaría mostrando el
   *  estado anterior. */
  pasoSeleccionadoId = signal<number | null>(null);
  pasoSeleccionado = computed(
    () =>
      (this.caso()?.pasos ?? []).find(
        (p: any) => p.id_activado_paso === this.pasoSeleccionadoId(),
      ) ?? null,
  );

  seleccionarDelGrafo(nodo: NodoGrafo) {
    this.pasoSeleccionadoId.set(nodo.id);
    this.mostrarDetalle.set(true);
  }

  // El mismo diagrama que el editor, pero con `estado`: el color muestra por
  // dónde pasó el caso y dónde está detenido, que es lo que se pregunta quien
  // llega a revisarlo.
  nodosGrafo = computed<NodoGrafo[]>(() =>
    (this.caso()?.pasos ?? []).map((p: any) => ({
      id: p.id_activado_paso,
      nombre: p.nombre,
      tipo_paso: p.tipo_paso,
      es_paso_inicial: p.es_paso_inicial,
      es_paso_final: p.es_paso_final,
      estado: p.estado,
    })),
  );

  aristasGrafo = computed<AristaGrafo[]>(() =>
    (this.caso()?.transiciones ?? []).map((t: any) => ({
      origen: t.id_paso_origen,
      destino: t.id_paso_destino,
      condicion: t.condicion,
      condicion_legible: this.condicionLegible(t.condicion),
      etiqueta: t.etiqueta,
      es_default: t.es_default,
    })),
  );

  /** La condición se guarda como `codigo=valor`, que es lo que se evalúa; en
   *  pantalla va la etiqueta del campo. `aprobado` no es un campo del
   *  formulario: es el resultado de un paso de aprobación. */
  private etiquetasCampo = computed<Map<string, string>>(() => {
    const mapa = new Map<string, string>([['aprobado', '¿Aprobado?']]);
    for (const p of this.caso()?.pasos ?? [])
      for (const c of p.campos ?? [])
        if (c.codigo) mapa.set(c.codigo, c.etiqueta || humanizar(c.codigo));
    return mapa;
  });

  condicionLegible(condicion?: string | null): string {
    if (!condicion) return '';
    const [codigo, valor] = condicion.split('=');
    const campo = this.etiquetasCampo().get(codigo?.trim()) ?? humanizar(codigo ?? '');
    const v = (valor ?? '').trim();
    if (!v) return campo;
    return `${campo} = ${v === 'si' ? 'Sí' : v === 'no' ? 'No' : v}`;
  }

  /** "4 de 9 pasos" — un caso con ramas nunca recorre todos, así que se cuenta
   *  lo cerrado (completado u omitido) sobre el total materializado. */
  get avance() {
    const pasos = this.caso()?.pasos ?? [];
    const hechos = pasos.filter((p: any) => ['completado', 'omitido'].includes(p.estado)).length;
    return `${hechos} de ${pasos.length} pasos`;
  }

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
    // Solo alimenta el selector de "reasignar". Quien no tenga usuario.ver
    // recibe 403 acá y no pasa nada: el botón ya está bloqueado por su permiso.
    this.api.getUsuarios().subscribe({ next: (data) => this.usuarios.set(data), error: () => {} });
  }

  cargar() {
    this.loading.set(true);
    this.api.getProtocoloActivado(this.id).subscribe({
      next: (data) => {
        this.caso.set(data);
        this.prepararFormulario();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo cargar el protocolo');
        this.loading.set(false);
      },
    });
  }

  /** Precarga lo ya respondido: un paso reabierto conserva lo que se llenó antes. */
  private prepararFormulario() {
    const paso = this.pasoActual();
    this.datos = {};
    this.aprobado = null;
    this.comentario = '';
    if (!paso) return;
    for (const campo of paso.campos ?? []) {
      if (campo.codigo === 'aprobado') continue;
      this.datos[campo.codigo] = paso.datos_salida?.[campo.codigo] ?? '';
    }
  }

  verBitacora() {
    this.mostrarBitacora.set(true);
    this.api.getBitacoraProtocolo(this.id).subscribe({
      next: (data) => this.bitacora.set(data),
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo cargar la bitácora'),
    });
  }

  // Los campos vacíos no se envían: el backend distingue "sin responder" de
  // cadena vacía para decidir si falta un obligatorio.
  private datosLimpios() {
    const salida: Record<string, any> = {};
    for (const [k, v] of Object.entries(this.datos))
      if (v !== null && v !== undefined && String(v).trim() !== '') salida[k] = v;
    return salida;
  }

  completar() {
    const paso = this.pasoActual();
    if (!paso) return;
    this.ejecutar(this.api.completarPaso(this.id, paso.id_activado_paso, this.datosLimpios()));
  }

  aprobar(decision: boolean) {
    const paso = this.pasoActual();
    if (!paso) return;
    this.ejecutar(
      this.api.aprobarPaso(this.id, paso.id_activado_paso, {
        aprobado: decision,
        comentario: this.comentario,
        datos_salida: this.datosLimpios(),
      }),
    );
  }

  async omitir() {
    const paso = this.pasoActual();
    if (!paso) return;
    const motivo = this.comentario.trim();
    // El motivo es obligatorio en el backend, pero pedirlo acá evita el viaje
    // y deja claro que omitir un paso deja rastro.
    if (!motivo) {
      this.error.set('Para omitir un paso hay que indicar el motivo en el comentario.');
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      `¿Omitir el paso "${paso.nombre}"? Queda registrado en la bitácora con tu nombre.`,
    );
    if (!ok) return;
    this.ejecutar(this.api.omitirPaso(this.id, paso.id_activado_paso, motivo));
  }

  reasignar() {
    const paso = this.pasoActual();
    if (!paso || !this.reasignarA) return;
    this.api.reasignarPaso(this.id, paso.id_activado_paso, this.reasignarA).subscribe({
      next: () => {
        this.mostrarReasignar.set(false);
        this.success.set('Responsable asignado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo reasignar'),
    });
  }

  async cerrar() {
    const pendientes = (this.caso()?.pasos ?? []).filter((p: any) =>
      ['pendiente', 'en_curso', 'vencido'].includes(p.estado),
    ).length;
    const motivo = this.comentario.trim();
    if (pendientes > 0 && !motivo) {
      this.error.set(
        `Quedan ${pendientes} paso(s) sin completar. Para cerrar igual, escribe el motivo en el comentario.`,
      );
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      pendientes > 0
        ? `¿Cerrar el protocolo con ${pendientes} paso(s) sin completar?`
        : '¿Cerrar el protocolo?',
    );
    if (!ok) return;
    this.ejecutar(this.api.cerrarProtocoloActivado(this.id, motivo), 'Protocolo cerrado');
  }

  async anular() {
    const motivo = this.comentario.trim();
    if (!motivo) {
      this.error.set('Para anular hay que indicar el motivo en el comentario.');
      return;
    }
    const ok = await this.confirmService.confirmarAccion(
      '¿Anular este protocolo? El caso deja de avanzar, pero la bitácora se conserva.',
    );
    if (!ok) return;
    this.ejecutar(this.api.anularProtocoloActivado(this.id, motivo), 'Protocolo anulado');
  }

  agregarNota() {
    if (!this.nota.trim()) return;
    this.api.agregarNotaProtocolo(this.id, this.nota.trim()).subscribe({
      next: () => {
        this.nota = '';
        this.success.set('Nota registrada en la bitácora');
        if (this.mostrarBitacora()) this.verBitacora();
      },
      error: (err) => this.error.set(err.error?.message ?? 'No se pudo registrar la nota'),
    });
  }

  /** Todas las acciones del motor terminan igual: mensaje, recarga, error a la vista. */
  private ejecutar(request: any, mensajeOk?: string) {
    this.error.set('');
    this.success.set('');
    this.guardando.set(true);
    request.subscribe({
      next: (r: any) => {
        this.guardando.set(false);
        this.comentario = '';
        this.success.set(
          mensajeOk ??
            (r?.cerrado
              ? 'Paso completado: el protocolo quedó cerrado'
              : r?.siguiente
                ? `Paso completado. Sigue: ${r.siguiente.nombre}`
                : (r?.message ?? 'Listo')),
        );
        this.cargar();
      },
      error: (err: any) => {
        this.guardando.set(false);
        this.error.set(err.error?.message ?? 'No se pudo completar la acción');
      },
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  icono(paso: any) {
    return (
      {
        pendiente: 'ti-circle',
        en_curso: 'ti-player-play',
        completado: 'ti-circle-check',
        omitido: 'ti-circle-minus',
        vencido: 'ti-alert-triangle',
      }[paso.estado as string] ?? 'ti-circle'
    );
  }

  rolesDe(paso: any, tipo: string) {
    return (paso.roles ?? [])
      .filter((r: any) => r.tipo_participacion === tipo)
      .map((r: any) => r.rol_nombre)
      .join(', ');
  }

  /** Las respuestas guardadas se muestran con la etiqueta del campo, no con su código. */
  respuestas(paso: any) {
    if (!paso.datos_salida) return [];
    return Object.entries(paso.datos_salida).map(([codigo, valor]) => {
      const campo = (paso.campos ?? []).find((c: any) => c.codigo === codigo);
      // Solo se traduce lo que salió de una lista cerrada. Un campo de texto
      // libre se muestra tal cual lo escribieron: humanizarlo le sacaría los
      // guiones bajos y le cambiaría la mayúscula a lo que dijo la persona.
      const esCodigo = campo?.tipo_campo === 'seleccion' || campo?.tipo_campo === 'booleano';
      return {
        etiqueta: campo?.etiqueta ?? codigo,
        valor: esCodigo ? etiquetaDe(String(valor), 'opcion_campo') : valor,
      };
    });
  }

  opciones(campo: any): string[] {
    const o = campo.opciones;
    if (Array.isArray(o)) return o;
    if (typeof o === 'string') {
      try {
        const parsed = JSON.parse(o);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  volver() {
    this.router.navigate(['/protocolos-activados']);
  }
}
