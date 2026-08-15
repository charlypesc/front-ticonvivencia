# TiConvivencia — Convenciones del proyecto

## Patrón CRUD de mantenedores (feature simple)

Todo mantenedor nuevo (ej: Establecimientos, Cursos) debe replicar exactamente la
estructura ya usada en `features/tipos-falta`, `features/protocolos-genericos` y
`features/protocolos-establecimiento`. No introducir variantes de estilo, naming
ni estructura de archivos.

### Estructura de archivos
Un mantenedor simple (sin sub-formulario en componente aparte) vive en un solo
feature standalone:
```
features/<nombre-plural>/
  <nombre-plural>.ts
  <nombre-plural>.html
  <nombre-plural>.scss
  <nombre-plural>.spec.ts
```

### Componente (`.ts`)
- `standalone: true`, `imports: [CommonModule, FormsModule]`.
- Signals para estado: `items = signal<any[]>([])`, `loading = signal(true)`,
  `mostrarForm = signal(false)`, `editando = signal<any | null>(null)`,
  `error = signal('')`, `success = signal('')`.
- `form = { ... }` como objeto plano (no reactive forms) para el `[(ngModel)]`.
- Constructor con inyección por parámetro (no `inject()`):
  ```ts
  constructor(
    private api: ApiService,
    private confirmService: ConfirmService,
  ) {}
  ```
- `cargar()` hace el GET y setea `loading`.
- `abrirForm(item?)` limpia `error`/`success`, precarga `form` si es edición,
  abre el modal.
- `cerrarForm()` solo cierra `mostrarForm`.
- `guardar()` valida campos requeridos con `error.set(...)`, arma un
  `request = editando() ? api.updateX(...) : api.createX(...)` y lo suscribe.
- `eliminar(item)` es **async**, primero pide confirmación con
  `await this.confirmService.confirmarAccion('¿Eliminar "X"?')` y corta si
  no confirma — **nunca usar `confirm()`/`alert()` nativos**. Ver
  `core/services/confirm.service.ts` y `shared/components/confirm-modal`.

### Template (`.html`)
- Reutiliza las clases globales de `styles.scss`: `.page-header`, `.alert`,
  `.empty-state`, `.acciones`, `.btn`, `.btn-icon`, `.form-row`.
- El modal de alta/edición reutiliza `.modal-backdrop` / `.modal` /
  `.modal__header` / `.modal__body` / `.modal__footer` (definidos en
  `styles.scss`, no duplicar en el scss del feature). Ver
  `features/tipos-falta/tipos-falta.html` como referencia mínima.
- Iconos: Tabler Icons (`<i class="ti ti-...">`).

### Registro en el resto de la app
Al agregar un mantenedor nuevo hay que tocar 3 lugares además del feature:
1. `core/services/api.services.ts` — agregar los 4 métodos CRUD
   (`getX`, `createX`, `updateX`, `deleteX`) agrupados con un comentario
   `// Nombre del módulo`, mismo estilo que el resto del archivo.
2. `app.routes.ts` — nueva ruta hija dentro del layout, con
   `canActivate: [roleGuard(RolesEnum.ENCARGADO)]` (los mantenedores son
   exclusivos del Encargado, salvo que se indique lo contrario).
3. `shared/components/sidebar/sidebar.ts` — nuevo `NavItem` en `allItems`
   con `label`, `icon` (Tabler), `route` y `roles`.

### Modal de confirmación
Nunca usar `window.confirm` / `window.alert`. Usar siempre
`ConfirmService.confirmarAccion(mensaje): Promise<boolean>` +
`<app-confirm-modal />` (ya montado globalmente en `shared/components/layout`).

### Variante: registro único (no lista)
Cuando el recurso no es una lista scopeada sino un dato 1:1 con el tenant
(ej: `Establecimiento`, ligado a `id_establecimiento` del JWT y sin alta/baja
posible desde la UI), no se usa el patrón de lista + modal:
- Sin `mostrarForm`/`editando`/modal. El formulario va directo en el `card`
  de la página (ver `features/establecimiento`).
- `cargar()` hace el GET y precarga `form` directo (no hay array).
- Un solo botón "Guardar cambios" que llama `api.updateX(form)`.
- Backend: controller con `getMine`/`updateMine` sobre
  `req.user.id_establecimiento`, sin `create`/`remove`. Ruta protegida con
  `requireRole('DIRECTOR')` en el PUT (rol dueño de la configuración del
  establecimiento), GET abierto a ambos roles.
- Ejemplo backend: `backticonvivencia/src/controllers/establecimiento.controller.js`
  + `routes/establecimiento.routes.js`, montado en `/api/establecimiento`.

**Importante — `features/establecimiento` está construido pero NO conectado
a propósito.** El componente y los métodos de `api.services.ts` existen y
funcionan, pero no hay entrada en `app.routes.ts` ni en
`shared/components/sidebar/sidebar.ts`: el Director no debe poder editar el
establecimiento desde la app todavía. Esto se conectará cuando exista un
panel/rol admin separado. No lo agregues al sidebar/rutas sin que te lo pidan
explícitamente.

### Backend: patrón CRUD scopeado por establecimiento
Para mantenedores de lista (ej: `cursos`), el controller replica
`tiposFalta.controller.js`: `getAll` filtra por
`WHERE id_establecimiento = ?` usando `req.user.id_establecimiento` (nunca
un id que venga del body/params), `create`/`update`/`remove` siempre incluyen
ese mismo filtro en el `WHERE`. El `remove` atrapa
`err.code === 'ER_ROW_IS_REFERENCED_2'` y devuelve 409 con mensaje
explicando qué reasignar antes de poder eliminar. Rutas: GET abierto a
ambos roles, POST/PUT/DELETE con `requireRole('ENCARGADO')`. No dupliques
un mismo `SELECT` en dos controllers distintos (ej: cursos vive solo en
`cursos.controller.js`, no también en `estudiantes.controller.js`) — si otro
feature necesita la misma lista, que consuma el mismo endpoint.

