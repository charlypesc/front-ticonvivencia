# MiConvivencia — Frontend

Aplicación Angular (standalone components) para la gestión de convivencia escolar. Consume la API de [`backticonvivencia`](../backticonvivencia).

## Stack

- Angular 20 (standalone components, sin NgModules)
- Signals para estado reactivo (ej. `AuthService.usuario`)
- `provideHttpClient` con interceptor funcional para JWT
- SCSS, iconos `@tabler/icons-webfont`

## Estructura

```
src/app/
  app.routes.ts             # todas las rutas, con guards por ruta
  app.config.ts             # providers: router, http client + interceptor
  core/
    enum/roles.enum.ts       # RolesEnum.DIRECTOR | RolesEnum.ENCARGADO
    guards/auth.guard.ts     # exige sesión iniciada
    guards/role.guard.ts     # exige uno de los roles indicados
    interceptors/jwt.interceptor.ts  # agrega Authorization: Bearer <token>
    models/usuario.model.ts
    services/auth.service.ts # login/logout, guarda token+usuario en localStorage
    services/api.services.ts # un método por endpoint del backend
  features/                  # una carpeta por pantalla (lazy-loaded)
    auth/login/
    dashboard/
    registros/                # listado + registros-form/ (crear/editar)
    estudiantes/
    consultar-rut/            # ficha de un estudiante por RUT + su historial
    tipos-falta/
    validaciones/             # bandeja de registros pendientes de validar
    usuarios/                 # solo DIRECTOR
    subir-documento/          # sube acta manuscrita, dispara OCR en el backend
    no-autorizado/
  shared/components/
    layout/                   # shell con sidebar + router-outlet
    navbar/
    sidebar/
```

## Autenticación y permisos

- `AuthService` guarda `token` y `usuario` en `localStorage` (`tc_token`, `tc_user`) y expone `usuario` como signal.
- `jwtInterceptor` agrega el header `Authorization` a cada request saliente si hay token.
- `authGuard`: bloquea rutas si no hay sesión → redirige a `/login`.
- `roleGuard(...roles)`: bloquea rutas si el rol del usuario no está incluido → redirige a `/no-autorizado`.
- Los roles disponibles son `DIRECTOR` y `ENCARGADO` (`RolesEnum`), igual que en el backend.

Todas las rutas de negocio cuelgan del layout (`''` con `authGuard`); cada hija define su propio `roleGuard` según qué rol puede verla (ver `app.routes.ts`).

## Comunicación con el backend

`ApiService` centraliza las llamadas HTTP (un método por endpoint: registros, estudiantes, usuarios, tipos de falta, protocolos, documentos, dashboard, consulta por RUT). La URL base sale de `environment.apiUrl` (`src/environments/environment.ts`, actualmente apuntando a `http://localhost:3000/api`; hay una URL de producción comentada al lado).

## Desarrollo

```bash
npm install
ng serve
```

Abrir `http://localhost:4200/`. Requiere el backend corriendo (ver `environment.apiUrl`).

## Build

```bash
ng build
```

Genera el build de producción en `dist/`.

## Tests

```bash
ng test
```

Unit tests con Karma/Jasmine (`*.spec.ts` junto a cada componente).
