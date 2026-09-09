/**
 * Pasos que se resuelven aprobando o rechazando, en vez de completando un
 * formulario.
 *
 * Espejo de TIPOS_PASO_APROBACION en `backticonvivencia/src/utils/flujoProtocolo.js`.
 * Si allá se agrega uno, va también acá: el backend rechaza completar uno de
 * estos con la acción de completar, así que la pantalla tiene que ofrecer los
 * mismos botones que el motor espera.
 */
export const TIPOS_PASO_APROBACION = ['aprobacion', 'medida_disciplinaria', 'medida_cautelar'];

export const esPasoDeAprobacion = (tipo_paso?: string | null): boolean =>
  TIPOS_PASO_APROBACION.includes(tipo_paso ?? '');

/**
 * Qué clase de medida da por cumplido un paso.
 *
 * Espejo de TIPOS_MEDIDA_REQUERIDA en `flujoProtocolo.js`. Una clase por
 * instituto y ninguna cumple por otra: la medida de protección va a favor de la
 * persona afectada (Ley 21.809 art. 16 E letra j) y la suspensión cautelar recae
 * sobre el señalado dentro de un procedimiento sancionatorio (DFL 2/1998 art. 6
 * letra d). Decretar la cautelar no descarga el deber de proteger a la afectada.
 */
export type TipoMedidaRequerida = 'proteccion' | 'cautelar' | 'disciplinaria' | 'cualquiera';

/**
 * Un paso del caso que ordena una medida, tal como lo reciben las tarjetas.
 *
 * `tipo` en null es un paso definido antes de que la clase existiera: se
 * comporta como 'cualquiera', que es lo que hacía entonces.
 */
export interface PasoQueOrdenaMedida {
  id_activado_paso: number;
  nombre: string;
  pendiente: boolean;
  tipo: TipoMedidaRequerida | null;
}
