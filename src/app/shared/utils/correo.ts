/**
 * Dominio sugerido para los correos de un establecimiento.
 *
 * Las cuentas se crean a mano y, sin una sugerencia, todas terminan en el mismo
 * `@colegio.cl` del placeholder: dos establecimientos distintos quedan con
 * correos indistinguibles y nadie sabe a qué colegio pertenece una cuenta al
 * leerla. Esto propone un dominio derivado del propio establecimiento.
 *
 * Es solo una sugerencia: el campo sigue siendo libre y se puede escribir
 * cualquier otro dominio encima.
 */

/**
 * Si el correo institucional del colegio está en un proveedor gratuito, su
 * dominio no identifica a nadie: se cae al nombre en vez de sugerir @gmail.com.
 */
const PROVEEDORES_GENERICOS = new Set([
  'gmail.com', 'gmail.cl', 'hotmail.com', 'hotmail.cl', 'hotmail.es',
  'outlook.com', 'outlook.cl', 'outlook.es', 'yahoo.com', 'yahoo.cl', 'yahoo.es',
  'live.cl', 'live.com', 'icloud.com', 'me.com', 'protonmail.com',
]);

/**
 * Palabras que casi todos los establecimientos comparten. Dejarlas haría que
 * "ESCUELA REPUBLICA DE ISRAEL" y "ESCUELA REPUBLICA DE FRANCIA" empezaran
 * igual y se cortaran antes de llegar a lo que las distingue.
 */
const RUIDO = new Set([
  // tipo de establecimiento
  'escuela', 'esc', 'liceo', 'lic', 'colegio', 'col', 'instituto', 'inst',
  'centro', 'educacional', 'educacion', 'educ', 'complejo', 'internado', 'anexo',
  // nivel, modalidad y programas, que comparten cientos de colegios
  'basica', 'basico', 'bas', 'media', 'parvularia', 'adultos',
  'bicentenario', 'excelencia', 'artistico', 'artistica', 'art',
  'tecnico', 'tec', 'profesional', 'poli', 'comercial', 'industrial',
  'agricola', 'deportivo', 'deportiva', 'des', 'adm',
  'municipal', 'particular', 'subvencionado',
  // conectores
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e',
  // tratamientos y grados militares abreviados, frecuentes en los nombres
  'dr', 'dra', 'sr', 'sra', 'don', 'dona', 'prof', 'profesor', 'profesora',
  'gral', 'grl', 'comte', 'cmte', 'subtte', 'tte', 'cap',
]);

/** Largo máximo de la parte del dominio antes del `.cl`. */
const LARGO_MAXIMO = 20;
/** Cuántas palabras del nombre entran, como mucho. */
const MAXIMO_PALABRAS = 3;

