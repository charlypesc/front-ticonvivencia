import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { Rol } from '../../core/models/usuario.model';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  usuarios = signal<any[]>([]);
  // El catálogo viene del backend: ya no hay lista dura de roles, así que un rol
  // creado desde la administración aparece acá sin tocar el frontend.
  roles = signal<Rol[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  error = signal('');
  success = signal('');

  form: { correo: string; password: string; roles: string[] } = {
    correo: '',
    password: '',
    roles: [],
  };

  constructor(
    private api: ApiService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getRoles().subscribe({
      // Solo un ADMIN puede otorgar ADMIN: al resto ni se le ofrece. El backend
      // lo valida igual — esconderlo acá no es el control de acceso.
      next: (rs) => this.roles.set(rs.filter((r) => r.codigo !== 'ADMIN' || this.auth.esAdmin())),
      error: () => this.error.set('No se pudo cargar el catálogo de roles'),
    });
  }

  cargar() {
    this.loading.set(true);
    this.api.getUsuarios().subscribe({
      next: (data) => {
        this.usuarios.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = { correo: '', password: '', roles: [] };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  estaSeleccionado(codigo: string) {
    return this.form.roles.includes(codigo);
  }

  toggleRolSeleccionado(codigo: string) {
    const i = this.form.roles.indexOf(codigo);
    if (i >= 0) this.form.roles.splice(i, 1);
    else this.form.roles.push(codigo);
  }

  guardar() {
    this.error.set('');
    const { correo, password, roles } = this.form;

    if (!correo || !password || roles.length === 0) {
      this.error.set('Correo, contraseña y al menos un rol son requeridos');
      return;
    }

    this.api.createUsuario({ correo, password, roles }).subscribe({
      next: () => {
        this.success.set('Usuario creado exitosamente');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al crear usuario'),
    });
  }

  toggle(u: any) {
    this.api.toggleUsuario(u.id_usuario).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(err.error?.message ?? 'Error al actualizar estado'),
    });
  }
}
