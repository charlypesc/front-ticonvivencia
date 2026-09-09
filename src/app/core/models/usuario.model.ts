export interface Usuario {
  id: number;
  correo: string;
  /** null en los usuarios creados antes de que el alta pidiera el nombre. */
  nombre: string | null;
  /**
   * Rol principal. Se conserva por compatibilidad, pero un usuario puede tener
   * varios: para decidir qué mostrar usar `permisos`, no este campo.
   */
  rol: string;
  /**
   * Nombre legible del rol principal ("Encargado de convivencia escolar"). Va
   * aparte del código porque hay textos que se imprimen y se leen fuera del
   * sistema —el cargo bajo la firma del acta de notificación—, donde
   * "ENCARGADO" no es una respuesta.
   */
  rol_nombre?: string | null;
  roles: string[];
  /** Ids de permiso (ver core/constants/permisos.ts), no códigos de texto. */
  permisos: number[];
  /** El ADMIN pasa por bypass en el backend y llega con `permisos` vacío. */
  es_admin: boolean;
  /** null en el ADMIN, que es global y no pertenece a ningún establecimiento. */
  id_establecimiento: number | null;
  nombre_establecimiento?: string;
  /** RBD del establecimiento, para mostrarlo junto al nombre en el navbar. */
  rbd_establecimiento?: string | number | null;
}

/**
 * Lo que devuelve el backend al crear un usuario o al restablecerle la clave.
 *
 * `password` viaja en claro y existe solo en esta respuesta: el servidor guarda
 * el hash y no hay forma de volver a leerla. Es el material del documento que
 * se entrega en mano; si se pierde, el único camino es restablecerla otra vez.
 * Por lo mismo no se guarda en localStorage ni en ningún signal persistente.
 */
export interface Credenciales {
  id_usuario: number;
  correo: string;
  /**
   * Nombre de la persona, para encabezar el documento. Puede venir null en los
   * usuarios creados antes de que existiera la columna: en ese caso el
   * documento cae al correo.
   */
  nombre: string | null;
  password: string;
  message: string;
}

export interface AuthResponse {
  token: string;
  usuario: Usuario;
}

export interface Rol {
  rol_id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  es_sistema: boolean;
  cantidad_permisos?: number;
  /** null = rol global (sirve para todos los colegios); con valor = propio de ese establecimiento. */
  id_establecimiento: number | null;
  nombre_establecimiento?: string;
  /**
   * Lo calcula el backend: si este usuario puede cambiarle los permisos.
   * Es false para el ADMIN y, salvo que uno sea ADMIN, para todos los roles
   * globales — los comparten todos los colegios. No reimplementar la regla acá.
   */
  editable?: boolean;
}

export interface Permiso {
  permiso_id: number;
  codigo: string;
  recurso: string;
  accion: string;
  descripcion?: string;
}
