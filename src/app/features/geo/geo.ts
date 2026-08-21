import { Component, OnInit, effect, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { ImportacionService } from '../../core/services/importacion.service';
import { AuthService } from '../../core/services/auth.service';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

/**
 * Rol con el que se precarga el alta de usuario desde la ficha de un
 * establecimiento: el encargado de convivencia es quien opera el sistema día a
 * día, así que es el primer usuario que se crea casi siempre. Se puede cambiar
 * en el formulario antes de guardar.
 */
const ROL_POR_DEFECTO = 'ENCARGADO';

@Component({
  selector: 'app-geo',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede],
  templateUrl: './geo.html',
  styleUrl: './geo.scss',
})
export class Geo implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

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

  /** Ventana entre el clic y la respuesta del POST: todavía no hay job que seguir. */
  private subiendo = signal(false);

  // El progreso vive en el servicio global: la importación sigue corriendo en el
  // servidor aunque se navegue a otra pantalla, y el widget flotante la muestra.
  private jobGeo = computed(
    () => this.importacion.activas().find((a) => a.tipo === 'geo' && a.estado === 'procesando') ?? null,
  );
  importando = computed(() => this.subiendo() || this.jobGeo() !== null);
  progreso = computed(() => {
    const j = this.jobGeo();
    return j ? { procesadas: j.procesadas, total: j.total } : null;
  });
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

  /** El elegido en el buscador por RBD: se fija arriba de la tabla. */
  destacadoId = signal<number | null>(null);

  /**
   * La lista con el establecimiento buscado en primer lugar.
   *
   * Se reordena acá y no en el backend porque el destacado depende de qué se
   * buscó en esta pantalla, no de los datos: pedirlo al servidor obligaría a
   * mandarle el id en cada listado de comuna.
   */
  establecimientosOrdenados = computed(() => {
    const lista = this.establecimientos();
    const id = this.destacadoId();
    if (id === null) return lista;

    const destacado = lista.find((e) => e.id_establecimiento === id);
    // Puede no estar si se recargó la comuna o si el buscador trajo uno de otra:
    // en ese caso se muestra la lista tal cual, sin inventar una fila.
    if (!destacado) return lista;

    return [destacado, ...lista.filter((e) => e.id_establecimiento !== id)];
  });

  esDestacado(est: any) {
    return est?.id_establecimiento === this.destacadoId();
  }

  // Alta de usuario para un establecimiento puntual, desde su ficha. Evita
  // tener que ir a Usuarios, cambiar el selector de establecimiento y volver.
  mostrarFormUsuario = signal(false);
  establecimientoUsuario = signal<any | null>(null);
  rolesUsuario = signal<any[]>([]);
  formUsuario = { correo: '', password: '', roles: [] as string[] };
  guardandoUsuario = signal(false);

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
    private importacion: ImportacionService,
    public auth: AuthService,
  ) {
    effect(() => {
      for (const imp of this.importacion.activas()) {
        if (imp.tipo !== 'geo' || imp.estado === 'procesando') continue;
        if (this.jobsResueltos.has(imp.jobId)) continue;
        this.jobsResueltos.add(imp.jobId);

        if (imp.estado === 'completado') {
          this.success.set(`Importación completada: ${imp.mensaje}`);
          this.recargarEstablecimientos();
        } else {
          this.error.set(imp.mensaje ?? 'Error al importar el archivo');
        }
      }
    });
  }

  /** Evita reaccionar dos veces al mismo job cuando el effect se vuelve a correr. */
  private jobsResueltos = new Set<string>();

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

    // Va después de verEstablecimientos() a propósito: esa función limpia el
    // destacado anterior. La comuna puede tener cientos de colegios, así que
    // sin esto habría que buscar a mano el que se acaba de elegir.
    this.destacadoId.set(est.id_establecimiento);
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
    // Entrar a una comuna desde el breadcrumb no destaca nada: el destacado lo
    // vuelve a poner irAEstablecimiento() después, solo cuando se llegó por el
    // buscador. Sin esto, el resaltado de una búsqueda anterior quedaría pegado
    // al navegar a otra comuna.
    this.destacadoId.set(null);
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

  /** Ya tiene gente operando el sistema: es lo que se marca en verde. */
  tieneUsuarios(est: any) {
    return (est?.cantidad_usuarios ?? 0) > 0;
  }

  /**
   * "Ingresar" = pararse en ese colegio para ver sus datos. Solo tiene sentido
   * para el ADMIN, que es el único global; el resto ya está parado en el suyo y
   * no puede cambiarse.
   *
   * Se exige que tenga usuarios porque entrar a un colegio del directorio sin
   * dar de alta a nadie deja al admin en pantallas vacías, sin nada que hacer
   * ahí ni forma de darse cuenta de por qué.
   */
  puedeIngresar(est: any) {
    return this.auth.esAdmin() && this.tieneUsuarios(est);
  }

  ingresarAEstablecimiento(est: any) {
    // setEstablecimientoActivo + reload es el mismo camino que usa el selector
    // del navbar: recargar es lo que hace que todas las pantallas abiertas
    // vuelvan a pedir sus datos con el establecimiento nuevo.
    this.auth.setEstablecimientoActivo(est.id_establecimiento);
    window.location.assign('/dashboard');
  }

  // Alta de usuario del establecimiento

  /**
   * Solo el ADMIN. A diferencia de la pantalla de Usuarios (que va por permiso
   * `usuario.crear` y siempre alta dentro del propio colegio), acá se está
   * creando un usuario *de otro* establecimiento, elegido desde el mapa. Eso es
   * una operación global y le corresponde únicamente al administrador.
   */
  puedeCrearUsuario = () => this.auth.esAdmin();

  abrirFormUsuario(est: any) {
    this.error.set('');
    this.establecimientoUsuario.set(est);
    this.formUsuario = { correo: '', password: '', roles: [ROL_POR_DEFECTO] };
    this.mostrarFormUsuario.set(true);

    // El catálogo se pide cada vez que se abre: un rol creado hace un minuto
    // desde la administración tiene que aparecer sin recargar la página.
    this.api.getRoles().subscribe({
      next: (rs) => {
        // ADMIN es global y no pertenece a ningún colegio: ofrecerlo acá, donde
        // se está creando el usuario *de* un establecimiento, sería contradictorio.
        const asignables = rs.filter((r) => r.codigo !== 'ADMIN');
        this.rolesUsuario.set(asignables);

        // Si el rol por defecto no existe en este catálogo, la selección
        // quedaría apuntando a un rol inexistente y el backend rechazaría el
        // alta recién al guardar. Mejor dejarlo vacío y que se elija.
        if (!asignables.some((r) => r.codigo === ROL_POR_DEFECTO)) this.formUsuario.roles = [];
      },
      error: () => this.error.set('No se pudo cargar el catálogo de roles'),
    });
  }

  cerrarFormUsuario() {
    this.mostrarFormUsuario.set(false);
    this.establecimientoUsuario.set(null);
  }

  rolUsuarioMarcado(codigo: string) {
    return this.formUsuario.roles.includes(codigo);
  }

  alternarRolUsuario(codigo: string) {
    const i = this.formUsuario.roles.indexOf(codigo);
    if (i >= 0) this.formUsuario.roles.splice(i, 1);
    else this.formUsuario.roles.push(codigo);
  }

  guardarUsuario() {
    this.error.set('');
    const est = this.establecimientoUsuario();
    if (!est) return;

    const { correo, password, roles } = this.formUsuario;
    if (!correo || !password || roles.length === 0) {
      this.error.set('Correo, contraseña y al menos un rol son requeridos');
      return;
    }
    if (password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.guardandoUsuario.set(true);
    this.api.createUsuarioEn(est.id_establecimiento, { correo, password, roles }).subscribe({
      next: () => {
        this.success.set(`Usuario creado en ${est.nombre} (RBD ${est.rbd})`);
        this.cerrarFormUsuario();
        // Refresca para que la fila pase a verde y aparezca "Ingresar": el
        // conteo de usuarios lo calcula el backend, no se puede ajustar a mano
        // acá sin arriesgar que muestre algo distinto de lo que quedó guardado.
        this.recargarEstablecimientos();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al crear el usuario'),
    }).add(() => this.guardandoUsuario.set(false));
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
          this.editandoEstablecimiento().id_establecimiento,
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
    this.api.deleteEstablecimientoGeo(item.id_establecimiento).subscribe({
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
    this.subiendo.set(true);
    input.value = '';

    const formData = new FormData();
    formData.append('archivo', archivo);

    this.api.importarEstablecimientosGeoExcel(formData).subscribe({
      next: (res) => {
        this.subiendo.set(false);
        this.importacion.seguir(res.job_id, 'geo', `Importando "${archivo.name}"`, res.total);
      },
      error: (err) => {
        this.subiendo.set(false);
        this.error.set(err.error?.message ?? 'Error al importar el archivo');
      },
    });
  }


}
