/**
 * Correos de contacto comercial de Geo: tres plantillas (1 presentación,
 * 2 recordatorio, 3 nueva promoción) y el estado de cada establecimiento.
 *
 * Valores de `estado_correo`: 0 sin enviar, 1 1er correo enviado, 2 respondió,
 * 3 2do correo enviado, 4 3er correo enviado. El 2 quedó como "respondió"
 * porque así estaba guardado cuando había un solo correo; el orden en que se
 * muestran lo da `ESTADOS_CORREO`, no el número.
 */

export const ESTADO_SIN_ENVIAR = 0;
export const ESTADO_RESPONDIO = 2;

/** Estado que queda al enviar el correo N (1, 2 o 3). */
export const ESTADO_POR_CORREO: Record<number, number> = { 1: 1, 2: 3, 3: 4 };

/** Qué correo (1, 2 o 3) es el último enviado según el estado; 0 si ninguno. */
export const CORREO_POR_ESTADO: Record<number, number> = { 1: 1, 3: 2, 4: 3 };

/** En el orden en que se muestran en el selector. */
export const ESTADOS_CORREO = [
  { valor: 0, label: 'Sin enviar', icono: 'ti-mail' },
  { valor: 1, label: '1er correo enviado', icono: 'ti-mail-forward' },
  { valor: 3, label: '2do correo enviado', icono: 'ti-mail-forward' },
  { valor: 4, label: '3er correo enviado', icono: 'ti-mail-forward' },
  { valor: 2, label: 'Respondió', icono: 'ti-mail-check' },
];

/** Ya se le envió alguno de los tres correos (y no ha respondido). */
export function esCorreoEnviado(estado: number): boolean {
  return estado in CORREO_POR_ESTADO;
}

/**
 * Correo que conviene mandar ahora: el siguiente al último enviado. Si ya se
 * mandaron los tres, o ya respondió, se propone el 3ro / el 1ro respectivamente.
 */
export function siguienteCorreo(estado: number): number {
  const ultimo = CORREO_POR_ESTADO[estado] ?? 0;
  return Math.min(ultimo + 1, 3);
}

/**
 * Nombre del colegio para el saludo. El directorio de MINEDUC lo trae en
 * mayúsculas ("COLEGIO SAN JUAN DE LAS CONDES"), que en un correo se lee como
 * un grito: se pasa a "Colegio San Juan de Las Condes". Solo "de", "del", "y" y
 * "e" van en minúscula; los artículos (La, Las, Los, El) se dejan con mayúscula
 * porque casi siempre son parte de un nombre propio (Las Condes, La Florida).
 */
const CONECTORES = new Set(['de', 'del', 'y', 'e']);

export function nombreParaCorreo(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').replace(/\s+/g, ' ').trim();
  // Si ya viene con mayúsculas y minúsculas, alguien lo escribió a mano: se respeta.
  if (limpio !== limpio.toUpperCase()) return limpio;
  return limpio
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join(' ');
}

/** Reemplaza `{colegio}` en el asunto o cuerpo de una plantilla. */
export function aplicarPlantilla(texto: string, nombreColegio: string): string {
  return texto.replace(/\{colegio\}/gi, nombreParaCorreo(nombreColegio));
}
