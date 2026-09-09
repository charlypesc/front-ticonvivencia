# Graph Report - front-ticonvivencia  (2026-09-02)

## Corpus Check
- 129 files · ~85,080 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1192 nodes · 2417 edges · 60 communities (28 shown, 19 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 292 edges (avg confidence: 0.81)
- Token cost: 353,722 input · 0 output

## Community Hubs (Navigation)
- Convenciones y Rationale del Proyecto
- Editor de Flujo de Protocolo
- Tipos de Falta y Protocolo Sugerido
- Usuarios y Ficha de Establecimiento
- Configuración Angular CLI
- Catálogo de Protocolos y Permisos
- Importación Masiva con Progreso
- ApiService: Cliente HTTP Central
- Geo: Establecimientos y Sostenedores
- Alta de Registro y Multi-tenant
- Modal de Credenciales PDF
- Documentos Institucionales y Constancias
- Grafo Visual del Protocolo
- Informe de Expulsión
- Login y Autenticación
- Caso de Protocolo: Expediente
- Subir Documento Firmado
- Toolchain de Build y Testing
- Dependencias Angular Runtime
- Buscador Reutilizable
- Roles y Catálogo de Permisos
- Estudiantes: Ficha y Búsqueda
- Medidas de Protección
- Mantenedor de Cursos
- Campana de Notificaciones
- Medidas Disciplinarias
- Generación PDF del Expediente
- Feriados y Días Hábiles
- Dashboard y Confidencialidad
- Bootstrap App e Interceptores
- Protocolos Activados
- Utilidades de Fecha dd/MM/yyyy
- Listado de Registros
- Servicio de Contenido Confidencial
- Acta de Notificación
- Gestiones y Etiquetas de Códigos
- Metadatos de package.json
- Paneles de Medidas Compartidos
- Scripts npm
- Directiva Auto-ajustar Textarea
- Enum de Roles
- Favicon: Identidad Visual
- Logo: Identidad de Marca
- Angular Platform Browser
- TypeScript
- Environment de Producción
- CRUD Scopeado por Establecimiento

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 228 edges
2. `ProtocoloCaso` - 62 edges
3. `Geo` - 61 edges
4. `ProtocoloFlujo` - 58 edges
5. `AuthService` - 49 edges
6. `ConfirmService` - 41 edges
7. `RegistroForm` - 31 edges
8. `GrafoProtocolo` - 29 edges
9. `Estudiantes` - 27 edges
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

## Communities (60 total, 19 thin omitted)

### Community 0 - "Convenciones y Rationale del Proyecto"
Cohesion: 0.05
Nodes (72): Directiva appPuede (permisos en la UI), Formato de nombre de curso (cursoNombre), Nunca mostrar códigos crudos de la base, Formato de fecha dd/MM/yyyy, Import masivo desde Excel, Job en memoria + polling de progreso, PDFs con jsPDF: sólo Latin-1, Modal de confirmación propio (ConfirmService) (+64 more)

### Community 1 - "Editor de Flujo de Protocolo"
Cohesion: 0.05
Nodes (6): ProtocoloFlujo, Component, AccionNodo, AristaDibujada, NodoGrafo, NodoUbicado

### Community 2 - "Tipos de Falta y Protocolo Sugerido"
Cohesion: 0.05
Nodes (6): RegistroForm, Component, Input, Output, TiposFalta, Component

### Community 3 - "Usuarios y Ficha de Establecimiento"
Cohesion: 0.06
Nodes (15): Establecimiento, Component, Component, Usuarios, dominioDe(), dominioDeCuentas(), dominioDesdeCorreo(), dominioDesdeNombre() (+7 more)

### Community 4 - "Configuración Angular CLI"
Cohesion: 0.05
Nodes (46): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+38 more)

### Community 5 - "Catálogo de Protocolos y Permisos"
Cohesion: 0.07
Nodes (4): ProtocolosEstablecimiento, Component, ProtocolosGenericos, Component

### Community 6 - "Importación Masiva con Progreso"
Cohesion: 0.06
Nodes (17): ImportacionActiva, ImportacionService, TipoImportacion, Injectable, CambiarPasswordModal, Component, Output, ConfirmModal (+9 more)

