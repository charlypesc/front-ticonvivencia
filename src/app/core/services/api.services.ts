import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Credenciales } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Registros
  getRegistros() {
    return this.http.get<any[]>(`${this.base}/registros`);
  }
  getRegistro(id: number) {
    return this.http.get<any>(`${this.base}/registros/${id}`);
  }
  createRegistro(data: any) {
    return this.http.post(`${this.base}/registros`, data);
  }
  updateRegistro(data: any) {
    return this.http.put(`${this.base}/registros/${data.id_registro}`, data);
  }
  deleteRegistro(id: number) {
    return this.http.delete(`${this.base}/registros/${id}`);
  }
  // Estudiantes
  getEstudiantes() {
    return this.http.get<any[]>(`${this.base}/estudiantes`);
  }
  createEstudiante(data: any) {
    return this.http.post(`${this.base}/estudiantes`, data);
  }
  updateEstudiante(id: number, data: any) {
    return this.http.put(`${this.base}/estudiantes/${id}`, data);
  }
  toggleEstudiante(id: number) {
    return this.http.patch(`${this.base}/estudiantes/${id}/toggle`, {});
  }
  deleteEstudiante(id: number) {
    return this.http.delete(`${this.base}/estudiantes/${id}`);
  }
  // Cursos
  getCursos() {
    return this.http.get<any[]>(`${this.base}/cursos`);
  }
  createCurso(data: any) {
    return this.http.post(`${this.base}/cursos`, data);
  }
  updateCurso(id: number, data: any) {
    return this.http.put(`${this.base}/cursos/${id}`, data);
  }
  deleteCurso(id: number) {
    return this.http.delete(`${this.base}/cursos/${id}`);
  }
  importarCursosExcel(archivo: FormData) {
    return this.http.post<{ job_id: string; total: number }>(`${this.base}/cursos/importar`, archivo);
  }
  /** Qué se llevaría por delante el borrado masivo, para avisarlo con números reales. */
  getResumenEliminacionCursos() {
    return this.http.get<{
      cursos: number;
      estudiantes: number;
      estudiantes_con_registros: number;
    }>(`${this.base}/cursos/resumen-eliminacion`);
  }
  /** Deshace una importación: borra todos los cursos y estudiantes del establecimiento. */
  eliminarTodosLosCursos() {
    return this.http.delete<any>(`${this.base}/cursos`);
  }
  getProgresoImportacion(jobId: string) {
    return this.http.get<any>(`${this.base}/cursos/importar/${jobId}/progreso`);
  }
  // Establecimiento (registro único del tenant) — todavía no conectado a
  // sidebar/rutas: queda listo para engancharlo desde el futuro panel admin.
  getEstablecimiento() {
    return this.http.get<any>(`${this.base}/establecimiento`);
  }
  updateEstablecimiento(data: any) {
    return this.http.put(`${this.base}/establecimiento`, data);
  }
  /**
   * Tenants: solo los colegios que usan el sistema (es_tenant = TRUE), no las
   * 7.847 filas del directorio nacional — para eso está getEstablecimientosGeo.
   */
  getEstablecimientos() {
    return this.http.get<any[]>(`${this.base}/establecimientos`);
  }
  getEstablecimientoPorId(id: number) {
    return this.http.get<any>(`${this.base}/establecimientos/${id}`);
  }
  /** Da de alta un tenant: marca como cliente un colegio ya existente del directorio. */
  altaEstablecimiento(data: { id_establecimiento: number; correo: string; password: string }) {
    return this.http.post(`${this.base}/establecimientos`, data);
  }
  // Usuarios
  getUsuarios() {
    return this.http.get<any[]>(`${this.base}/usuarios`);
  }
  /**
   * La contraseña la genera el backend y vuelve en la respuesta, en claro y una
   * sola vez: no hay endpoint que la relea. Quien llame a esto tiene que hacer
   * algo con `password` en el mismo momento (mostrarla, imprimirla), o queda
   * perdida y hay que restablecerla.
   */
  createUsuario(data: { correo: string; nombre: string; roles: string[] }) {
    return this.http.post<Credenciales>(`${this.base}/usuarios`, data);
  }

  /**
   * Crea un usuario en un establecimiento puntual, distinto del que el ADMIN
   * tiene activo en el selector (se usa desde Geo).
   *
   * El id va como query param a propósito, no en el body: el backend le da
   * prioridad al query, y el interceptor de establecimiento respeta el
   * parámetro cuando ya viene puesto. Mandándolo en el body, el interceptor
   * agregaría el establecimiento activo y el usuario terminaría creado en el
   * colegio equivocado sin ningún error.
   */
  createUsuarioEn(idEstablecimiento: number, data: { correo: string; nombre: string; roles: string[] }) {
    return this.http.post<Credenciales>(`${this.base}/usuarios`, data, {
      params: { id_establecimiento: String(idEstablecimiento) },
    });
  }

  /**
   * Usuarios de un establecimiento puntual (se usa desde Geo, para saber qué
   * dominio de correo usan las cuentas que ese colegio ya tiene). Mismo motivo
   * que `createUsuarioEn` para mandar el id por query y no por body.
   */
  getUsuariosDe(idEstablecimiento: number) {
    return this.http.get<any[]>(`${this.base}/usuarios`, {
      params: { id_establecimiento: String(idEstablecimiento) },
    });
  }
  /** Corrige nombre, correo y roles. La contraseña va por su propio endpoint. */
  updateUsuario(id: number, data: { correo: string; nombre: string; roles?: string[] }) {
    return this.http.put(`${this.base}/usuarios/${id}`, data);
  }
  toggleUsuario(id: number) {
    return this.http.patch(`${this.base}/usuarios/${id}/toggle`, {});
  }

  /**
   * Emite una contraseña nueva para otro usuario y la devuelve en claro. Es el
   * camino para cuando alguien perdió la suya: la anterior queda invalidada en
   * el acto, así que no se llama "por si acaso".
   */
  resetPasswordUsuario(id: number) {
    return this.http.patch<Credenciales>(`${this.base}/usuarios/${id}/password`, {});
  }

  /** Cambia la contraseña del usuario de la sesión. Exige la actual. */
  cambiarPassword(actual: string, nueva: string) {
    return this.http.patch<{ message: string }>(`${this.base}/auth/password`, { actual, nueva });
  }
  getRolesDeUsuario(id: number) {
    return this.http.get<any[]>(`${this.base}/usuarios/${id}/roles`);
  }
  asignarRol(id: number, codigo: string) {
    return this.http.post(`${this.base}/usuarios/${id}/roles`, { codigo });
  }
  quitarRol(id: number, rolId: number) {
    return this.http.delete(`${this.base}/usuarios/${id}/roles/${rolId}`);
  }

  // Permisos por persona
  //
  // Los roles útiles (Inspectoría, Psicólogo, Orientador…) son globales: los
  // comparten todos los colegios y solo un ADMIN puede cambiarlos. Esto es la
  // capa fina de excepciones por persona encima del rol:
  //   permisos efectivos = los del rol + concedidos - denegados

  /**
   * Las tres capas por separado —lo que trae el rol, las excepciones y el
   * resultado— y no una lista plana: la pantalla tiene que poder distinguir
   * "esto lo trae Inspectoría" de "esto se lo agregamos a mano".
   */
  getPermisosDeUsuario(id: number) {
    return this.http.get<{
      heredados: { permiso_id: number; roles: string[] }[];
      overrides: {
        permiso_id: number;
        efecto: 'conceder' | 'denegar';
        motivo: string | null;
        asignado_at: string;
        expira_at: string | null;
        asignado_por_nombre: string | null;
      }[];
      efectivos: number[];
    }>(`${this.base}/usuarios/${id}/permisos`);
  }

  /**
   * Convierte los permisos ajustados de una persona en un ROL del
   * establecimiento, para que otros funcionarios lo hereden en vez de repetirle
   * las excepciones a cada uno. El backend crea el rol, se lo asigna
   * REEMPLAZANDO los que tenía y le borra los overrides, todo en una
   * transacción.
   */
  guardarPermisosComoRol(
    id: number,
    data: { nombre: string; descripcion?: string; permisos: number[] },
  ) {
    return this.http.post<{
      rol_id: number;
      codigo: string;
      message: string;
      advertencia?: string;
    }>(`${this.base}/usuarios/${id}/permisos/rol`, data);
  }

  /** Reemplaza TODAS las excepciones de la persona (no es un parche incremental). */
  setPermisosDeUsuario(
    id: number,
    data: { conceder: number[]; denegar: number[]; motivo?: string },
  ) {
    return this.http.put<{ message: string; advertencia?: string }>(
      `${this.base}/usuarios/${id}/permisos`,
      data,
    );
  }

  // Roles y permisos
  getRoles() {
    return this.http.get<any[]>(`${this.base}/roles`);
  }
  getCatalogoPermisos() {
    return this.http.get<any[]>(`${this.base}/roles/permisos`);
  }
  getPermisosDeRol(rolId: number) {
    return this.http.get<any[]>(`${this.base}/roles/${rolId}/permisos`);
  }
  createRol(data: any) {
    return this.http.post(`${this.base}/roles`, data);
  }
  updateRol(rolId: number, data: any) {
    return this.http.put(`${this.base}/roles/${rolId}`, data);
  }
  setPermisosDeRol(rolId: number, permisos: number[]) {
    return this.http.put(`${this.base}/roles/${rolId}/permisos`, { permisos });
  }

  //Faltas

  getTiposFalta() {
    return this.http.get<any[]>(`${this.base}/tipos-falta`);
  }
  createTipoFalta(data: any) {
    return this.http.post(`${this.base}/tipos-falta`, data);
  }
  updateTipoFalta(id: number, data: any) {
    return this.http.put(`${this.base}/tipos-falta/${id}`, data);
  }
  deleteTipoFalta(id: number) {
    return this.http.delete(`${this.base}/tipos-falta/${id}`);
  }
  //subir documento
  subirDocumento(archivo: FormData) {
    return this.http.post(`${this.base}/documents`, archivo);
  }

  confirmarRegistro(id: number, data: any) {
    return this.http.patch(`${this.base}/registros/${id}/confirmar`, data);
  }
  //consulta rut
  consultarRut(rut: string) {
    return this.http.get(`${this.base}/estudiantes/rut/${encodeURIComponent(rut)}`);
  }

  //dashboard

  getDashboard() {
    return this.http.get<any>(`${this.base}/dashboard`);
  }

  // Protocolos genéricos (catálogo)
  getProtocolosGenericos() {
    return this.http.get<any[]>(`${this.base}/protocolos-genericos`);
  }
  createProtocoloGenerico(data: any) {
    return this.http.post(`${this.base}/protocolos-genericos`, data);
  }
  updateProtocoloGenerico(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-genericos/${id}`, data);
  }
  deleteProtocoloGenerico(id: number) {
    return this.http.delete(`${this.base}/protocolos-genericos/${id}`);
  }

  // Protocolos del establecimiento
  getProtocolosEstablecimiento() {
    return this.http.get<any[]>(`${this.base}/protocolos-establecimiento`);
  }
  createProtocoloEstablecimiento(data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento`, data);
  }
  /** Protocolo propio del colegio, sin origen en el catálogo genérico. */
  createProtocoloPropio(data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento/propio`, data);
  }
  updateProtocoloEstablecimiento(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${id}`, data);
  }
  deleteProtocoloEstablecimiento(id: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${id}`);
  }

  // Geo (País/Región/Provincia/Comuna) — catálogo global, sin id_establecimiento
  getPaises() {
    return this.http.get<any[]>(`${this.base}/geo/paises`);
  }
  createPais(data: any) {
    return this.http.post(`${this.base}/geo/paises`, data);
  }
  updatePais(id: number, data: any) {
    return this.http.put(`${this.base}/geo/paises/${id}`, data);
  }
  deletePais(id: number) {
    return this.http.delete(`${this.base}/geo/paises/${id}`);
  }
  getRegiones() {
    return this.http.get<any[]>(`${this.base}/geo/regiones`);
  }
  createRegion(data: any) {
    return this.http.post(`${this.base}/geo/regiones`, data);
  }
  updateRegion(id: number, data: any) {
    return this.http.put(`${this.base}/geo/regiones/${id}`, data);
  }
  deleteRegion(id: number) {
    return this.http.delete(`${this.base}/geo/regiones/${id}`);
  }
  getProvincias() {
    return this.http.get<any[]>(`${this.base}/geo/provincias`);
  }
  createProvincia(data: any) {
    return this.http.post(`${this.base}/geo/provincias`, data);
  }
  updateProvincia(id: number, data: any) {
    return this.http.put(`${this.base}/geo/provincias/${id}`, data);
  }
  deleteProvincia(id: number) {
    return this.http.delete(`${this.base}/geo/provincias/${id}`);
  }
  getComunas() {
    return this.http.get<any[]>(`${this.base}/geo/comunas`);
  }
  createComuna(data: any) {
    return this.http.post(`${this.base}/geo/comunas`, data);
  }
  updateComuna(id: number, data: any) {
    return this.http.put(`${this.base}/geo/comunas/${id}`, data);
  }
  deleteComuna(id: number) {
    return this.http.delete(`${this.base}/geo/comunas/${id}`);
  }
  getEstablecimientosGeo(idComuna: number) {
    return this.http.get<any[]>(`${this.base}/geo/establecimientos?id_comuna=${idComuna}`);
  }
  buscarEstablecimientosGeoPorRbd(rbd: string) {
    return this.http.get<any[]>(`${this.base}/geo/establecimientos?rbd=${encodeURIComponent(rbd)}`);
  }
  createEstablecimientoGeo(data: any) {
    return this.http.post(`${this.base}/geo/establecimientos`, data);
  }
  updateEstablecimientoGeo(id: number, data: any) {
    return this.http.put(`${this.base}/geo/establecimientos/${id}`, data);
  }
  /** Suspende o restablece el acceso de los usuarios del establecimiento. */
  cambiarAccesoEstablecimientoGeo(id: number, acceso_bloqueado: boolean) {
    return this.http.patch<{ acceso_bloqueado: number; message: string }>(
      `${this.base}/geo/establecimientos/${id}/acceso`,
      { acceso_bloqueado },
    );
  }
  deleteEstablecimientoGeo(id: number) {
    return this.http.delete(`${this.base}/geo/establecimientos/${id}`);
  }
  importarEstablecimientosGeoExcel(archivo: FormData) {
    return this.http.post<{ job_id: string; total: number }>(
      `${this.base}/geo/establecimientos/importar`,
      archivo,
    );
  }
  getProgresoImportacionEstablecimientosGeo(jobId: string) {
    return this.http.get<any>(`${this.base}/geo/establecimientos/importar/${jobId}/progreso`);
  }

  // Sostenedores — catálogo global (un sostenedor puede tener varios colegios)
  getSostenedores() {
    return this.http.get<any[]>(`${this.base}/sostenedores`);
  }
  createSostenedor(data: { rut: string; representante_legal: string; direccion?: string; mail?: string }) {
    return this.http.post<{ id_sostenedor: number }>(`${this.base}/sostenedores`, data);
  }
  updateSostenedor(id: number, data: any) {
    return this.http.put(`${this.base}/sostenedores/${id}`, data);
  }
  deleteSostenedor(id: number) {
    return this.http.delete(`${this.base}/sostenedores/${id}`);
  }
  getEstablecimientosDelSostenedor(id: number) {
    return this.http.get<any[]>(`${this.base}/sostenedores/${id}/establecimientos`);
  }
  /** Vincula el colegio al sostenedor (setea ESTABLECIMIENTO.id_sostenedor). */
  asignarEstablecimientoASostenedor(idSostenedor: number, idEstablecimiento: number) {
    return this.http.put(
      `${this.base}/sostenedores/${idSostenedor}/establecimientos/${idEstablecimiento}`,
      {},
    );
  }
  desasignarEstablecimientoDeSostenedor(idSostenedor: number, idEstablecimiento: number) {
    return this.http.delete(
      `${this.base}/sostenedores/${idSostenedor}/establecimientos/${idEstablecimiento}`,
    );
  }

  // Protocolos activados
  getProtocolosActivados() {
    return this.http.get<any[]>(`${this.base}/protocolos-activados`);
  }
  getProtocolosActivadosByRegistro(idRegistro: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/registro/${idRegistro}`);
  }
  createProtocoloActivado(data: any) {
    return this.http.post(`${this.base}/protocolos-activados`, data);
  }
  updateProtocoloActivado(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-activados/${id}`, data);
  }
  deleteProtocoloActivado(id: number) {
    return this.http.delete(`${this.base}/protocolos-activados/${id}`);
  }

  // Flujo del catálogo global (grafo del protocolo: pasos, transiciones, roles y campos)
  getFlujoGenerico(idProtocolo: number) {
    return this.http.get<any>(`${this.base}/protocolos-genericos/${idProtocolo}/flujo`);
  }
  validarFlujoGenerico(idProtocolo: number) {
    return this.http.get<{ publicable: boolean; problemas: string[] }>(
      `${this.base}/protocolos-genericos/${idProtocolo}/flujo/validar`,
    );
  }
  publicarFlujoGenerico(idProtocolo: number) {
    return this.http.post(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/publicar`, {});
  }
  /**
   * Guarda el paso entero de una vez: sus datos, responsables, preguntas y
   * salidas, en una transacción del lado del servidor. Devuelve el grafo ya
   * escrito, así que quien llama no necesita recargarlo.
   *
   * Los endpoints de a uno de más abajo siguen para las ediciones sueltas
   * (mover o borrar algo desde el diagrama); el formulario del paso guarda por
   * acá porque encadenar nueve requests contra la base remota costaba unos
   * quince segundos y podía dejar el paso a medio escribir.
   */
  guardarPasoCompletoGenerico(idProtocolo: number, idPaso: number | null, data: any) {
    const base = `${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos`;
    return idPaso
      ? this.http.put(`${base}/${idPaso}/completo`, data)
      : this.http.post(`${base}/completo`, data);
  }
  createPasoGenerico(idProtocolo: number, data: any) {
    return this.http.post(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos`, data);
  }
  updatePasoGenerico(idProtocolo: number, idPaso: number, data: any) {
    return this.http.put(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}`, data);
  }
  deletePasoGenerico(idProtocolo: number, idPaso: number) {
    return this.http.delete(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}`);
  }
  createTransicionGenerica(idProtocolo: number, data: any) {
    return this.http.post(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/transiciones`, data);
  }
  updateTransicionGenerica(idProtocolo: number, idTransicion: number, data: any) {
    return this.http.put(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/transiciones/${idTransicion}`, data);
  }
  deleteTransicionGenerica(idProtocolo: number, idTransicion: number) {
    return this.http.delete(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/transiciones/${idTransicion}`);
  }
  /** Reemplaza el set completo de roles del paso, no agrega de a uno. */
  setRolesPasoGenerico(idProtocolo: number, idPaso: number, roles: any[]) {
    return this.http.put(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}/roles`, { roles });
  }
  createCampoGenerico(idProtocolo: number, idPaso: number, data: any) {
    return this.http.post(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}/campos`, data);
  }
  updateCampoGenerico(idProtocolo: number, idPaso: number, idCampo: number, data: any) {
    return this.http.put(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}/campos/${idCampo}`, data);
  }
  deleteCampoGenerico(idProtocolo: number, idPaso: number, idCampo: number) {
    return this.http.delete(`${this.base}/protocolos-genericos/${idProtocolo}/flujo/pasos/${idPaso}/campos/${idCampo}`);
  }

  // Flujo del establecimiento (el grafo vigente: heredado del catálogo o copia propia)
  getFlujoEstablecimiento(idPE: number) {
    return this.http.get<any>(`${this.base}/protocolos-establecimiento/${idPE}/flujo`);
  }
  validarFlujoEstablecimiento(idPE: number) {
    return this.http.get<any>(`${this.base}/protocolos-establecimiento/${idPE}/flujo/validar`);
  }
  /** Clona el grafo del catálogo: desde aquí el colegio deja de heredar. */
  personalizarFlujoEstablecimiento(idPE: number) {
    return this.http.post(`${this.base}/protocolos-establecimiento/${idPE}/flujo/personalizar`, {});
  }
  restaurarFlujoEstablecimiento(idPE: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${idPE}/flujo/personalizar`);
  }
  /** Ver `guardarPasoCompletoGenerico`: lo mismo sobre la copia del colegio. */
  guardarPasoCompletoEstablecimiento(idPE: number, idPaso: number | null, data: any) {
    const base = `${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos`;
    return idPaso
      ? this.http.put(`${base}/${idPaso}/completo`, data)
      : this.http.post(`${base}/completo`, data);
  }
  createPasoEstablecimiento(idPE: number, data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos`, data);
  }
  updatePasoEstablecimiento(idPE: number, idPaso: number, data: any) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}`, data);
  }
  deletePasoEstablecimiento(idPE: number, idPaso: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}`);
  }
  createTransicionEstablecimiento(idPE: number, data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento/${idPE}/flujo/transiciones`, data);
  }
  updateTransicionEstablecimiento(idPE: number, idTransicion: number, data: any) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${idPE}/flujo/transiciones/${idTransicion}`, data);
  }
  deleteTransicionEstablecimiento(idPE: number, idTransicion: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${idPE}/flujo/transiciones/${idTransicion}`);
  }
  setRolesPasoEstablecimiento(idPE: number, idPaso: number, roles: any[]) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}/roles`, { roles });
  }
  createCampoEstablecimiento(idPE: number, idPaso: number, data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}/campos`, data);
  }
  updateCampoEstablecimiento(idPE: number, idPaso: number, idCampo: number, data: any) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}/campos/${idCampo}`, data);
  }
  deleteCampoEstablecimiento(idPE: number, idPaso: number, idCampo: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${idPE}/flujo/pasos/${idPaso}/campos/${idCampo}`);
  }

  // Ejecución de un caso (motor de protocolos)
  /** Cabecera + grafo congelado + estado de cada paso. */
  getProtocoloActivado(id: number) {
    return this.http.get<any>(`${this.base}/protocolos-activados/${id}`);
  }
  getBitacoraProtocolo(id: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/${id}/bitacora`);
  }
  completarPaso(id: number, idPaso: number, datos_salida: any) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/pasos/${idPaso}/completar`, { datos_salida });
  }
  aprobarPaso(id: number, idPaso: number, data: any) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/pasos/${idPaso}/aprobar`, data);
  }
  omitirPaso(id: number, idPaso: number, motivo: string) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/pasos/${idPaso}/omitir`, { motivo });
  }
  reasignarPaso(id: number, idPaso: number, id_usuario: number) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/pasos/${idPaso}/reasignar`, { id_usuario });
  }
  cerrarProtocoloActivado(id: number, motivo?: string) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/cerrar`, { motivo });
  }
  anularProtocoloActivado(id: number, motivo: string) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/anular`, { motivo });
  }
  agregarNotaProtocolo(id: number, descripcion: string) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/nota`, { descripcion });
  }

  // Involucrados del caso: contra quién y a favor de quién se instruye. Vienen
  // también dentro de getProtocoloActivado; estos endpoints son para tocarlos.
  getInvolucrados(id: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/${id}/involucrados`);
  }
  agregarInvolucrado(id: number, data: any) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/involucrados`, data);
  }
  cambiarRolInvolucrado(id: number, idInvolucrado: number, rol: string) {
    return this.http.put(`${this.base}/protocolos-activados/${id}/involucrados/${idInvolucrado}/rol`, { rol });
  }
  quitarInvolucrado(id: number, idInvolucrado: number) {
    return this.http.delete(`${this.base}/protocolos-activados/${id}/involucrados/${idInvolucrado}`);
  }
  /** Lo que se hizo con una persona en un paso: notificación, entrega, firma. */
  registrarGestion(id: number, idPasoInvolucrado: number, data: any) {
    return this.http.post(`${this.base}/protocolos-activados/${id}/gestiones/${idPasoInvolucrado}`, data);
  }
  /**
   * El acta de notificación firmada, escaneada o fotografiada. Va como FormData:
   * NO fijar Content-Type a mano, el navegador tiene que poner el boundary.
   */
  subirActaFirmada(id: number, idPasoInvolucrado: number, data: FormData) {
    return this.http.put(`${this.base}/protocolos-activados/${id}/gestiones/${idPasoInvolucrado}/acta`, data);
  }
  /** Blob y no URL directa: el token viaja en la cabecera del interceptor. */
  getActaFirmada(id: number, idPasoInvolucrado: number) {
    return this.http.get(`${this.base}/protocolos-activados/${id}/gestiones/${idPasoInvolucrado}/acta`, {
      responseType: 'blob',
    });
  }
  /**
   * El acta de notificación en blanco, para imprimir y hacer firmar. La arma
   * el backend; solo se le pasa el plazo, que es lo único que decide quien la
   * emite. Respuesta completa para leer el nombre del archivo.
   */
  getActaNotificacionPdf(id: number, idPasoInvolucrado: number, plazoDias: number) {
    return this.http.get(
      `${this.base}/protocolos-activados/${id}/gestiones/${idPasoInvolucrado}/acta-notificacion`,
      { params: { plazo_dias: plazoDias }, responseType: 'blob', observe: 'response' },
    );
  }

  // Notificaciones (la campana de la barra superior)
  /** Las últimas 30 del usuario en sesión, sin leer primero. */
  getNotificaciones() {
    return this.http.get<any[]>(`${this.base}/notificaciones`);
  }
  /** Solo el número del badge: se pide seguido, así que no trae el listado. */
  getContadorNotificaciones() {
    return this.http.get<{ sin_leer: number }>(`${this.base}/notificaciones/contador`);
  }
  marcarNotificacionLeida(id: number) {
    return this.http.put(`${this.base}/notificaciones/${id}/leer`, {});
  }
  marcarTodasNotificacionesLeidas() {
    return this.http.put(`${this.base}/notificaciones/leer-todas`, {});
  }

  // ── Ley 21.809 ────────────────────────────────────────────────────────────

  // Vínculo tipo de falta -> protocolo que obliga a activar
  setProtocolosTipoFalta(idTipoFalta: number, protocolos: any[]) {
    return this.http.put(`${this.base}/tipos-falta/${idTipoFalta}/protocolos`, { protocolos });
  }

  // Medidas de protección (art. 16 E letra j). El alta cuelga del caso; las
  // acciones sobre una medida ya registrada van por su propia ruta.
  getMedidasProteccion(idCaso: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/${idCaso}/medidas-proteccion`);
  }
  createMedidaProteccion(idCaso: number, data: any) {
    return this.http.post<any>(`${this.base}/protocolos-activados/${idCaso}/medidas-proteccion`, data);
  }
  // Corregir una medida mal cargada. El backend solo lo permite mientras está
  // vigente y sin seguimientos encima.
  updateMedidaProteccion(idMedida: number, data: any) {
    return this.http.put<any>(`${this.base}/medidas-proteccion/${idMedida}`, data);
  }
  finalizarMedidaProteccion(idMedida: number, id_medida_sustituye?: number) {
    return this.http.patch(`${this.base}/medidas-proteccion/${idMedida}/finalizar`, { id_medida_sustituye });
  }
  registrarSeguimientoMedida(idMedida: number, data: any) {
    return this.http.post(`${this.base}/medidas-proteccion/${idMedida}/seguimiento`, data);
  }

  // Medidas disciplinarias y su resultado (insumo del informe de expulsión)
  getMedidasDisciplinarias(idRegistro: number) {
    return this.http.get<any[]>(`${this.base}/registros/${idRegistro}/medidas-disciplinarias`);
  }
  createMedidaDisciplinaria(idRegistro: number, data: any) {
    return this.http.post(`${this.base}/registros/${idRegistro}/medidas-disciplinarias`, data);
  }
  registrarResultadoMedida(idMedida: number, data: any) {
    return this.http.patch(`${this.base}/medidas-disciplinarias/${idMedida}/resultado`, data);
  }

  // Suspensión cautelar (art. 6 letra d). Como las de protección: el alta
  // cuelga del caso, las acciones sobre una suspensión ya decretada van por su
  // propia ruta.
  getSuspensionesCautelares(idCaso: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/${idCaso}/suspensiones-cautelares`);
  }
  createSuspensionCautelar(idCaso: number, data: any) {
    return this.http.post<any>(`${this.base}/protocolos-activados/${idCaso}/suspensiones-cautelares`, data);
  }
  // Igual que en protección: solo mientras no haya reconsideración ni
  // resolución, que es cuando el backend cierra la ventana.
  updateSuspensionCautelar(idSuspension: number, data: any) {
    return this.http.put<any>(`${this.base}/suspensiones-cautelares/${idSuspension}`, data);
  }
  registrarReconsideracionCautelar(idSuspension: number, data: any) {
    return this.http.patch<any>(`${this.base}/suspensiones-cautelares/${idSuspension}/reconsideracion`, data);
  }
  resolverSuspensionCautelar(idSuspension: number, data: any) {
    return this.http.patch<any>(`${this.base}/suspensiones-cautelares/${idSuspension}/resolver`, data);
  }

  // Informe previo de expulsión o cancelación de matrícula
  getInformeExpulsion(idCaso: number) {
    return this.http.get<any>(`${this.base}/protocolos-activados/${idCaso}/informe-expulsion`);
  }
  createInformeExpulsion(idCaso: number, data: any) {
    return this.http.post<any>(`${this.base}/protocolos-activados/${idCaso}/informe-expulsion`, data);
  }
  updateInformeExpulsion(idInforme: number, data: any) {
    return this.http.put(`${this.base}/informes-expulsion/${idInforme}`, data);
  }
  setComisionInforme(idInforme: number, integrantes: any[]) {
    return this.http.put(`${this.base}/informes-expulsion/${idInforme}/comision`, { integrantes });
  }
  firmarInformeExpulsion(idInforme: number) {
    return this.http.post(`${this.base}/informes-expulsion/${idInforme}/firmar`, {});
  }
  emitirInformeExpulsion(idInforme: number) {
    return this.http.post(`${this.base}/informes-expulsion/${idInforme}/emitir`, {});
  }
  decidirInformeExpulsion(idInforme: number, data: any) {
    return this.http.post(`${this.base}/informes-expulsion/${idInforme}/decidir`, data);
  }
  registrarEnviosInforme(idInforme: number, data: any) {
    return this.http.patch(`${this.base}/informes-expulsion/${idInforme}/informes-enviados`, data);
  }

  // Expediente: lo que se le entrega a la Superintendencia
  getExpediente(idCaso: number, redactado = false) {
    return this.http.get<any>(`${this.base}/protocolos-activados/${idCaso}/expediente`, {
      params: redactado ? { redactado: '1' } : {},
    });
  }
  /** El expediente ya como PDF, con las actas firmadas anexadas (lo arma el backend). */
  getExpedientePdf(idCaso: number, redactado = false) {
    return this.http.get(`${this.base}/protocolos-activados/${idCaso}/expediente/pdf`, {
      params: redactado ? { redactado: '1' } : {},
      responseType: 'blob',
      observe: 'response',
    });
  }
  /** Exportación redactada de los últimos 24 meses (obligación ante terceros). */
  getExpedientesMasivo(params: { categoria?: string; meses?: number } = {}) {
    return this.http.get<any>(`${this.base}/expedientes/masivo`, { params: params as any });
  }

  // Feriados: definen qué días son hábiles y por lo tanto los plazos legales
  getFeriados(anio?: number) {
    return this.http.get<any[]>(`${this.base}/feriados`, { params: anio ? { anio } : {} });
  }
  createFeriado(data: any) {
    return this.http.post(`${this.base}/feriados`, data);
  }
  deleteFeriado(id: number) {
    return this.http.delete(`${this.base}/feriados/${id}`);
  }

  // Documentos institucionales (RICE y Plan de Gestión) y constancias de
  // recepción del apoderado (art. 16 G). Los archivos viajan como FormData:
  // NO fijar Content-Type a mano, el navegador tiene que poner el boundary.
  getDocumentosInstitucionales() {
    return this.http.get<any[]>(`${this.base}/documentos-institucionales`);
  }
  createDocumentoInstitucional(data: FormData) {
    return this.http.post(`${this.base}/documentos-institucionales`, data);
  }
  publicarDocumentoInstitucional(id: number) {
    return this.http.post(`${this.base}/documentos-institucionales/${id}/publicar`, {});
  }
  /**
   * El archivo se pide como blob y no por URL directa: el token va en la
   * cabecera que pone el interceptor, así que una URL abierta con window.open
   * llegaría sin autenticación y rebotaría con 401.
   */
  getArchivoDocumentoInstitucional(id: number) {
    return this.http.get(`${this.base}/documentos-institucionales/${id}/archivo`, {
      responseType: 'blob',
    });
  }
  getConstancias(idDocumento: number) {
    return this.http.get<any>(`${this.base}/documentos-institucionales/${idDocumento}/constancias`);
  }
  registrarConstancia(idDocumento: number, data: FormData) {
    return this.http.post(`${this.base}/documentos-institucionales/${idDocumento}/constancias`, data);
  }
  adjuntarConstanciaFirmada(idConstancia: number, data: FormData) {
    return this.http.put(`${this.base}/constancias/${idConstancia}/archivo`, data);
  }
  getArchivoConstancia(idConstancia: number) {
    return this.http.get(`${this.base}/constancias/${idConstancia}/archivo`, {
      responseType: 'blob',
    });
  }
}
