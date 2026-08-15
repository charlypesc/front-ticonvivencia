import { Pipe, PipeTransform } from '@angular/core';

// "7BasicoA" -> "7 Basico A" (nombre crudo del curso a formato legible)
@Pipe({ name: 'cursoNombre', standalone: true })
export class CursoNombrePipe implements PipeTransform {
  transform(nombre: string | null | undefined): string {
    if (!nombre) return '';
    const match = nombre.match(/^(\d+)(Basico|Medio)([A-Z])$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : nombre;
  }
}