### Community 8 - "Geo: Establecimientos y Sostenedores"
Cohesion: 0.06
Nodes (3): Geo, Component, completarDominio()

### Community 9 - "Alta de Registro y Multi-tenant"
Cohesion: 0.07
Nodes (33): ON DELETE RESTRICT: no se borra un estudiante con incidentes, Doble validación frontend + backend, Flujo completo: crear un estudiante nuevo, Middlewares verifyToken + requireRole, Multi-tenant por id_establecimiento del token, Relación N:M ESTUDIANTE ↔ REGISTRO_CONVIVENCIA vía REGISTRO_ESTUDIANTE, Tabla ESTUDIANTE (PK id_estudiante, FK id_curso e id_establecimiento), Activación de protocolo desde el registro (+25 more)

### Community 10 - "Modal de Credenciales PDF"
Cohesion: 0.09
Nodes (24): CredencialesModal, Component, Input, Output, LOGO_CREDENCIALES_PNG, acortar(), AZUL, AZUL_MARCA (+16 more)

### Community 14 - "Login y Autenticación"
Cohesion: 0.09
Nodes (10): Autenticación y permisos (JWT + guards), MiConvivencia Frontend, Login, Component, Interruptor de acceso del establecimiento, Dominio de correo sugerido al crear usuario, NoAutorizado, Component (+2 more)

### Community 16 - "Subir Documento Firmado"
Cohesion: 0.12
Nodes (5): SubirDocumento, Component, cambiarExtension(), comprimirImagen(), esImagen()

### Community 17 - "Toolchain de Build y Testing"
Cohesion: 0.10
Nodes (21): @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core, karma, karma-chrome-launcher, karma-coverage, karma-jasmine (+13 more)

### Community 18 - "Dependencias Angular Runtime"
Cohesion: 0.10
Nodes (21): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/router, jspdf, dependencies, @angular/common (+13 more)

### Community 19 - "Buscador Reutilizable"
Cohesion: 0.15
Nodes (6): ContentChild, Buscador, Component, Input, Output, ViewChild

### Community 20 - "Roles y Catálogo de Permisos"
Cohesion: 0.13
Nodes (3): Permiso, Roles, Component

### Community 22 - "Estudiantes: Ficha y Búsqueda"
Cohesion: 0.16
Nodes (3): Estudiantes, Component, ViewChild

### Community 23 - "Medidas de Protección"
Cohesion: 0.15
Nodes (3): MedidasProteccion, Component, Input

### Community 28 - "Medidas Disciplinarias"
Cohesion: 0.18
Nodes (3): MedidasDisciplinarias, Component, Input

### Community 32 - "Bootstrap App e Interceptores"
Cohesion: 0.22
Nodes (7): App, appConfig, routes, Component, establecimientoInterceptor(), jwtInterceptor(), index.html (shell MiConvivencia)

### Community 36 - "Utilidades de Fecha dd/MM/yyyy"
Cohesion: 0.18
Nodes (4): ahoraIso(), dos(), hoyIso(), Partes

### Community 42 - "Metadatos de package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 44 - "Paneles de Medidas Compartidos"
Cohesion: 0.33
Nodes (7): Pronunciamiento escrito del Consejo de Profesores, Panel de medidas disciplinarias, Doble plazo legal: 10 días para resolver, 5 para reconsiderar, Suspensión cautelar (art. 6 letra d), Corrección de carga permitida solo sin seguimientos, Deberes del art. 16 E letra j sobre estudiante suspendido, Panel de medidas de protección

### Community 45 - "Scripts npm"
Cohesion: 0.33
Nodes (6): scripts, build, ng, start, test, watch

### Community 47 - "Directiva Auto-ajustar Textarea"
Cohesion: 0.40
Nodes (3): AutoAjustarTextarea, Directive, HostListener

### Community 48 - "Enum de Roles"
Cohesion: 0.40
Nodes (4): RolesEnum, ADMIN, DIRECTOR, ENCARGADO

