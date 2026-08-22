import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * El ADMIN es global (`id_establecimiento = null`), así que el backend le exige
 * `?id_establecimiento=` en los módulos operativos y responde 400 si falta.
 * Este interceptor lo agrega solo para el ADMIN, tomándolo del establecimiento
 * que eligió en el selector.
 *
 * Para el resto no hace nada: el backend ignora el parámetro en usuarios que no
 * son ADMIN, justamente para que nadie pueda espiar otro colegio cambiando la
 * URL. Mandarlo igual sería inútil y confuso.
 */
export const establecimientoInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (!auth.esAdmin()) return next(req);

  const id = auth.establecimientoActivo();
  if (id === null || req.params.has('id_establecimiento')) return next(req);

  return next(req.clone({ params: req.params.set('id_establecimiento', String(id)) }));
};
