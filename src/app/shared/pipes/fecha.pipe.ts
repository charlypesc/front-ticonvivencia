import { Pipe, PipeTransform } from '@angular/core';
import { formatearFecha, formatearFechasEnTexto } from '../utils/fecha';

/**
 * `{{ valor | fecha }}` -> 31/08/2026 · `{{ valor | fecha:true }}` -> 31/08/2026 14:05
 *
 * Reemplaza al `date` de Angular en todo el proyecto: además de fijar el
 * formato, no corre la fecha un día para atrás cuando el backend manda sólo
 * 'yyyy-MM-dd' (ver `shared/utils/fecha.ts`).
 */
@Pipe({ name: 'fecha', standalone: true })
export class FechaPipe implements PipeTransform {
  transform(valor: any, conHora = false): string {
    return formatearFecha(valor, conHora);
  }
}

/**
 * `{{ texto | fechasEnTexto }}` — para las frases que arma el backend con la
 * fecha adentro ("con plazo hasta 2026-09-01T06:34:33.486Z").
 */
@Pipe({ name: 'fechasEnTexto', standalone: true })
export class FechasEnTextoPipe implements PipeTransform {
  transform(texto: any): string {
    return formatearFechasEnTexto(texto);
  }
}
