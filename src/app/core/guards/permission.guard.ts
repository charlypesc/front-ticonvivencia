import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermisoId } from '../constants/permisos';

/**
 * Guard por permiso, espejo de requirePermission() del backend.
 *
 * Reemplaza a roleGuard: con roles dinámicos, gatear por nombre de rol dejaría
 * sin acceso a cualquier rol nuevo creado desde la administración, aunque tenga
 * el permiso correspondiente.
 *
 * Con varios permisos alcanza con tener uno (misma semántica que roleGuard).
 *
 * Recibe ids de Permiso (ver core/constants/permisos.ts), no strings: un
 * permiso mal escrito no compila, en vez de bloquear la pantalla en silencio.
 */
export const permissionGuard =
  (...permisos: PermisoId[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.canAny(...permisos)) return true;

    router.navigate(['/no-autorizado']);
    return false;
  };
