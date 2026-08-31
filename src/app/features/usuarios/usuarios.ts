import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Credenciales, Rol } from '../../core/models/usuario.model';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CredencialesModal } from '../../shared/components/credenciales-modal/credenciales-modal';
import type { VarianteCredenciales } from '../../shared/utils/credenciales-pdf';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, CredencialesModal, CerrarConEsc],
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

  /**
   * Credenciales recién emitidas (alta o restablecimiento). Vive solo en
   * memoria y solo mientras el modal está abierto: la contraseña en claro no
   * se guarda en ningún lado, ni acá ni en el servidor.
   */
  credenciales = signal<Credenciales | null>(null);
  tituloCredenciales = signal('Usuario creado');
  /** Qué hoja emitir: alta de cuenta o restablecimiento. */
  varianteCredenciales = signal<VarianteCredenciales>('creacion');
  /** Roles del usuario de esas credenciales, ya legibles, para el documento. */
  rolCredenciales = signal('');

  guardando = signal(false);

  form: { correo: string; nombre: string; roles: string[] } = { correo: '', nombre: '', roles: [] };

  constructor(
    private api: ApiService,
    private confirm: ConfirmService,
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
    this.form = { correo: '', nombre: '', roles: [] };
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
    const { correo, nombre, roles } = this.form;

    if (!correo || !nombre.trim() || roles.length === 0) {
      this.error.set('Nombre, correo y al menos un rol son requeridos');
      return;
    }

    this.guardando.set(true);
    this.api
      .createUsuario({ correo, nombre: nombre.trim(), roles })
      .subscribe({
        // El modal de credenciales reemplaza al mensaje de éxito: la clave solo
        // existe en esta respuesta, así que cerrar el formulario sin mostrarla
        // obligaría a restablecerla antes de siquiera haberla entregado.
        next: (cred) => {
          this.cerrarForm();
          this.tituloCredenciales.set('Usuario creado');
          this.varianteCredenciales.set('creacion');
          this.rolCredenciales.set(this.nombresDeRoles(roles));
          this.credenciales.set(cred);
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al crear usuario'),
      })
      .add(() => this.guardando.set(false));
  }

  async restablecer(u: any) {
    this.error.set('');
    this.success.set('');

    const ok = await this.confirm.confirmarAccion(
      `¿Restablecer la contraseña de ${u.correo}?\n\n` +
        'Se generará una contraseña nueva y la actual dejará de funcionar de inmediato. ' +
        'Tendrás que entregarle el documento con la clave nueva.',
    );
    if (!ok) return;

    this.api.resetPasswordUsuario(u.id_usuario).subscribe({
      next: (cred) => {
        this.tituloCredenciales.set('Contraseña restablecida');
        this.varianteCredenciales.set('restablecimiento');
        this.rolCredenciales.set(this.nombresDeRoles(u.roles));
        this.credenciales.set(cred);
      },
      error: (err) =>
        this.error.set(err.error?.message ?? 'Error al restablecer la contraseña'),
    });
  }

  cerrarCredenciales() {
    this.credenciales.set(null);
    this.rolCredenciales.set('');
  }

  /**
   * Pasa los códigos de rol a los nombres del catálogo, para que el documento
   * diga "Encargado de convivencia" y no "ENCARGADO". Si un código no está en
   * el catálogo (rol propio de otro colegio) cae al código: es feo, pero es
   * peor entregar la hoja con el campo en blanco.
   */
  private nombresDeRoles(codigos: string[] = []): string {
    return codigos.map((c) => this.roles().find((r) => r.codigo === c)?.nombre ?? c).join(', ');
  }

  toggle(u: any) {
    this.api.toggleUsuario(u.id_usuario).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(err.error?.message ?? 'Error al actualizar estado'),
    });
  }
}