const sinTildes = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** El nombre crudo del MINEDUC viene en mayúsculas, con puntos y abreviaturas. */
const palabrasDe = (nombre: string) =>
  sinTildes(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/**
 * Dominio a partir del nombre: se descartan las palabras que no distinguen y se
 * pegan las que quedan hasta llenar el largo máximo. Se corta por palabra
 * completa y nunca a la mitad: "liceopolitecni.cl" se lee como un error de
 * tipeo, no como una sugerencia.
 */
function dominioDesdeNombre(nombre: string): string {
  const palabras = palabrasDe(nombre);
  // Si el nombre entero es genérico (ej: "ESCUELA BASICA"), es preferible usar
  // esas palabras a devolver nada.
  const distintivas = palabras.filter((p) => p.length > 1 && !RUIDO.has(p));
  const elegibles = distintivas.length > 0 ? distintivas : palabras;

  let slug = '';
  for (const palabra of elegibles.slice(0, MAXIMO_PALABRAS)) {
    if (slug && slug.length + palabra.length > LARGO_MAXIMO) break;
    slug += palabra;
  }
  return slug ? `${slug}.cl` : '';
}

/** Dominio del correo institucional, si sirve para identificar al colegio. */
function dominioDesdeCorreo(correo: string): string {
  const dominio = correo.trim().toLowerCase().split('@')[1];
  if (!dominio || !dominio.includes('.')) return '';
  return PROVEEDORES_GENERICOS.has(dominio) ? '' : dominio;
}

export interface EstablecimientoParaDominio {
  nombre?: string | null;
  correo?: string | null;
}

/**
 * El dominio que ya usan las cuentas del establecimiento, o '' si todavía no
 * hay ninguna. Es la mejor fuente cuando existe: no es una deducción, es la
 * decisión que tomó quien creó las cuentas anteriores.
 *
 * Se elige el más repetido y no el de la primera cuenta a propósito: si esa
 * primera se creó con un typo o con un correo personal de apuro, tomarla como
 * verdad amarraría a todo el colegio al error. Por mayoría, el dominio se
 * corrige solo en cuanto la mayoría de las cuentas usa el bueno.
 */
export function dominioDeCuentas(correos: (string | null | undefined)[]): string {
  const cuenta = new Map<string, number>();
  for (const correo of correos) {
    const dominio = (correo ?? '').trim().toLowerCase().split('@')[1];
    if (dominio) cuenta.set(dominio, (cuenta.get(dominio) ?? 0) + 1);
  }
  let ganador = '';
  let maximo = 0;
  for (const [dominio, n] of cuenta)
    if (n > maximo) { ganador = dominio; maximo = n; }
  return ganador;
}

/** El dominio del correo escrito, en minúsculas; '' si todavía no hay `@`. */
export function dominioDe(correo: string): string {
  return (correo ?? '').trim().toLowerCase().split('@')[1] ?? '';
}

/**
 * Dominios a proponer, el primero como opción por defecto y sin repetidos.
 *
 * **Manda el dominio de las cuentas que ya existen**: en cuanto el
 * establecimiento tiene su primer usuario, ese dominio define el orden y las
 * deducciones pasan a segundo plano. Recién cuando no hay ninguna cuenta se
 * cae a deducirlo del establecimiento.
 *
 * Entre las dos deducciones **va primero el derivado del nombre, no el del
 * correo institucional**, y eso
 * es deliberado. Medido sobre 4.000 establecimientos del directorio: el dominio
 * del correo institucional deja al 48% de los colegios compartiendo dominio con
 * otro, porque los SLEP usan uno solo para todos sus establecimientos
 * (`@educhiloe.gob.cl` cubre 55 colegios distintos). El derivado del nombre baja
 * ese choque al 24%. Como estas cuentas son identificadores de acceso a
 * MiConvivencia y no buzones de correo reales, distinguir un colegio de otro
 * importa más que coincidir con el dominio que el sostenedor usa para su mail.
 *
 * El institucional igual se ofrece de segundo: para un colegio con dominio
 * propio suele ser el que la gente reconoce.
 */
export function dominiosSugeridos(
  establecimiento: EstablecimientoParaDominio | null | undefined,
  correosExistentes: (string | null | undefined)[] = [],
): string[] {
  const enUso = dominioDeCuentas(correosExistentes);
  const porNombre = establecimiento?.nombre ? dominioDesdeNombre(establecimiento.nombre) : '';
  const porCorreo = establecimiento?.correo ? dominioDesdeCorreo(establecimiento.correo) : '';
  return [...new Set([enUso, porNombre, porCorreo].filter(Boolean))];
}

/** El dominio por defecto, o '' si no hay ninguno deducible. */
export function dominioSugerido(
  establecimiento: EstablecimientoParaDominio | null | undefined,
  correosExistentes: (string | null | undefined)[] = [],
): string {
  return dominiosSugeridos(establecimiento, correosExistentes)[0] ?? '';
}

/**
 * Completa el dominio cuando la persona escribió solo el nombre de usuario
 * ("encargado" → "encargado@laescuela.cl"). Si ya escribió un `@`, se respeta
 * tal cual: la sugerencia no puede pisar un dominio elegido a propósito.
 */
export function completarDominio(correo: string, dominio: string): string {
  const limpio = (correo ?? '').trim();
  if (!limpio || !dominio || limpio.includes('@')) return limpio;
  return `${limpio}@${dominio}`;
}
