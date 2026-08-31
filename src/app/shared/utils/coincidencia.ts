/** Ignora tildes y mayúsculas: "nunoa" tiene que encontrar "ÑUÑOA". */
export const normalizar = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Qué tan bien un texto responde a lo escrito. Mayor es mejor, -1 es "no
 * corresponde". No es una distancia de edición: la búsqueda del sistema es por
 * nombre y por RUN/RBD, donde lo que importa es dónde empieza la coincidencia.
 * "ros" tiene que dejar arriba a ROSARIO y no a AMBROSIO, aunque las dos
 * contengan las mismas tres letras.
 */
export function puntajeCoincidencia(texto: string, consulta: string): number {
  const t = normalizar(texto);
  const q = normalizar(consulta);
  if (!q) return 0;
  if (!t) return -1;

  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  // Alguna palabra empieza con lo escrito: "diaz" sobre "ROSARIO DÍAZ".
  if (t.split(/\s+/).some((p) => p.startsWith(q))) return 60;
  if (t.includes(q)) return 40;

  // Última chance: todas las palabras escritas aparecen sueltas y en cualquier
  // orden ("diaz rosario"). Es el criterio con el que ya se filtra, así que un
  // resultado válido nunca queda con puntaje negativo.
  const tokens = q.split(/\s+/);
  if (tokens.length > 1 && tokens.every((tok) => t.includes(tok))) return 20;

  return -1;
}

/**
 * Ordena de mejor a peor coincidencia, sin descartar nada: el filtrado sigue
 * siendo de cada pantalla. Empata por texto más corto — entre dos que empiezan
 * igual, el nombre corto es el que se escribió completo — y después alfabético,
 * para que la lista no cambie de orden entre búsquedas iguales.
 */
export function ordenarPorCoincidencia<T>(
  items: readonly T[],
  consulta: string,
  textoDe: (item: T) => string,
): T[] {
  const q = normalizar(consulta);
  if (!q) return [...items];

  return [...items].sort((a, b) => {
    const ta = textoDe(a);
    const tb = textoDe(b);
    const dif = puntajeCoincidencia(tb, q) - puntajeCoincidencia(ta, q);
    if (dif !== 0) return dif;
    if (ta.length !== tb.length) return ta.length - tb.length;
    return normalizar(ta).localeCompare(normalizar(tb));
  });
}
