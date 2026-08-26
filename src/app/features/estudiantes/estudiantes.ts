import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ApiService } from '../../core/services/api.services';
import { ConfirmService } from '../../core/services/confirm.service';
import { ConfidencialService } from '../../core/services/confidencial.service';
import { AuthService } from '../../core/services/auth.service';
import { CursoNombrePipe } from '../../shared/pipes/curso-nombre.pipe';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';
import { RegistroForm } from '../registros/registros-form/registro-form';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-estudiantes',
  standalone: true,
  imports: [CommonModule, FormsModule, CursoNombrePipe, EtiquetaPipe, RegistroForm, Puede],
  templateUrl: './estudiantes.html',
  styleUrl: './estudiantes.scss',
})
export class Estudiantes implements OnInit, AfterViewInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  @ViewChild('buscarInput') buscarInput!: ElementRef<HTMLInputElement>;

  estudiantes = signal<any[]>([]);
  cursos = signal<any[]>([]);
  loading = signal(true);
  busqueda = signal('');
  mostrarForm = signal(false);
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');
  mostrarSugerencias = signal(false);
  filtroCurso = signal<number | null>(null);

  /**
   * Sugerencia resaltada por teclado. -1 = ninguna, que es el estado en cuanto
   * cambia lo escrito: la lista se rearma y el índice viejo apuntaría a otra
   * persona, así que abrir con Enter sin haber bajado con las flechas sería
   * abrir a alguien que nunca se miró.
   */
  indiceActivo = signal(-1);

  /**
   * Ficha del estudiante abierto, con su historial de registros. Antes esto era
   * la pantalla "Consultar por RUT": tener dos buscadores para la misma persona
   * obligaba a saber de antemano si se la iba a buscar por nombre o por RUT.
   * Ahora hay un solo buscador y la ficha se abre acá mismo — `seleccionado()`
   * es lo que decide si se ve el listado o la ficha.
   */
  seleccionado = signal<any | null>(null);
  registros = signal<any[]>([]);
  cargandoFicha = signal(false);

  mostrarRegistroForm = signal(false);
  registroSeleccionado: any = null;

  cursoFiltrado = computed(() => {
    const id = this.filtroCurso();
    return id ? this.cursos().find((c) => c.id_curso === id) ?? null : null;
  });

  filtrados = computed(() => {
    const idCurso = this.filtroCurso();
    const base = idCurso ? this.estudiantes().filter((e) => e.id_curso === idCurso) : this.estudiantes();

    const q = this.busqueda().toLowerCase().trim();
    if (!q) return base;

    // Cada palabra escrita se busca por separado, sin importar el orden ni
    // qué haya en el medio (ej. "rodrigo paredes" matchea "Rodrigo Andrés
    // Paredes Escobar" aunque tenga un segundo nombre entre medio).
    const tokens = q.split(/\s+/);
    return base.filter((e) => {
      const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
      return tokens.every((t) => nombreCompleto.includes(t)) || e.run?.includes(q);
    });
  });

  sugerencias = computed(() => {
    if (this.busqueda().trim().length < 2) return [];
    return this.filtrados().slice(0, 8);
  });

  form = {
    run: '',
    dv: '',
    nombre: '',
    apellido: '',
    sexo: '',
    id_curso: null as number | null,
  };

  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
    private confidencial: ConfidencialService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private destroyRef: DestroyRef,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getCursos().subscribe((data) => this.cursos.set(data));
    this.leerFiltroCurso();

    // Deep link heredado de /consultar-rut?rut=12345678-9: se lee una sola vez
    // al entrar y no en cada NavigationEnd, porque cerrar la ficha no toca la
    // URL — si se releyera, volver al listado la reabriría en el acto.
    const rut = this.route.snapshot.queryParamMap.get('rut');
    if (rut?.includes('-')) {
      const [run, dv] = rut.split('-');
      this.cargarFicha(run, dv);
    }

    // El Router reusa la misma instancia del componente cuando se navega a
    // /estudiantes estando ya en /estudiantes (ej. desde "Ver alumnos" en
    // Cursos, o al presionar "Estudiantes" en el sidebar de nuevo) — en ese
    // caso ngOnInit/ngAfterViewInit NO se vuelven a disparar. Escuchando
    // NavigationEnd nos aseguramos de reenfocar el buscador siempre.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.leerFiltroCurso();
        this.enfocarBuscador();
      });
  }

  private leerFiltroCurso() {
    const curso = this.route.snapshot.queryParamMap.get('curso');
    this.filtroCurso.set(curso ? Number(curso) : null);
  }

  limpiarFiltroCurso() {
    this.filtroCurso.set(null);
    this.router.navigate([], { queryParams: {} });
  }

  ngAfterViewInit() {
    this.enfocarBuscador();
  }

  private enfocarBuscador() {
    this.buscarInput?.nativeElement.focus();
  }

  cargar() {
    this.loading.set(true);
    this.api.getEstudiantes().subscribe({
      next: (data) => {
        this.estudiantes.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(estudiante?: any) {
    this.error.set('');
    this.success.set('');
    if (estudiante) {
      this.editando.set(estudiante);
      this.form = {
        run: estudiante.run,
        dv: estudiante.dv,
        nombre: estudiante.nombre,
        apellido: estudiante.apellido,
        sexo: estudiante.sexo,
        id_curso: estudiante.id_curso,
      };
    } else {
      this.editando.set(null);
      this.form = { run: '', dv: '', nombre: '', apellido: '', sexo: '', id_curso: null };
    }
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    const { run, dv, nombre, apellido, sexo, id_curso } = this.form;

    if (!run || !dv || !nombre || !apellido || !sexo || !id_curso) {
      this.error.set('Complete todos los campos requeridos');
      return;
    }

    const request = this.editando()
      ? this.api.updateEstudiante(this.editando().id_estudiante, this.form)
      : this.api.createEstudiante(this.form);

    request.subscribe({
      next: () => {
        this.success.set(this.editando() ? 'Estudiante actualizado' : 'Estudiante creado');
        this.cerrarForm();
        this.cargar();
        // Si se editó desde la ficha abierta, el encabezado del perfil todavía
        // muestra el nombre/curso viejo.
        this.refrescarFicha();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al guardar');
      },
    });
  }

  ocultarSugerenciasConDelay() {
    setTimeout(() => {
      this.mostrarSugerencias.set(false);
      this.indiceActivo.set(-1);
    }, 150);
  }

  /** Cada tecla rearma la lista, así que el resaltado vuelve a cero. */
  alEscribir(valor: string) {
    this.busqueda.set(valor);
    this.mostrarSugerencias.set(true);
    this.indiceActivo.set(-1);
  }

  /**
   * Flechas arriba/abajo por la lista, con vuelta circular: desde el último,
   * abajo lleva al primero. Es lo que hace cualquier autocomplete, y evita
   * quedarse trabado en la punta cuando hay 8 resultados.
   */
  moverSeleccion(delta: number, evento: Event) {
    const total = this.sugerencias().length;
    if (!this.mostrarSugerencias() || total === 0) return;

    // Sin esto la flecha además mueve el cursor dentro del input, y el texto
    // escrito se recorre mientras se navega la lista.
    evento.preventDefault();

    const actual = this.indiceActivo();
    this.indiceActivo.set((actual + delta + total) % total);
    this.scrollAlActivo();
  }

  /**
   * Enter abre la sugerencia resaltada. Si no hay ninguna resaltada pero quedó
   * una sola coincidencia, abre esa: escribir el nombre completo y apretar
   * Enter es el camino más corto, y con un único resultado no hay ambigüedad.
   * Con varias sin resaltar no hace nada, para no abrir a alguien al azar.
   */
  confirmarSeleccion(evento: Event) {
    if (!this.mostrarSugerencias()) return;

    const lista = this.sugerencias();
    const i = this.indiceActivo();
    const elegido = i >= 0 ? lista[i] : lista.length === 1 ? lista[0] : null;
    if (!elegido) return;

    evento.preventDefault();
    this.seleccionarEstudiante(elegido);
  }

  cerrarSugerencias() {
    this.mostrarSugerencias.set(false);
    this.indiceActivo.set(-1);
  }

  /**
   * La lista tiene alto máximo con scroll propio: sin esto, el resaltado se
   * va fuera de vista al pasar del cuarto o quinto nombre. Va en un setTimeout
   * porque la clase --activo todavía no está en el DOM cuando corre esto.
   */
  private scrollAlActivo() {
    setTimeout(() => {
      const activo = document.querySelector('.autocomplete__item--activo');
      activo?.scrollIntoView({ block: 'nearest' });
    });
  }

  /**
   * Elegir una sugerencia abre la ficha, igual que clickear la fila: el
   * autocomplete es otra forma de llegar al estudiante, no una acción distinta.
   *
   * La búsqueda no se limpia a propósito: al volver al listado la tabla sigue
   * filtrada y la persona ve dónde estaba parada.
   */
  seleccionarEstudiante(e: any) {
    this.cerrarSugerencias();
    this.abrirFicha(e);
  }

  /**
   * La ficha muestra el historial de convivencia, que es lo que el permiso
   * `estudiante.buscar` protegía cuando esto era una pantalla aparte. Quien no
   * lo tenga sigue viendo el listado y la edición, y clickear una fila le abre
   * el modal de edición como antes, en vez de una ficha vacía.
   */
  abrirFicha(e: any) {
    if (!this.auth.can(Permiso.EstudianteBuscar)) {
      this.abrirForm(e);
      return;
    }
    this.cargarFicha(e.run, e.dv);
  }

  private cargarFicha(run: string, dv: string) {
    this.error.set('');
    this.success.set('');
    this.cargandoFicha.set(true);

    this.api.consultarRut(`${run}-${dv}`).subscribe({
      next: (res: any) => {
        if (res.estudiante) {
          this.seleccionado.set(res.estudiante);
          this.registros.set(res.registros);
        } else {
          this.error.set('No se encontró el estudiante');
        }
        this.cargandoFicha.set(false);
      },
      error: (err) => {
        this.cargandoFicha.set(false);
        this.error.set(err.error?.message ?? 'Error al cargar la ficha');
      },
    });
  }

  /**
   * Al salir de la ficha se recarga el listado: si desde acá se creó o borró un
   * registro, el contador `n_registros` de la fila quedó viejo.
   */
  volverAlListado() {
    this.seleccionado.set(null);
    this.registros.set([]);
    this.error.set('');
    this.cargar();
  }

  esConfidencialBloqueado(registro: any) {
    return this.confidencial.estaBloqueado(registro);
  }

  abrirRegistro(registro: any) {
    // El backend responde 403 igual; acá se avisa con la nota en vez de abrir
    // un formulario vacío.
    if (this.confidencial.bloqueaApertura(registro)) return;

    this.registroSeleccionado = registro;
    this.mostrarRegistroForm.set(true);
  }

  abrirNuevoRegistro() {
    this.registroSeleccionado = null;
    this.mostrarRegistroForm.set(true);
  }

  cerrarRegistroForm() {
    this.mostrarRegistroForm.set(false);
    this.refrescarFicha();
  }

  /**
   * No limpia `seleccionado`/`registros` antes de responder, a diferencia de
   * cargarFicha(): evita el pestañeo de la tarjeta de perfil y de la tabla al
   * cerrar el modal de registro.
   */
  private refrescarFicha() {
    const e = this.seleccionado();
    if (!e) return;

    this.api.consultarRut(`${e.run}-${e.dv}`).subscribe({
      next: (res: any) => {
        if (res.estudiante) {
          this.seleccionado.set(res.estudiante);
          this.registros.set(res.registros);
        }
      },
    });
  }

  toggle(e: any) {
    this.api.toggleEstudiante(e.id_estudiante).subscribe(() => this.cargar());
  }

  async eliminar(e: any) {
    const confirmado = await this.confirmService.confirmarAccion(
      `¿Eliminar a ${e.nombre} ${e.apellido}?`,
    );
    if (!confirmado) return;
    this.error.set('');
    this.api.deleteEstudiante(e.id_estudiante).subscribe({
      next: () => {
        this.success.set('Estudiante eliminado');
        // Si el borrado salió desde su propia ficha, esa ficha ya no existe.
        if (this.seleccionado()?.id_estudiante === e.id_estudiante) {
          this.seleccionado.set(null);
          this.registros.set([]);
        }
        this.cargar();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al eliminar');
      },
    });
  }
}
