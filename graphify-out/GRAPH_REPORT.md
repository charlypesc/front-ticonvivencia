# Graph Report - front-ticonvivencia  (2026-09-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1200 nodes · 2420 edges · 72 communities (37 shown, 23 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 293 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8fefda14`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- .confirmarAccion
- ProtocoloFlujo
- Usuarios
- options
- MedidasDisciplinarias
- ApiService
- Geo
- Listado de registros de convivencia
- ImportacionService
- protocolo-caso.ts
- RegistroForm
- credenciales-pdf.ts
- app.routes.ts
- DocumentosInstitucionales
- GrafoProtocolo
- InformeExpulsion
- ProtocoloCaso
- SubirDocumento
- Buscador
- Roles
- Estudiantes
- MedidasProteccion
- devDependencies
- dependencies
- protocolo-flujo.ts
- TiposFalta
- estudiantes.ts
- geo.ts
- ConfirmService
- CampanaNotificaciones
- ExpedienteService
- Feriados
- app.config.ts
- Registros
- AuthService
- layout.ts
- ConfidencialService
- CerrarConEsc
- Autenticación y permisos (JWT + guards)
- SelectorEstablecimiento
- package.json
- dashboard.ts
- ActaNotificacionService
- login.ts
- Suspensión cautelar (art. 6 letra d)
- scripts
- CambiarPasswordModal
- navbar.ts
- selector-establecimiento.ts
- sidebar.ts
- RolesEnum
- Favicon MiConvivencia (silueta familia/comunidad escolar)
- MiConvivencia App Logo
- @angular/forms
- karma-jasmine-html-reporter
- @types/jasmine
- environment.prod.ts
- Backend CRUD scopeado por establecimiento
- Input
- Pipe

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 226 edges
2. `ProtocoloCaso` - 63 edges
3. `Geo` - 61 edges
4. `ProtocoloFlujo` - 58 edges
5. `AuthService` - 48 edges
6. `ConfirmService` - 40 edges
7. `RegistroForm` - 31 edges
8. `MedidasDisciplinarias` - 30 edges
9. `GrafoProtocolo` - 29 edges
10. `Buscador` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Doble validación frontend + backend` --semantically_similar_to--> `Directiva appPuede: bloqueo de UI por permiso`  [INFERRED] [semantically similar]
  docs/flujo-crear-estudiante.pdf → src/app/shared/components/layout/layout.html
- `Relación N:M ESTUDIANTE ↔ REGISTRO_CONVIVENCIA vía REGISTRO_ESTUDIANTE` --conceptually_related_to--> `Selección de estudiantes involucrados y su rol`  [INFERRED]
  docs/flujo-crear-estudiante.pdf → src/app/features/registros/registros-form/registro-form.html
- `Multi-tenant por id_establecimiento del token` --conceptually_related_to--> `Ámbito de rol: global vs establecimiento`  [INFERRED]
  docs/flujo-crear-estudiante.pdf → src/app/features/roles/roles.html
- `Multi-tenant por id_establecimiento del token` --conceptually_related_to--> `Barra superior de navegación`  [INFERRED]
  docs/flujo-crear-estudiante.pdf → src/app/shared/components/navbar/navbar.html
- `Interruptor de acceso del establecimiento` --conceptually_related_to--> `Autenticación y permisos (JWT + guards)`  [INFERRED]
  src/app/features/geo/geo.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ciclo de vida de un protocolo: catálogo → adopción → flujo → caso → expediente** — src_app_features_protocolos_genericos_protocolos_genericos, src_app_features_protocolos_establecimiento_protocolos_establecimiento, src_app_features_protocolo_flujo_protocolo_flujo, src_app_features_protocolos_activados_protocolos_activados, src_app_features_protocolo_caso_protocolo_caso, src_app_features_informe_expulsion_informe_expulsion [EXTRACTED 1.00]
- **Convenciones de presentación al usuario final (fecha, etiqueta, cursoNombre, PDF Latin-1)** — claude_formato_fecha, claude_etiquetas_codigos, claude_curso_nombre_pipe, claude_jspdf_latin1 [EXTRACTED 1.00]
- **Trazabilidad de plazos legales (feriados, cumplimiento, notificación, expulsión)** — src_app_features_feriados_feriados, src_app_features_dashboard_dashboard_cumplimiento, src_app_features_protocolo_caso_protocolo_caso_gestiones, src_app_features_informe_expulsion_informe_expulsion_decision, ley_21809_cumplimiento [EXTRACTED 1.00]
- **Cadena legal tipo de falta → protocolo obligatorio → registro** — src_app_features_tipos_falta_tipos_falta_vinculoprotocolo, src_app_features_registros_registros_form_registro_form_activarprotocolo, src_app_features_registros_registros_protocolopendiente, src_app_shared_components_grafo_protocolo_grafo_protocolo_grafo [INFERRED 0.85]
- **Control de acceso por permisos en toda la UI** — src_app_shared_components_layout_layout_apppuede, src_app_features_roles_roles_pantalla, src_app_features_usuarios_usuarios_pantalla, src_app_shared_components_sidebar_sidebar_menu, docs_flujo_crear_estudiante_middlewaresseguridad [INFERRED 0.85]
- **Expediente de medidas con plazos legales y avisos de infracción** — src_app_shared_components_medidas_disciplinarias_medidas_disciplinarias_panel, src_app_shared_components_medidas_disciplinarias_medidas_disciplinarias_suspensioncautelar, src_app_shared_components_medidas_proteccion_medidas_proteccion_panel, src_app_shared_components_medidas_proteccion_medidas_proteccion_deberesart16ej, src_app_shared_components_medidas_disciplinarias_medidas_disciplinarias_plazoslegales [INFERRED 0.85]

## Communities (72 total, 23 thin omitted)

### Community 0 - ".confirmarAccion"
Cohesion: 0.06
Nodes (6): ProtocolosActivados, Component, ProtocolosEstablecimiento, Component, ProtocolosGenericos, Component

### Community 1 - "ProtocoloFlujo"
Cohesion: 0.06
Nodes (4): ProtocoloFlujo, Component, NodoGrafo, NodoUbicado

### Community 2 - "Usuarios"
Cohesion: 0.06
Nodes (15): Establecimiento, Component, Component, Usuarios, dominioDe(), dominioDeCuentas(), dominioDesdeCorreo(), dominioDesdeNombre() (+7 more)

### Community 3 - "options"
Cohesion: 0.05
Nodes (47): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+39 more)

### Community 4 - "MedidasDisciplinarias"
Cohesion: 0.07
Nodes (7): Input, MedidasDisciplinarias, Component, ahoraIso(), dos(), hoyIso(), Partes

### Community 6 - "Geo"
Cohesion: 0.07
Nodes (3): Geo, Component, completarDominio()

### Community 7 - "Listado de registros de convivencia"
Cohesion: 0.07
Nodes (33): ON DELETE RESTRICT: no se borra un estudiante con incidentes, Doble validación frontend + backend, Flujo completo: crear un estudiante nuevo, Middlewares verifyToken + requireRole, Multi-tenant por id_establecimiento del token, Relación N:M ESTUDIANTE ↔ REGISTRO_CONVIVENCIA vía REGISTRO_ESTUDIANTE, Tabla ESTUDIANTE (PK id_estudiante, FK id_curso e id_establecimiento), Activación de protocolo desde el registro (+25 more)

### Community 8 - "ImportacionService"
Cohesion: 0.10
Nodes (4): ImportacionService, Injectable, Cursos, Component

### Community 9 - "protocolo-caso.ts"
Cohesion: 0.14
Nodes (18): Formato de fecha dd/MM/yyyy, PDFs con jsPDF: sólo Latin-1, Ley 21.809 y plazos legales de convivencia, DatosActa, Item, Seccion, Tablero de cumplimiento de protocolos, Constancias de recepción por versión (+10 more)

### Community 10 - "RegistroForm"
Cohesion: 0.08
Nodes (4): RegistroForm, Component, Input, Output

### Community 11 - "credenciales-pdf.ts"
Cohesion: 0.09
Nodes (24): CredencialesModal, Component, Input, Output, LOGO_CREDENCIALES_PNG, acortar(), AZUL, AZUL_MARCA (+16 more)

### Community 12 - "app.routes.ts"
Cohesion: 0.20
Nodes (11): Pipe, CODIGO_POR_ID, Permiso, PermisoId, authGuard(), permissionGuard(), Paso, Puede (+3 more)

### Community 17 - "SubirDocumento"
Cohesion: 0.12
Nodes (5): SubirDocumento, Component, cambiarExtension(), comprimirImagen(), esImagen()

### Community 19 - "Buscador"
Cohesion: 0.15
Nodes (6): ContentChild, Buscador, Component, Input, Output, ViewChild

### Community 20 - "Roles"
Cohesion: 0.13
Nodes (3): Permiso, Roles, Component

### Community 21 - "Estudiantes"
Cohesion: 0.14
Nodes (3): Estudiantes, Component, ViewChild

### Community 22 - "MedidasProteccion"
Cohesion: 0.13
Nodes (3): MedidasProteccion, Component, Input

### Community 23 - "devDependencies"
Cohesion: 0.11
Nodes (19): @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core, karma, karma-chrome-launcher, karma-coverage, karma-jasmine (+11 more)

### Community 24 - "dependencies"
Cohesion: 0.11
Nodes (19): @angular/common, @angular/compiler, @angular/core, @angular/platform-browser, @angular/router, jspdf, dependencies, @angular/common (+11 more)

### Community 25 - "protocolo-flujo.ts"
Cohesion: 0.13
Nodes (12): Nunca mostrar códigos crudos de la base, Bifurcación Sí/No desde una pregunta del paso, CampoEdit, Herencia del flujo del catálogo vs personalización, PrevioEdit, RamaEdit, SalidaEdit, AccionNodo (+4 more)

### Community 28 - "estudiantes.ts"
Cohesion: 0.17
Nodes (12): Directiva appPuede (permisos en la UI), Formato de nombre de curso (cursoNombre), Import masivo desde Excel, Job en memoria + polling de progreso, Modal de confirmación propio (ConfirmService), Patrón CRUD de mantenedores, Variante: registro único (no lista), Ficha del estudiante absorbe Consultar por RUT (+4 more)

### Community 29 - "geo.ts"
Cohesion: 0.25
Nodes (9): AuthResponse, Credenciales, Rol, Usuario, ID_POR_CODIGO, ImportacionActiva, TipoImportacion, VarianteCredenciales (+1 more)

### Community 31 - "ConfirmService"
Cohesion: 0.18
Nodes (8): CampoConfirm, ConfirmService, ConfirmState, Injectable, Adopción de protocolos del catálogo al establecimiento, AutoAjustarTextarea, Directive, HostListener

### Community 35 - "app.config.ts"
Cohesion: 0.22
Nodes (7): App, appConfig, routes, Component, establecimientoInterceptor(), jwtInterceptor(), index.html (shell MiConvivencia)

### Community 37 - "AuthService"
Cohesion: 0.19
Nodes (3): AuthService, normalizarPermisos(), Injectable

### Community 39 - "layout.ts"
Cohesion: 0.20
Nodes (6): ConfirmModal, Component, Layout, Component, ProgresoImportacion, Component

### Community 42 - "CerrarConEsc"
Cohesion: 0.27
Nodes (5): TIPOS_CON_PLAZO, TIPOS_MEDIDA, CerrarConEsc, Directive, HostListener

### Community 43 - "Autenticación y permisos (JWT + guards)"
Cohesion: 0.22
Nodes (7): ApiService centralizado (un método por endpoint), Autenticación y permisos (JWT + guards), MiConvivencia Frontend, Interruptor de acceso del establecimiento, Dominio de correo sugerido al crear usuario, NoAutorizado, Component

### Community 45 - "package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 51 - "Suspensión cautelar (art. 6 letra d)"
Cohesion: 0.33
Nodes (7): Pronunciamiento escrito del Consejo de Profesores, Panel de medidas disciplinarias, Doble plazo legal: 10 días para resolver, 5 para reconsiderar, Suspensión cautelar (art. 6 letra d), Corrección de carga permitida solo sin seguimientos, Deberes del art. 16 E letra j sobre estudiante suspendido, Panel de medidas de protección

### Community 52 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, ng, start, test, watch

### Community 53 - "CambiarPasswordModal"
Cohesion: 0.33
Nodes (3): CambiarPasswordModal, Component, Output

### Community 55 - "selector-establecimiento.ts"
Cohesion: 0.67
Nodes (3): normalizar(), ordenarPorCoincidencia(), puntajeCoincidencia()

### Community 56 - "sidebar.ts"
Cohesion: 0.40
Nodes (3): NavItem, Sidebar, Component

### Community 57 - "RolesEnum"
Cohesion: 0.40
Nodes (4): RolesEnum, ADMIN, DIRECTOR, ENCARGADO

### Community 59 - "Favicon MiConvivencia (silueta familia/comunidad escolar)"
Cohesion: 0.50
Nodes (4): Favicon MiConvivencia (silueta familia/comunidad escolar), Identidad visual: convivencia escolar en celeste, Icono de pestaña del navegador de la app Angular, Pictograma: adulto, niño y niña sobre fondo blanco

### Community 60 - "MiConvivencia App Logo"
Cohesion: 0.67
Nodes (4): MiConvivencia App Logo, Family Pictogram (two adults, one child), Light Blue Flat Brand Color, School Community / Coexistence Brand Identity

## Ambiguous Edges - Review These
- `Identidad visual: convivencia escolar en celeste` → `Pictograma: adulto, niño y niña sobre fondo blanco`  [AMBIGUOUS]
  public/favicon.png · relation: conceptually_related_to
- `Family Pictogram (two adults, one child)` → `MiConvivencia App Logo`  [AMBIGUOUS]
  public/logo.png · relation: conceptually_related_to
- `Listado de registros de convivencia` → `Campana de notificaciones`  [AMBIGUOUS]
  src/app/shared/components/campana-notificaciones/campana-notificaciones.html · relation: shares_data_with

## Knowledge Gaps
- **107 isolated node(s):** `DatosCredencialesPdf`, `Paso`, `EstablecimientoParaDominio`, `CampoEdit`, `PrevioEdit` (+102 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 314 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Identidad visual: convivencia escolar en celeste` and `Pictograma: adulto, niño y niña sobre fondo blanco`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Family Pictogram (two adults, one child)` and `MiConvivencia App Logo`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Listado de registros de convivencia` and `Campana de notificaciones`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **Why does `ApiService` connect `ApiService` to `.confirmarAccion`, `ProtocoloFlujo`, `Usuarios`, `MedidasDisciplinarias`, `Geo`, `ImportacionService`, `protocolo-caso.ts`, `RegistroForm`, `app.routes.ts`, `DocumentosInstitucionales`, `InformeExpulsion`, `ProtocoloCaso`, `SubirDocumento`, `.cargar`, `Roles`, `Estudiantes`, `MedidasProteccion`, `protocolo-flujo.ts`, `.recargarEstablecimientos`, `TiposFalta`, `estudiantes.ts`, `geo.ts`, `.cargar`, `ConfirmService`, `CampanaNotificaciones`, `Feriados`, `Registros`, `AuthService`, `.aprobar`, `.cargar`, `CerrarConEsc`, `SelectorEstablecimiento`, `.ejecutar`, `dashboard.ts`, `CambiarPasswordModal`, `selector-establecimiento.ts`, `.guardar`, `.agregarNota`, `.guardarPais`, `.guardarProvincia`?**
  _High betweenness centrality (0.362) - this node is a cross-community bridge._
- **Why does `ProtocoloFlujo` connect `ProtocoloFlujo` to `protocolo-flujo.ts`, `Usuarios`, `AuthService`, `ApiService`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `AuthService` connect `AuthService` to `.confirmarAccion`, `Usuarios`, `ImportacionService`, `protocolo-caso.ts`, `RegistroForm`, `app.routes.ts`, `Roles`, `Estudiantes`, `protocolo-flujo.ts`, `.recargarEstablecimientos`, `estudiantes.ts`, `geo.ts`, `ConfirmService`, `app.config.ts`, `SelectorEstablecimiento`, `dashboard.ts`, `login.ts`, `navbar.ts`, `selector-establecimiento.ts`, `sidebar.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `DatosCredencialesPdf`, `Paso`, `EstablecimientoParaDominio` to the rest of the system?**
  _107 weakly-connected nodes found - possible documentation gaps or missing edges._