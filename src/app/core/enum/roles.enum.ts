/**
 * Los códigos de rol que el código conoce por nombre. NO es la lista completa:
 * desde la administración se pueden crear roles nuevos, que no aparecen acá.
 *
 * No confundir con `es_sistema` de la BD, que hoy lleva solo ADMIN: esa columna
 * marca qué rol no se puede renombrar, y DIRECTOR y ENCARGADO sí se pueden
 * (su `codigo`, que es lo que se compara acá, nunca cambia).
 *
 * Usar solo para lo que es específico de estos tres (ej. reconocer al ADMIN).
 * Para decidir qué puede hacer un usuario, usar AuthService.can(permiso).
 */
export enum RolesEnum {
  ADMIN = 'ADMIN',
  DIRECTOR = 'DIRECTOR',
  ENCARGADO = 'ENCARGADO',
}
