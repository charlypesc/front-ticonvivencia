import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RolesEnum } from '../../../core/enum/roles.enum';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles: (RolesEnum.ENCARGADO | RolesEnum.DIRECTOR)[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private allItems: NavItem[] = [
    {
      label: 'Inicio',
      icon: 'ti-home',
      route: '/dashboard',
      roles: [RolesEnum.ENCARGADO, RolesEnum.DIRECTOR],
    },
    {
      label: 'Consultar RUT',
      icon: 'ti-search',
      route: '/consultar-rut',
      roles: [RolesEnum.ENCARGADO, RolesEnum.DIRECTOR],
    },
    {
      label: 'Subir documento',
      icon: 'ti-cloud-upload',
      route: '/subir-documento',
      roles: [RolesEnum.ENCARGADO],
    },
    {
      label: 'Registros',
      icon: 'ti-folder',
      route: '/registros',
      roles: [RolesEnum.ENCARGADO, RolesEnum.DIRECTOR],
    },
    {
      label: 'Validaciones',
      icon: 'ti-circle-check',
      route: '/validaciones',
      roles: [RolesEnum.DIRECTOR],
    },
    { label: 'Estudiantes', icon: 'ti-users', route: '/estudiantes', roles: [RolesEnum.ENCARGADO] },
    {
      label: 'Tipos de falta',
      icon: 'ti-settings',
      route: '/tipos-falta',
      roles: [RolesEnum.ENCARGADO],
    },
    { label: 'Usuarios', icon: 'ti-user-cog', route: '/usuarios', roles: [RolesEnum.DIRECTOR] },
  ];

  items = computed(() => {
    const rol = this.auth.usuario()?.rol;
    return this.allItems.filter((i) => !rol || i.roles.includes(rol as any));
  });

  constructor(private auth: AuthService) {}
}
