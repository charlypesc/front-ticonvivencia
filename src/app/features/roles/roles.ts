import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { Permiso as PermisoModel, Rol } from '../../core/models/usuario.model';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, EtiquetaPipe, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './roles.html',
  styleUrl: './roles.scss',
})
export class Roles implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  roles = signal<Rol[]>([]);
  catalogo = signal<PermisoModel[]>([]);
  seleccionado = signal<Rol | null>(null);
  // Se guardan los permiso_id, no los códigos: es lo que espera el backend y
  // lo mismo que viaja en el token.
  permisosDelRol = signal<Set<number>>(new Set());
  // Foto de los permisos al abrir el rol: fija el orden de las tarjetas para
  // que no salten mientras se marcan y desmarcan checkboxes.
  ordenBase = signal<Set<number>>(new Set());
  loading = signal(true);
  error = signal('');
  success = signal('');
  mostrarForm = signal(false);

  // Sin `codigo`: el identificador interno lo deriva el backend a partir del
  // nombre. No es un dato que el usuario tenga que inventar.
  form = { nombre: '', descripcion: '', ambito: 'global' as 'global' | 'establecimiento' };

  /**
   * El catálogo agrupado por recurso, con los módulos que el rol ya tiene
   * habilitados arriba: es lo que se viene a revisar, y así no hay que
   * scrollear todo el catálogo para encontrarlos.
   *
   * El orden se calcula sobre `ordenBase` —una foto de los permisos al abrir
   * el rol— y no sobre la selección en curso: si dependiera de ella, marcar un
   * checkbox reacomodaría las tarjetas debajo del cursor mientras se edita.
   */
  porRecurso = computed(() => {
    const grupos = new Map<string, PermisoModel[]>();
    for (const p of this.catalogo()) {
      if (!grupos.has(p.recurso)) grupos.set(p.recurso, []);
      grupos.get(p.recurso)!.push(p);
    }
    const base = this.ordenBase();
    return [...grupos.entries()]
      .map(([recurso, permisos]) => ({
        recurso,
        permisos,
        conPermisos: permisos.some((p) => base.has(p.permiso_id)),
      }))
      .sort((a, b) =>
        a.conPermisos === b.conPermisos
          ? a.recurso.localeCompare(b.recurso)
          : a.conPermisos ? -1 : 1,
      );
  });

  constructor(
    private api: ApiService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getCatalogoPermisos().subscribe({
      next: (p) => this.catalogo.set(p),
      error: () => this.error.set('No se pudo cargar el catálogo de permisos'),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getRoles().subscribe({
      next: (r) => {
        this.roles.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  seleccionar(rol: Rol) {
    this.seleccionado.set(rol);
    this.success.set('');
    this.error.set('');
    this.api.getPermisosDeRol(rol.rol_id).subscribe({
      next: (ps) => {
        const ids = new Set(ps.map((p) => p.permiso_id));
        this.permisosDelRol.set(ids);
        this.ordenBase.set(new Set(ids));
      },
      error: () => this.error.set('No se pudieron cargar los permisos del rol'),
    });
  }

  tiene(id: number) {
    return this.permisosDelRol().has(id);
  }

  /**
   * Quién puede editar qué rol lo decide el backend y viaja en `editable`
   * (ver Rol en core/models). Acá no se recalcula: si la pantalla dedujera la
   * regla por su cuenta, un día dejaría editar algo que el backend rechaza al
   * guardar. Es false para el ADMIN y, para quien no lo sea, para los roles
   * globales.
   */
  get editable() {
    return this.seleccionado()?.editable === true;
  }

  /**
   * Motivo del bloqueo para el tooltip de los controles apagados. El permiso
   * genérico no alcanza acá: quien tiene rol.asignar_permiso igual no puede
   * tocar un rol global, y "te falta rol.asignar_permiso" sería falso.
   */
  motivoBloqueo() {
    const rol = this.seleccionado();
    if (rol?.codigo === 'ADMIN') return 'Los permisos del ADMIN no se editan';
    if (rol && !rol.editable)
      return 'Es un rol global: solo un administrador puede cambiarle los permisos';
    return 'No tienes permiso para configurar los permisos de un rol';
  }

  /** Cuántos permisos del grupo están marcados: lo muestra el contador de la tarjeta. */
  marcados(permisos: PermisoModel[]) {
    return permisos.filter((p) => this.tiene(p.permiso_id)).length;
  }

  /** El check del título refleja el grupo: marcado solo si están todos. */
  todosMarcados(permisos: PermisoModel[]) {
    return permisos.length > 0 && this.marcados(permisos) === permisos.length;
  }

  alternar(id: number) {
    if (!this.editable) return;
    const s = new Set(this.permisosDelRol());
    s.has(id) ? s.delete(id) : s.add(id);
    this.permisosDelRol.set(s);
  }

  alternarRecurso(permisos: PermisoModel[]) {
    if (!this.editable) return;
    const s = new Set(this.permisosDelRol());
    const todos = permisos.every((p) => s.has(p.permiso_id));
    permisos.forEach((p) => (todos ? s.delete(p.permiso_id) : s.add(p.permiso_id)));
    this.permisosDelRol.set(s);
  }

  guardarPermisos() {
    const rol = this.seleccionado();
    if (!rol) return;
    this.error.set('');
    this.api.setPermisosDeRol(rol.rol_id, [...this.permisosDelRol()]).subscribe({
      next: (res: any) => {
        // El backend avisa que los permisos viajan en el JWT: quien tenga sesión
        // abierta conserva los anteriores hasta volver a entrar.
        this.success.set(res?.advertencia ? `${res.message}. ${res.advertencia}` : 'Permisos actualizados');
        // Recién acá se reacomodan las tarjetas: la edición terminó, así que
        // los módulos habilitados vuelven a quedar arriba.
        this.ordenBase.set(new Set(this.permisosDelRol()));
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar los permisos'),
    });
  }

  abrirForm() {
    // Un rol global lo heredan todos los colegios, así que solo el ADMIN los
    // crea: al resto se le fija el alcance en su propio establecimiento (es lo
    // que el backend hace igual, ignorando el `ambito` que le manden).
    this.form = {
      nombre: '',
      descripcion: '',
      ambito: this.auth.esAdmin() ? 'global' : 'establecimiento',
    };
    this.error.set('');
    this.mostrarForm.set(true);
  }

  crearRol() {
    if (!this.form.nombre) {
      this.error.set('El nombre es requerido');
      return;
    }
    this.api.createRol(this.form).subscribe({
      next: () => {
        this.success.set('Rol creado');
        this.mostrarForm.set(false);
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al crear el rol'),
    });
  }
}
