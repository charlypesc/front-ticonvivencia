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
  validarRegistro(id: number) {
    return this.http.patch(`${this.base}/registros/${id}/validar`, {});
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
}
