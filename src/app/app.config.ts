import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { establecimientoInterceptor } from './core/interceptors/establecimiento.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Hash routing: Render (static site) no reescribe rutas a index.html, así que
    // recargar /estudiantes daba 404. Con /#/estudiantes el servidor siempre sirve index.html.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([jwtInterceptor, establecimientoInterceptor])),
  ],
};
