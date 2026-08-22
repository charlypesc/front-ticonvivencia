import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { Permiso } from './core/constants/permisos';
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/components/layout/layout').then((m) => m.Layout),
    children: [
      {
        path: 'no-autorizado',
        loadComponent: () =>
          import('./features/no-autorizado/no-autorizado').then((m) => m.NoAutorizado),
      },
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'registros',
        canActivate: [permissionGuard(Permiso.RegistroVer)],
        loadComponent: () => import('./features/registros/registros').then((m) => m.Registros),
      },
      {
        path: 'estudiantes',
        canActivate: [permissionGuard(Permiso.EstudianteVer)],
        loadComponent: () =>
          import('./features/estudiantes/estudiantes').then((m) => m.Estudiantes),
      },
      {
        path: 'consultar-rut',
        canActivate: [permissionGuard(Permiso.EstudianteBuscar)],
        loadComponent: () =>
          import('./features/consultar-rut/consultar-rut').then((m) => m.ConsultarRut),
      },
      {
        path: 'tipos-falta',
        canActivate: [permissionGuard(Permiso.TipoFaltaVer)],
        loadComponent: () => import('./features/tipos-falta/tipos-falta').then((m) => m.TiposFalta),
      },
      {
        path: 'cursos',
        canActivate: [permissionGuard(Permiso.CursoVer)],
        loadComponent: () => import('./features/cursos/cursos').then((m) => m.Cursos),
      },
      {
        path: 'validaciones',
        canActivate: [permissionGuard(Permiso.RegistroValidar)],
        loadComponent: () =>
          import('./features/validaciones/validaciones').then((m) => m.Validaciones),
      },
      {
        path: 'usuarios',
        canActivate: [permissionGuard(Permiso.UsuarioVer)],
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard(Permiso.RolAsignarPermiso)],
        loadComponent: () => import('./features/roles/roles').then((m) => m.Roles),
      },
      {
        path: 'subir-documento',
        canActivate: [permissionGuard(Permiso.DocumentoSubir)],
        loadComponent: () =>
          import('./features/subir-documento/subir-documento').then((m) => m.SubirDocumento),
      },
      {
        path: 'protocolos-genericos',
        canActivate: [permissionGuard(Permiso.ProtocoloGenericoVer)],
        loadComponent: () =>
          import('./features/protocolos-genericos/protocolos-genericos').then(
            (m) => m.ProtocolosGenericos,
          ),
      },
      {
        path: 'protocolos-establecimiento',
        canActivate: [permissionGuard(Permiso.ProtocoloEstablecimientoVer)],
        loadComponent: () =>
          import('./features/protocolos-establecimiento/protocolos-establecimiento').then(
            (m) => m.ProtocolosEstablecimiento,
          ),
      },
      {
        path: 'geo',
        canActivate: [permissionGuard(Permiso.EstablecimientoVer)],
        loadComponent: () => import('./features/geo/geo').then((m) => m.Geo),
      },
      {
        path: 'protocolos-activados',
        canActivate: [permissionGuard(Permiso.ProtocoloActivadoVer)],
        loadComponent: () =>
          import('./features/protocolos-activados/protocolos-activados').then(
            (m) => m.ProtocolosActivados,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
