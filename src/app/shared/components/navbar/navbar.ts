import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { SelectorEstablecimiento } from '../selector-establecimiento/selector-establecimiento';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, SelectorEstablecimiento],
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

  constructor(public auth: AuthService) {}

  logout() {
    this.auth.logout();
  }
}
