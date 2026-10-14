/**
 * Borrador del correo de contacto guardado en las observaciones de un
 * establecimiento.
 *
 * Los borradores se escriben en las observaciones con este formato:
 *
 *   --- Correo sugerido (14-10-2026, sin enviar) ---
 *   Para: contacto@colegio.cl
 *   Asunto: ...
 *
 *   Cuerpo del correo...
 *
 * El título cambia a "--- Correo enviado por Zoho (...) ---" una vez enviado,
 * así que se reconoce cualquier título "--- Correo ... ---". Si hay más de uno
 * se toma el último, que es el más reciente.
 */
export interface BorradorCorreo {
  para: string;
  asunto: string;
  cuerpo: string;
}

const TITULO = /^---\s*Correo\b.*---\s*$/gm;

export function extraerBorradorCorreo(observaciones: string | null | undefined): BorradorCorreo | null {
  if (!observaciones) return null;
  const titulos = [...observaciones.matchAll(TITULO)];
  if (!titulos.length) return null;
  const ultimo = titulos[titulos.length - 1];
  const resto = observaciones.slice(ultimo.index! + ultimo[0].length).replace(/^\s*\n/, '');

  // Encabezados "Para:" y "Asunto:" hasta la primera línea en blanco; lo que
  // sigue es el cuerpo.
  const lineas = resto.split('\n');
  let para = '';
  let asunto = '';
  let i = 0;
  for (; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) break;
    const m = linea.match(/^(Para|Asunto)\s*:\s*(.*)$/i);
    if (!m) break;
    if (m[1].toLowerCase() === 'para') para = m[2].trim();
    else asunto = m[2].trim();
  }
  const cuerpo = lineas.slice(i).join('\n').trim();
  if (!asunto && !cuerpo) return null;
  return { para, asunto, cuerpo };
}
