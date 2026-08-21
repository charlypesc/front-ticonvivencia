import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Permiso, PermisoId } from '../../../core/constants/permisos';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Permiso que habilita el ítem. Mismo id que usa el backend. */
  permiso: PermisoId;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  // El menú se arma por permiso, no por rol: así un rol nuevo creado desde la
  // administración ve automáticamente lo que le corresponde, sin desplegar.
  private allItems: NavItem[] = [
    { label: 'Inicio',        icon: 'ti-home',   route: '/dashboard',     permiso: Permiso.DashboardVer },
    { label: 'Consultar RUT', icon: 'ti-search', route: '/consultar-rut', permiso: Permiso.EstudianteBuscar },
    { label: 'Estudiantes',   icon: 'ti-users',  route: '/estudiantes',   permiso: Permiso.EstudianteVer },
    { label: 'Cursos',        icon: 'ti-school', route: '/cursos',        permiso: Permiso.CursoVer },
    { label: 'Registros',     icon: 'ti-folder', route: '/registros',     permiso: Permiso.RegistroVer },
    { label: 'Subir documento', icon: 'ti-file', route: '/subir-documento', permiso: Permiso.DocumentoSubir },
    // {
    //   label: 'Validaciones',
    //   icon: 'ti-circle-check',
    //   route: '/validaciones',
    //   permiso: Permiso.RegistroValidar,
    // },
    { label: 'Tipos de falta', icon: 'ti-settings', route: '/tipos-falta', permiso: Permiso.TipoFaltaVer },
    {
      label: 'Protocolos genéricos',
      icon: 'ti-shield',
      route: '/protocolos-genericos',
      permiso: Permiso.ProtocoloGenericoVer,
    },
    {
      label: 'Protocolos del establecimiento',
      icon: 'ti-building',
      route: '/protocolos-establecimiento',
      permiso: Permiso.ProtocoloEstablecimientoVer,
    },
    {
      label: 'Protocolos activados',
      icon: 'ti-shield-check',
      route: '/protocolos-activados',
      permiso: Permiso.ProtocoloActivadoVer,
    },
    // Catálogo cross-tenant (País/Región/Provincia/Comuna)
    { label: 'Geo',      icon: 'ti-map-2',    route: '/geo',      permiso: Permiso.EstablecimientoVer },
    { label: 'Usuarios', icon: 'ti-user-cog', route: '/usuarios', permiso: Permiso.UsuarioVer },
    // Gateado por rol.asignar_permiso (solo ADMIN) y no por rol.ver: quien
    // administra usuarios necesita rol.ver para llenar el selector de roles del
    // formulario, pero no tiene por qué ver la pantalla de configuración.
    { label: 'Roles',    icon: 'ti-lock',     route: '/roles',    permiso: Permiso.RolAsignarPermiso },
  ];

  items = computed(() => {
    // Se lee la señal para que el menú se recalcule al iniciar/cerrar sesión.
    this.auth.usuario();
    return this.allItems.filter((i) => this.auth.can(i.permiso));
  });

  constructor(public auth: AuthService) {}
}