### Import masivo desde Excel (ej: Cursos)
Cuando un mantenedor necesita poblarse desde un Excel estándar (ej. el export
de nómina de estudiantes "Ed. básica"/"Ed. media", con columnas fijas `Desc
Grado`, `Letra Curso`, `Run`, `Dígito Ver.`, `Genero`, `Nombres`, `Apellido
Paterno`, `Apellido Materno`), seguir el patrón de
`cursos.controller.js` (`importarExcel`) + `cursos.routes.js`:
- **Backend**: parseo con la librería `xlsx` (SheetJS) sobre
  `req.file.buffer` (multer en memoria, igual patrón que
  `documents.routes.js`, pero con `fileFilter` restringido a mimetypes de
  Excel). Todo el import corre dentro de una sola transacción
  (`beginTransaction`/`commit`/`rollback`, mismo patrón que
  `establecimiento.controller.js` → `create`): primero se cargan a memoria
  los cursos y RUNs ya existentes del establecimiento, luego se recorre cada
  fila creando el curso si falta (dedupe por `nombre`) y el estudiante si su
  RUN no existía aún (dedupe por `run`, nunca se actualiza uno existente).
  Responde un resumen `{ cursos_creados, estudiantes_creados,
  estudiantes_omitidos, filas_invalidas }` — nunca solo "OK", el usuario
  necesita ver cuánto se creó de verdad.
- **Frontend**: sin modal — un `<label class="btn btn--outline btn--sm">`
  envolviendo un `<input type="file" hidden>` (mismo patrón de input
  oculto que `features/subir-documento`), dispara `onSeleccionarExcel()`.
  Antes de subir, **siempre** pedir confirmación con
  `ConfirmService.confirmarAccion(...)` explicando qué va a crear — es una
  escritura masiva, no un click reversible como abrir un modal.
- **Antes de conectar algo así a producción**: si hay dudas de que el
  parseo/mapeo de columnas sea correcto, simular el import en un script
  aparte (transacción con `ROLLBACK` en vez de `COMMIT`) contra la BD real
  para contar cuántas filas craft/omitiría, sin persistir nada, y solo
  conectar el botón del frontend una vez validado el conteo esperado.
- **Progreso en vivo (job + polling)**: si el import es de cientos de filas
  (cada una hace 1-2 INSERT contra la BD remota, ~1-3 min en total), el
  endpoint de import **no** debe hacer esperar al cliente hasta el final.
  Patrón usado en `cursos.controller.js`:
  - `POST /cursos/importar` parsea el archivo, crea un `job` (objeto en un
    `Map` en memoria del proceso — no hace falta Redis/BD para esto, el job
    vive minutos) con `{ job_id, id_establecimiento, total, procesadas,
    cursos_creados, estudiantes_creados, estudiantes_omitidos,
    filas_invalidas, estado: 'procesando' }`, dispara el procesamiento real
    **sin** `await` (`procesarImportacion(job, filas, id_establecimiento)`
    corre en background) y responde de inmediato `202 { job_id, total }`.
  - La función de background incrementa `job.procesadas`/contadores fila a
    fila y al final marca `job.estado = 'completado'` (o `'error'`).
  - `GET /cursos/importar/:jobId/progreso` devuelve el estado actual del
    job, validando que pertenezca al `id_establecimiento` del usuario
    (404 si no).
  - El job se borra del `Map` recién ~5 minutos después de terminar
    (`setTimeout`), para darle tiempo al frontend a leer el resultado final.
  - **Frontend**: al recibir `{ job_id, total }`, arrancar un
    `setInterval` (¬800ms) que llama a `getProgresoImportacion(jobId)` y
    actualiza una barra de progreso (`procesadas/total`); al ver
    `estado === 'completado'` o `'error'` se hace `clearInterval` y recién
    ahí se muestra el mensaje final y se refresca la lista. No usar
    websockets/SSE para esto — polling simple alcanza y no agrega
    dependencias nuevas al proyecto.

### Formato de nombre de curso para mostrar al usuario
`CURSO.nombre` es un identificador crudo sin espacios (ej. `7BasicoA`,
generado por `normalizarGrado()` en `cursos.controller.js` y en el import de
Excel: `${número}${Basico|Medio}${letra}`). Nunca mostrar ese valor crudo en
pantallas orientadas al usuario final — usar el pipe
`shared/pipes/curso-nombre.pipe.ts` (`{{ curso_nombre | cursoNombre }}`),
que lo convierte a `"7 Basico A"`. Ya aplicado en la tabla de
`features/estudiantes` (columna Curso), en la columna "Nombre" del listado
de `features/cursos`, y en el `<select>` de curso de los modales de
alta/edición de estudiante (`features/estudiantes` y
`features/consultar-rut`) — ahí el `[ngValue]` sigue siendo el
`id_curso` (no cambia qué se guarda), solo el texto mostrado en cada
`<option>` usa el pipe. La única excepción sigue siendo el input de
nombre en el modal de alta/edición de **curso** en `features/cursos`
(`form.nombre`), que muestra y edita el valor crudo porque ahí se está
editando el identificador mismo, no seleccionando uno de una lista. Si
aparece en una pantalla nueva, aplicar el mismo pipe ahí también en vez de
reinventar el formateo.
