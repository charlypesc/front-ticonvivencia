import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';

@Component({
  selector: 'app-geo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './geo.html',
  styleUrl: './geo.scss',
})
export class Geo implements OnInit {
  paises = signal<any[]>([]);
  regiones = signal<any[]>([]);
  provincias = signal<any[]>([]);
  comunas = signal<any[]>([]);
  establecimientos = signal<any[]>([]);
  loading = signal(true);
  loadingEstablecimientos = signal(false);
  error = signal('');
  success = signal('');

  nivel = signal<1 | 2 | 3 | 4 | 5>(1);
  paisSel = signal<any | null>(null);
  regionSel = signal<any | null>(null);
  provinciaSel = signal<any | null>(null);
  comunaSel = signal<any | null>(null);

  // Buscador por RBD — salta directo al establecimiento sin navegar el
  // breadcrumb a mano (busca contra toda la BD, no solo la comuna actual).
  busquedaRbd = signal('');
  resultadosBusquedaRbd = signal<any[]>([]);
  mostrarResultadosBusqueda = signal(false);
  buscandoRbd = signal(false);
  private debounceBusquedaId: ReturnType<typeof setTimeout> | undefined;

  importando = signal(false);
  progreso = signal<{ procesadas: number; total: number } | null>(null);
  progresoPct = computed(() => {
    const p = this.progreso();
    return p && p.total > 0 ? Math.round((p.procesadas / p.total) * 100) : 0;
  });

  regionesDelPais = computed(() => {
    const pais = this.paisSel();
    return pais ? this.regiones().filter((r) => r.id_pais === pais.id_pais) : [];
  });

  provinciasDeLaRegion = computed(() => {
    const region = this.regionSel();
    return region ? this.provincias().filter((p) => p.id_region === region.id_region) : [];
  });

  comunasDeLaProvincia = computed(() => {
    const provincia = this.provinciaSel();
    return provincia ? this.comunas().filter((c) => c.id_provincia === provincia.id_provincia) : [];
  });

  breadcrumb = computed(() => {
    const crumbs: { label: string; nivel: 1 | 2 | 3 | 4 | 5 }[] = [{ label: 'Países', nivel: 1 }];
    const pais = this.paisSel();
    const region = this.regionSel();
    const provincia = this.provinciaSel();
    const comuna = this.comunaSel();
    if (pais) crumbs.push({ label: pais.nombre, nivel: 2 });
    if (region) crumbs.push({ label: region.nombre, nivel: 3 });
    if (provincia) crumbs.push({ label: provincia.nombre, nivel: 4 });
    if (comuna) crumbs.push({ label: comuna.nombre, nivel: 5 });
    return crumbs;
  });

  // País
  mostrarFormPais = signal(false);
  editandoPais = signal<any | null>(null);
  formPais = { nombre: '', codigo: '' };

  // Región
  mostrarFormRegion = signal(false);
  editandoRegion = signal<any | null>(null);
  formRegion = { nombre: '', id_pais: null as number | null };

  // Provincia
  mostrarFormProvincia = signal(false);
  editandoProvincia = signal<any | null>(null);
  formProvincia = { nombre: '', id_region: null as number | null };

  // Comuna
  mostrarFormComuna = signal(false);
  editandoComuna = signal<any | null>(null);
  formComuna = { nombre: '', id_provincia: null as number | null };

  // Establecimiento
  mostrarDetalleEstablecimiento = signal(false);
  detalleEstablecimiento = signal<any | null>(null);

