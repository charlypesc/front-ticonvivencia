import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MENU } from '../../../core/constants/menu';
import { SidebarService } from '../../../core/services/sidebar.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  items = computed(() => {
    // Se lee la señal para que el menú se recalcule al iniciar/cerrar sesión.
    this.auth.usuario();
    return MENU.filter((i) => this.auth.can(i.permiso));
  });

  constructor(public auth: AuthService, public estado: SidebarService) {}
}
