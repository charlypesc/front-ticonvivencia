import { Pipe, PipeTransform } from '@angular/core';

// "7BasicoA" -> "7 Basico A" (nombre crudo del curso a formato legible)
//
// Va como función además de pipe porque el mismo formato hace falta fuera de un
// template: los PDFs (actas, expediente) se arman en TypeScript y ahí el nombre
// crudo se colaba tal cual a un papel que firma un apoderado.
export function formatearNombreCurso(nombre: string | null | undefined): string {
  if (!nombre) return '';
  const match = nombre.match(/^(\d+)(Basico|Medio)([A-Z])$/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : nombre;
}

@Pipe({ name: 'cursoNombre', standalone: true })
export class CursoNombrePipe implements PipeTransform {
  transform(nombre: string | null | undefined): string {
    return formatearNombreCurso(nombre);
  }
}
