import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { SelectorEstablecimiento } from '../selector-establecimiento/selector-establecimiento';
import { CambiarPasswordModal } from '../cambiar-password-modal/cambiar-password-modal';
import { CampanaNotificaciones } from '../campana-notificaciones/campana-notificaciones';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, SelectorEstablecimiento, CambiarPasswordModal, CampanaNotificaciones],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  usuario = computed(() => this.auth.usuario());

  /**
   * Iniciales del avatar: del nombre cuando lo hay ("María González" → MG), y
   * del correo en las cuentas viejas que se crearon sin nombre.
   */
  iniciales = computed(() => {
    const u = this.auth.usuario();
    const partes = (u?.nombre ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (partes.length) return partes.map((p) => p.charAt(0)).join('').toUpperCase();
    return (u?.correo ?? '').substring(0, 2).toUpperCase();
  });

  /**
   * Nombre para el saludo. Sin nombre cargado cae al usuario del correo (lo de
   * antes del @): "Bienvenido, encargado" es peor que un nombre, pero mucho
   * mejor que un saludo a medias.
   */
  nombreCorto = computed(() => {
    const u = this.auth.usuario();
    const nombre = (u?.nombre ?? '').trim();
    if (nombre) return nombre.split(/\s+/).slice(0, 2).join(' ');
    return (u?.correo ?? '').split('@')[0];
  });

  /**
   * El colegio en el que se está trabajando. Para el ADMIN, que no pertenece a
   * ninguno, esto queda vacío: su establecimiento activo lo muestra —y lo
   * cambia— el selector que ya está en la barra.
   */
  establecimiento = computed(() => {
    const u = this.auth.usuario();
    if (!u?.nombre_establecimiento) return null;
    return { nombre: u.nombre_establecimiento, rbd: u.rbd_establecimiento ?? null };
  });

  // Cambiar la propia clave no depende de ningún permiso ni de estar en una
  // pantalla concreta, así que vive en el navbar: está disponible desde
  // cualquier módulo, que es donde la persona se acuerda de hacerlo.
  mostrarCambiarPassword = signal(false);

  constructor(public auth: AuthService) {
    // El saludo y el colegio salen de datos que no viajan en el token: se
    // refrescan al montar la barra, que es una vez por carga de la app.
    this.auth.refrescarUsuario();
  }

  logout() {
    this.auth.logout();
  }
}
