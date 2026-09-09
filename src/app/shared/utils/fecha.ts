/**
 * Formato único de fecha del proyecto: dd/MM/yyyy.
 *
 * Todo lo que ve el usuario pasa por acá — pantallas, PDFs y avisos — para que
 * no convivan dd/MM/yyyy, dd-MM-yyyy y el yyyy-MM-dd crudo del backend en la
 * misma app. Lo que se guarda y lo que viaja al backend sigue siendo ISO: esto
 * es sólo presentación.
 *
 * No se usa `new Date(...)` con las fechas ISO de sólo día ('2026-08-31')
 * porque el navegador las lee como medianoche UTC y en Chile (UTC-3/-4) eso
 * muestra el día anterior. Cuando el valor ya viene con año, mes y día, se
 * toman esos números tal cual.
 */

interface Partes {
  dia: string;
  mes: string;
  anio: string;
  hora: string | null;
}

const dos = (n: number) => String(n).padStart(2, '0');

function partes(valor: any): Partes | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'string') {
    // Con 'Z' o con offset el string es un instante en otra zona: ahí sí hay
    // que convertir a hora local. Sin offset (lo que manda MySQL) se toma
    // literal, que es lo que evita el corrimiento de un día.
    const conZona = /(?:Z|[+-]\d{2}:?\d{2})$/.test(valor.trim());
    const m = conZona ? null : /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(valor.trim());
    if (m) {
      return {
        dia: m[3],
        mes: m[2],
        anio: m[1],
        hora: m[4] ? `${m[4]}:${m[5]}` : null,
      };
    }
  }

  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d.getTime())) return null;
  return {
    dia: dos(d.getDate()),
    mes: dos(d.getMonth() + 1),
    anio: String(d.getFullYear()),
    hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
  };
}

/**
 * `dd/MM/yyyy`, o `dd/MM/yyyy HH:mm` con `conHora`. Devuelve '' si el valor no
 * es una fecha, para que el llamador decida qué poner en su lugar ('—', nada).
 */
export function formatearFecha(valor: any, conHora = false): string {
  const p = partes(valor);
  if (!p) return '';
  const fecha = `${p.dia}/${p.mes}/${p.anio}`;
  return conHora && p.hora ? `${fecha} ${p.hora}` : fecha;
}

/**
 * Reemplaza las fechas ISO que vengan **dentro** de un texto del backend.
 *
 * Las descripciones de la bitácora se arman en el servidor y traen la fecha
 * pegada en la frase ("con plazo hasta 2026-09-01T06:34:33.486Z"). No se puede
 * formatear el campo porque la fecha no es un campo: es parte del string.
 */
export function formatearFechasEnTexto(texto: any): string {
  return String(texto ?? '').replace(
    /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g,
    (iso) => formatearFecha(iso, /[T ]\d{2}:\d{2}/.test(iso)) || iso,
  );
}

/**
 * Hoy en `yyyy-MM-dd` horario local, que es lo que espera un
 * `<input type="date">`. No se usa `toISOString()`: da UTC, y en Chile
 * (UTC-3/-4) un formulario abierto de noche aparecería con la fecha de mañana.
 */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Ahora en `yyyy-MM-ddTHH:mm` local, para un `<input type="datetime-local">`. */
export function ahoraIso(): string {
  const d = new Date();
  return `${hoyIso()}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
