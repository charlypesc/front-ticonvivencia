import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { RolesEnum } from './core/enum/roles.enum';
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
        canActivate: [roleGuard(RolesEnum.ENCARGADO)],
        loadComponent: () => import('./features/registros/registros').then((m) => m.Registros),
      },
      {
        path: 'validaciones',
        canActivate: [roleGuard(RolesEnum.ENCARGADO)],
        loadComponent: () =>
          import('./features/validaciones/validaciones').then((m) => m.Validaciones),
      },
      {
        path: 'usuarios',
        canActivate: [roleGuard(RolesEnum.DIRECTOR)],
        loadComponent: () => import('./features/usuarios/usuarios').then((m) => m.Usuarios),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
