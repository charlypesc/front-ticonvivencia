import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Permiso } from '../constants/permisos';
import { MENU } from '../constants/menu';

/**
 * Guard de /dashboard. No usa permissionGuard porque /dashboard es también la
 * pantalla de entrada (login, '' y "volver" de no-autorizado apuntan acá):
 * mandar a /no-autorizado a quien no tiene dashboard.ver lo dejaría sin
 * ninguna pantalla al iniciar sesión. En su lugar lo lleva al primer ítem del
 * menú que sí puede ver.
 */
export const inicioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.can(Permiso.DashboardVer)) return true;

  const primera = MENU.find((i) => i.permiso !== Permiso.DashboardVer && auth.can(i.permiso));
  return router.parseUrl(primera?.route ?? '/no-autorizado');
};
