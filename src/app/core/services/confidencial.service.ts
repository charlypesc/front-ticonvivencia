import { Injectable } from '@angular/core';
import { ConfirmService } from './confirm.service';

// Un registro confidencial se puede listar desde varias pantallas (registros,
// dashboard, consultar RUT). Sin esto cada una repetía el chequeo a su manera y
// alguna quedaba afuera: la de consultar RUT dejaba abrir el formulario igual.
@Injectable({ providedIn: 'root' })
export class ConfidencialService {
  constructor(private confirmService: ConfirmService) {}

  // El backend marca con contenido_oculto lo que entrega recortado. No se
  // deduce de los campos que falten: cada consulta devuelve columnas distintas.
  estaBloqueado(registro: any): boolean {
    return !!registro?.contenido_oculto;
  }

  // El autor y la fecha van en el aviso porque son la salida práctica del
  // bloqueo: sin ellos el usuario ve una pared y no sabe a quién pedirle
  // acceso. USUARIO no guarda nombre, así que el correo es el identificador.
  private formatearFecha(valor: any): string | null {
    if (!valor) return null;
    return new Date(valor).toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private linea(etiqueta: string, correo: any, valorFecha: any): string | null {
    const fecha = this.formatearFecha(valorFecha);
    if (correo && fecha) return `${etiqueta} por ${correo} el ${fecha}.`;
    if (correo) return `${etiqueta} por ${correo}.`;
    if (fecha) return `${etiqueta} el ${fecha}.`;
    return null;
  }

  private autoria(registro: any): string {
    return [
      this.linea('Primer registro', registro?.autor_correo, registro?.fecha_creacion),
      // La línea de modificación solo aparece si el registro fue editado alguna
      // vez: en uno intacto fecha_modificacion es NULL.
      this.linea(
        'Última modificación realizada',
        registro?.editor_correo,
        registro?.fecha_modificacion,
      ),
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Los involucrados no se ocultan: lo reservado es qué pasó, no quiénes están
  // en el caso. El backend los manda como alumno_nombre (listados) o como
  // arreglo estudiantes (detalle), así que se aceptan las dos formas.
  private involucrados(registro: any): string | null {
    if (registro?.alumno_nombre) return `Involucrados: ${registro.alumno_nombre}.`;

    const nombres = (registro?.estudiantes ?? [])
      .map((e: any) => `${e.nombre} ${e.apellido}`)
      .join(', ');
    return nombres ? `Involucrados: ${nombres}.` : null;
  }

  avisarBloqueado(registro: any) {
    const autoria = this.autoria(registro);
    const involucrados = this.involucrados(registro);

    return this.confirmService.avisar(
      `Este registro es confidencial y no puedes abrirlo.\n\n` +
        `Nota de quien lo registró:\n"${registro?.nota_confidencial ?? 'Sin nota'}"` +
        (involucrados ? `\n\n${involucrados}` : '') +
        (autoria ? `\n\n${autoria}` : ''),
      'Registro confidencial',
      'ti-lock',
    );
  }

  // Devuelve true si el llamador debe frenar: ya se le avisó al usuario.
  bloqueaApertura(registro: any): boolean {
    if (!this.estaBloqueado(registro)) return false;
    this.avisarBloqueado(registro);
    return true;
  }
}
