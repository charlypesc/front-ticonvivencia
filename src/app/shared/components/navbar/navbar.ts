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

  // Iniciales para el avatar
  iniciales = computed(() => {
    const correo = this.auth.usuario()?.correo ?? '';
    return correo.substring(0, 2).toUpperCase();
  });

  // Cambiar la propia clave no depende de ningún permiso ni de estar en una
  // pantalla concreta, así que vive en el navbar: está disponible desde
  // cualquier módulo, que es donde la persona se acuerda de hacerlo.
  mostrarCambiarPassword = signal(false);

  constructor(public auth: AuthService) {}

  logout() {
    this.auth.logout();
  }
}
