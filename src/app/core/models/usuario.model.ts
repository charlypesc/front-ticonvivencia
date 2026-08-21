export interface Usuario {
  id: number;
  correo: string;
  /**
   * Rol principal. Se conserva por compatibilidad, pero un usuario puede tener
   * varios: para decidir qué mostrar usar `permisos`, no este campo.
   */
  rol: string;
  roles: string[];
  /** Ids de permiso (ver core/constants/permisos.ts), no códigos de texto. */
  permisos: number[];
  /** El ADMIN pasa por bypass en el backend y llega con `permisos` vacío. */
  es_admin: boolean;
  /** null en el ADMIN, que es global y no pertenece a ningún establecimiento. */
  id_establecimiento: number | null;
  nombre_establecimiento?: string;
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
