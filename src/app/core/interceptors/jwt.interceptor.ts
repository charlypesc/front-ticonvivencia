import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  // El token puede vencer con la pestaña abierta: si el backend lo rechaza, se
  // vuelve al login en vez de dejar la pantalla vacía. Solo con la marca
  // `sesion_expirada`, porque el login y el cambio de contraseña también
  // responden 401 por clave incorrecta.
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && err.error?.sesion_expirada) auth.sesionExpirada();
      return throwError(() => err);
    }),
  );
};
