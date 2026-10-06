import { Permiso as PermisoModel } from '../models/usuario.model';
import { MENU } from './menu';

/**
 * Arma las tarjetas de la grilla de permisos (Roles y excepciones por persona
 * en Usuarios): una por ítem del sidebar, con su nombre y en su orden, y
 * adentro los recursos que ese ítem declara en MENU.recursos. Antes era una
 * tarjeta por recurso en orden alfabético, con el nombre técnico de la tabla
 * ("Medida Proteccion"), y quien arma un rol piensa en pantallas.
 *
 * Los recursos que ningún ítem reclama van a una tarjeta "Otros" al final:
 * un permiso nuevo aparece igual aunque nadie lo haya ubicado todavía.
 */

export interface SeccionPermisos {
  recurso: string;
  permisos: PermisoModel[];
}

export interface GrupoPermisos {
  /** Ruta del ítem del menú, o 'otros'. Sirve de clave para el @for. */
  clave: string;
  titulo: string;
  icono: string;
  /** Todos los permisos de la tarjeta: los usa el check del título y el contador. */
  permisos: PermisoModel[];
  /** Una por recurso. Solo se muestran como subtítulos cuando hay más de una. */
  secciones: SeccionPermisos[];
}

export function agruparPermisos(catalogo: readonly PermisoModel[]): GrupoPermisos[] {
  const porRecurso = new Map<string, PermisoModel[]>();
  for (const p of catalogo) {
    if (!porRecurso.has(p.recurso)) porRecurso.set(p.recurso, []);
    porRecurso.get(p.recurso)!.push(p);
  }

  const armar = (clave: string, titulo: string, icono: string, recursos: readonly string[]) => {
    const secciones = recursos
      .filter((r) => porRecurso.has(r))
      .map((r) => ({ recurso: r, permisos: porRecurso.get(r)! }));
    return { clave, titulo, icono, secciones, permisos: secciones.flatMap((s) => s.permisos) };
  };

  const grupos = MENU.map((i) => armar(i.route, i.label, i.icon, i.recursos));
  const reclamados = new Set(MENU.flatMap((i) => i.recursos));
  grupos.push(
    armar('otros', 'Otros', 'ti-dots', [...porRecurso.keys()].filter((r) => !reclamados.has(r)).sort()),
  );
  return grupos.filter((g) => g.permisos.length > 0);
}