  mostrarFormEstablecimiento = signal(false);
  editandoEstablecimiento = signal<any | null>(null);
  formEstablecimiento = {
    nombre: '',
    rbd: '',
    direccion: '',
    telefono: '',
    correo: '',
    tipo_dependencia: '',
    id_comuna: null as number | null,
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() {
    this.cargar(true);
  }

  // `inicial` solo se usa para preseleccionar Chile la primera vez — cargar()
  // también se llama después de cada alta/edición/baja para refrescar las
  // listas, y ahí NO debe tocar la navegación (sacaría al usuario del nivel
  // en el que esté trabajando).
  cargar(inicial = false) {
    this.loading.set(true);
    this.api.getPaises().subscribe((data) => {
      this.paises.set(data);
      if (inicial) {
        const chile = data.find((p: any) => p.nombre?.toLowerCase() === 'chile');
        if (chile) this.verRegiones(chile);
      }
    });
    this.api.getRegiones().subscribe((data) => this.regiones.set(data));
    this.api.getProvincias().subscribe((data) => this.provincias.set(data));
    this.api.getComunas().subscribe({
      next: (data) => {
        this.comunas.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // Buscador por RBD

  onBuscarRbdChange(valor: string) {
    this.busquedaRbd.set(valor);
    clearTimeout(this.debounceBusquedaId);

    const q = valor.trim();
    if (q.length < 2) {
      this.resultadosBusquedaRbd.set([]);
      this.mostrarResultadosBusqueda.set(false);
      return;
    }

    this.debounceBusquedaId = setTimeout(() => {
      this.buscandoRbd.set(true);
      this.api.buscarEstablecimientosGeoPorRbd(q).subscribe({
        next: (data) => {
          this.resultadosBusquedaRbd.set(data);
          this.mostrarResultadosBusqueda.set(true);
          this.buscandoRbd.set(false);
        },
        error: () => this.buscandoRbd.set(false),
      });
    }, 300);
  }

  ocultarResultadosBusquedaConDelay() {
    setTimeout(() => this.mostrarResultadosBusqueda.set(false), 150);
  }

  // Resuelve la cadena País → Región → Provincia → Comuna del establecimiento
  // elegido (ya está toda cargada en memoria salvo el propio establecimiento)
  // y salta el breadcrumb directo a su comuna.
  irAEstablecimiento(est: any) {
    const comuna = this.comunas().find((c) => c.id_comuna === est.id_comuna);
    if (!comuna) return;
    const provincia = this.provincias().find((p) => p.id_provincia === comuna.id_provincia);
    if (!provincia) return;
    const region = this.regiones().find((r) => r.id_region === provincia.id_region);
    if (!region) return;
    const pais = this.paises().find((p) => p.id_pais === region.id_pais);
    if (!pais) return;

    this.paisSel.set(pais);
    this.regionSel.set(region);
    this.provinciaSel.set(provincia);
    this.busquedaRbd.set('');
    this.mostrarResultadosBusqueda.set(false);
    this.verEstablecimientos(comuna);
  }

  // Navegación jerárquica

  verRegiones(pais: any) {
    this.paisSel.set(pais);
    this.regionSel.set(null);
    this.provinciaSel.set(null);
    this.nivel.set(2);
  }

  verProvincias(region: any) {
    this.regionSel.set(region);
    this.provinciaSel.set(null);
    this.nivel.set(3);
  }

  verComunas(provincia: any) {
    this.provinciaSel.set(provincia);
    this.comunaSel.set(null);
    this.nivel.set(4);
  }

  verEstablecimientos(comuna: any) {
    this.comunaSel.set(comuna);
    this.nivel.set(5);
    this.loadingEstablecimientos.set(true);
    this.api.getEstablecimientosGeo(comuna.id_comuna).subscribe({
      next: (data) => {
        this.establecimientos.set(data);
        this.loadingEstablecimientos.set(false);
      },
      error: () => this.loadingEstablecimientos.set(false),
    });
  }

  irANivel(n: 1 | 2 | 3 | 4 | 5) {
    this.nivel.set(n);
    if (n <= 1) this.paisSel.set(null);
    if (n <= 2) this.regionSel.set(null);
    if (n <= 3) this.provinciaSel.set(null);
    if (n <= 4) this.comunaSel.set(null);
  }

  // País

  abrirFormPais(item?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoPais.set(item ?? null);
    this.formPais = item ? { nombre: item.nombre, codigo: item.codigo ?? '' } : { nombre: '', codigo: '' };
    this.mostrarFormPais.set(true);
  }

  cerrarFormPais() {
    this.mostrarFormPais.set(false);
  }

  guardarPais() {
    this.error.set('');
    if (!this.formPais.nombre) {
      this.error.set('Nombre es requerido');
      return;
    }

    const request = this.editandoPais()
      ? this.api.updatePais(this.editandoPais().id_pais, this.formPais)
      : this.api.createPais(this.formPais);

    request.subscribe({
      next: () => {
        this.success.set(this.editandoPais() ? 'País actualizado' : 'País creado');
        this.cerrarFormPais();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminarPais(item: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${item.nombre}"?`))) return;
    this.api.deletePais(item.id_pais).subscribe({
      next: () => {
        this.success.set('País eliminado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }

  // Región

  abrirFormRegion(item?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoRegion.set(item ?? null);
    this.formRegion = item
      ? { nombre: item.nombre, id_pais: item.id_pais }
      : { nombre: '', id_pais: this.paisSel()?.id_pais ?? null };
    this.mostrarFormRegion.set(true);
  }

  cerrarFormRegion() {
    this.mostrarFormRegion.set(false);
  }

  guardarRegion() {
    this.error.set('');
    if (!this.formRegion.nombre || !this.formRegion.id_pais) {
      this.error.set('Nombre y país son requeridos');
      return;
    }

    const request = this.editandoRegion()
      ? this.api.updateRegion(this.editandoRegion().id_region, this.formRegion)
      : this.api.createRegion(this.formRegion);

    request.subscribe({
      next: () => {
        this.success.set(this.editandoRegion() ? 'Región actualizada' : 'Región creada');
        this.cerrarFormRegion();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminarRegion(item: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${item.nombre}"?`))) return;
    this.api.deleteRegion(item.id_region).subscribe({
      next: () => {
        this.success.set('Región eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }

  // Provincia

  abrirFormProvincia(item?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoProvincia.set(item ?? null);
    this.formProvincia = item
      ? { nombre: item.nombre, id_region: item.id_region }
      : { nombre: '', id_region: this.regionSel()?.id_region ?? null };
    this.mostrarFormProvincia.set(true);
  }

  cerrarFormProvincia() {
    this.mostrarFormProvincia.set(false);
  }

  guardarProvincia() {
    this.error.set('');
    if (!this.formProvincia.nombre || !this.formProvincia.id_region) {
      this.error.set('Nombre y región son requeridos');
      return;
    }

    const request = this.editandoProvincia()
      ? this.api.updateProvincia(this.editandoProvincia().id_provincia, this.formProvincia)
      : this.api.createProvincia(this.formProvincia);

    request.subscribe({
      next: () => {
        this.success.set(this.editandoProvincia() ? 'Provincia actualizada' : 'Provincia creada');
        this.cerrarFormProvincia();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminarProvincia(item: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${item.nombre}"?`))) return;
    this.api.deleteProvincia(item.id_provincia).subscribe({
      next: () => {
        this.success.set('Provincia eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }

  // Comuna

  abrirFormComuna(item?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoComuna.set(item ?? null);
    this.formComuna = item
      ? { nombre: item.nombre, id_provincia: item.id_provincia }
      : { nombre: '', id_provincia: this.provinciaSel()?.id_provincia ?? null };
    this.mostrarFormComuna.set(true);
  }

  cerrarFormComuna() {
    this.mostrarFormComuna.set(false);
  }

  guardarComuna() {
    this.error.set('');
    if (!this.formComuna.nombre || !this.formComuna.id_provincia) {
      this.error.set('Nombre y provincia son requeridos');
      return;
    }

    const request = this.editandoComuna()
      ? this.api.updateComuna(this.editandoComuna().id_comuna, this.formComuna)
      : this.api.createComuna(this.formComuna);

    request.subscribe({
      next: () => {
        this.success.set(this.editandoComuna() ? 'Comuna actualizada' : 'Comuna creada');
        this.cerrarFormComuna();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminarComuna(item: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${item.nombre}"?`))) return;
    this.api.deleteComuna(item.id_comuna).subscribe({
      next: () => {
        this.success.set('Comuna eliminada');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }

  // Establecimiento

  verDetalleEstablecimiento(item: any) {
    this.detalleEstablecimiento.set(item);
    this.mostrarDetalleEstablecimiento.set(true);
  }

  cerrarDetalleEstablecimiento() {
    this.mostrarDetalleEstablecimiento.set(false);
  }

  private recargarEstablecimientos() {
    const comuna = this.comunaSel();
    if (!comuna) return;
    this.api.getEstablecimientosGeo(comuna.id_comuna).subscribe((data) => this.establecimientos.set(data));
  }

  abrirFormEstablecimiento(item?: any) {
    this.error.set('');
    this.success.set('');
    this.editandoEstablecimiento.set(item ?? null);
    this.formEstablecimiento = item
      ? {
          nombre: item.nombre,
          rbd: item.rbd,
          direccion: item.direccion ?? '',
          telefono: item.telefono ?? '',
          correo: item.correo ?? '',
          tipo_dependencia: item.tipo_dependencia ?? '',
          id_comuna: item.id_comuna,
        }
      : {
          nombre: '',
          rbd: '',
          direccion: '',
          telefono: '',
          correo: '',
          tipo_dependencia: '',
          id_comuna: this.comunaSel()?.id_comuna ?? null,
        };
    this.mostrarFormEstablecimiento.set(true);
  }

  cerrarFormEstablecimiento() {
    this.mostrarFormEstablecimiento.set(false);
  }

  guardarEstablecimiento() {
    this.error.set('');
    if (!this.formEstablecimiento.nombre || !this.formEstablecimiento.rbd || !this.formEstablecimiento.id_comuna) {
      this.error.set('Nombre, RBD y comuna son requeridos');
      return;
    }

    const request = this.editandoEstablecimiento()
      ? this.api.updateEstablecimientoGeo(
          this.editandoEstablecimiento().id_establecimiento_geo,
          this.formEstablecimiento,
        )
      : this.api.createEstablecimientoGeo(this.formEstablecimiento);

    request.subscribe({
      next: () => {
        this.success.set(this.editandoEstablecimiento() ? 'Establecimiento actualizado' : 'Establecimiento creado');
        this.cerrarFormEstablecimiento();
        this.recargarEstablecimientos();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }

  async eliminarEstablecimiento(item: any) {
    if (!(await this.confirmService.confirmarAccion(`¿Eliminar "${item.nombre}"?`))) return;
    this.api.deleteEstablecimientoGeo(item.id_establecimiento_geo).subscribe({
      next: () => {
        this.success.set('Establecimiento eliminado');
        this.recargarEstablecimientos();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al eliminar'),
    });
  }

  // Import masivo del Excel oficial de RBD

  async onSeleccionarExcel(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    const confirmado = await this.confirmService.confirmarAccion(
      `¿Importar "${archivo.name}"? Se crearán los establecimientos del directorio nacional de RBD que aún no existan (se omiten los RBD ya registrados y las comunas que no se logren matchear).`,
    );
    if (!confirmado) {
      input.value = '';
      return;
    }

    this.error.set('');
    this.success.set('');
    this.importando.set(true);
    input.value = '';

    const formData = new FormData();
    formData.append('archivo', archivo);

    this.api.importarEstablecimientosGeoExcel(formData).subscribe({
      next: (res) => {
        this.progreso.set({ procesadas: 0, total: res.total });
        this.pollearProgreso(res.job_id);
      },
      error: (err) => {
        this.importando.set(false);
        this.progreso.set(null);
        this.error.set(err.error?.message ?? 'Error al importar el archivo');
      },
    });
  }

  private pollearProgreso(jobId: string) {
    const intervalId = setInterval(() => {
      this.api.getProgresoImportacionEstablecimientosGeo(jobId).subscribe({
        next: (job) => {
          this.progreso.set({ procesadas: job.procesadas, total: job.total });

          if (job.estado === 'completado') {
            clearInterval(intervalId);
            this.importando.set(false);
            this.progreso.set(null);
            this.success.set(
              `Importación completada: ${job.importados} establecimiento(s) creado(s), ${job.omitidos} omitido(s), ${job.filas_invalidas} fila(s) inválida(s).`,
            );
            this.recargarEstablecimientos();
          } else if (job.estado === 'error') {
            clearInterval(intervalId);
            this.importando.set(false);
            this.progreso.set(null);
            this.error.set(job.message ?? 'Error al importar el archivo');
          }
        },
        error: () => {
          clearInterval(intervalId);
          this.importando.set(false);
          this.progreso.set(null);
          this.error.set('Se perdió la conexión durante la importación');
        },
      });
    }, 800);
  }
}