### Community 50 - "Favicon: Identidad Visual"
Cohesion: 0.50
Nodes (4): Favicon MiConvivencia (silueta familia/comunidad escolar), Identidad visual: convivencia escolar en celeste, Icono de pestaña del navegador de la app Angular, Pictograma: adulto, niño y niña sobre fondo blanco

### Community 51 - "Logo: Identidad de Marca"
Cohesion: 0.67
Nodes (4): MiConvivencia App Logo, Family Pictogram (two adults, one child), Light Blue Flat Brand Color, School Community / Coexistence Brand Identity

## Ambiguous Edges - Review These
- `Listado de registros de convivencia` → `Campana de notificaciones`  [AMBIGUOUS]
  src/app/shared/components/campana-notificaciones/campana-notificaciones.html · relation: shares_data_with
- `Identidad visual: convivencia escolar en celeste` → `Pictograma: adulto, niño y niña sobre fondo blanco`  [AMBIGUOUS]
  public/favicon.png · relation: conceptually_related_to
- `MiConvivencia App Logo` → `Family Pictogram (two adults, one child)`  [AMBIGUOUS]
  public/logo.png · relation: conceptually_related_to

## Knowledge Gaps
- **107 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `style` (+102 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 305 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Listado de registros de convivencia` and `Campana de notificaciones`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Identidad visual: convivencia escolar en celeste` and `Pictograma: adulto, niño y niña sobre fondo blanco`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `MiConvivencia App Logo` and `Family Pictogram (two adults, one child)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ApiService` connect `ApiService: Cliente HTTP Central` to `Convenciones y Rationale del Proyecto`, `Editor de Flujo de Protocolo`, `Tipos de Falta y Protocolo Sugerido`, `Usuarios y Ficha de Establecimiento`, `Catálogo de Protocolos y Permisos`, `Importación Masiva con Progreso`, `Geo: Establecimientos y Sostenedores`, `Documentos Institucionales y Constancias`, `Informe de Expulsión`, `Login y Autenticación`, `Caso de Protocolo: Expediente`, `Subir Documento Firmado`, `Roles y Catálogo de Permisos`, `Alta de Establecimientos Geo`, `Estudiantes: Ficha y Búsqueda`, `Medidas de Protección`, `Geo: Comunas, Países e Import`, `Mantenedor de Cursos`, `Campana de Notificaciones`, `Involucrados y Reasignación de Pasos`, `Medidas Disciplinarias`, `Feriados y Días Hábiles`, `Dashboard y Confidencialidad`, `Protocolos Activados`, `Ejecución y Aprobación de Pasos`, `Suspensión Cautelar y Reconsideración`, `Listado de Registros`, `Servicio de Contenido Confidencial`, `Acta de Notificación`, `CRUD de Estudiantes`, `Gestiones y Etiquetas de Códigos`, `Cierre, Anulación y Omisión de Pasos`, `Plazos de Medidas en el Caso`, `Guardado de Registro y Protocolo`, `Bitácora Privada del Protocolo`, `Mantenedor de Comunas`, `Mantenedor de Países`, `Mantenedor de Regiones`?**
  _High betweenness centrality (0.374) - this node is a cross-community bridge._
- **Why does `Geo` connect `Geo: Establecimientos y Sostenedores` to `Convenciones y Rationale del Proyecto`, `Usuarios y Ficha de Establecimiento`, `Login y Autenticación`, `Alta de Establecimientos Geo`, `Mantenedor de Comunas`, `Mantenedor de Países`, `Geo: Comunas, Países e Import`, `Mantenedor de Regiones`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `AuthService` connect `Convenciones y Rationale del Proyecto` to `Bootstrap App e Interceptores`, `Tipos de Falta y Protocolo Sugerido`, `Usuarios y Ficha de Establecimiento`, `Catálogo de Protocolos y Permisos`, `Importación Masiva con Progreso`, `Servicio de Contenido Confidencial`, `Acta de Notificación`, `Login y Autenticación`, `Roles y Catálogo de Permisos`, `Alta de Establecimientos Geo`, `Mantenedor de Cursos`, `Dashboard y Confidencialidad`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `newProjectRoot` to the rest of the system?**
  _107 weakly-connected nodes found - possible documentation gaps or missing edges._