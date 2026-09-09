import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { formatearFecha } from '../../shared/utils/fecha';

/** Lo que se imprime en el acta. Lo arma la pantalla del caso. */
export interface DatosActa {
  establecimiento?: { nombre?: string; rbd?: string | number } | null;
  caso: { id: number; protocolo: string; asunto?: string; fecha_incidente?: string };
  paso: { nombre: string; descripcion?: string };
  persona: { nombre: string; rut?: string; curso?: string; rol?: string };
  /**
   * A quién se le entrega y quién firma.
   *
   * 'apoderado' no cambia de quién habla el acta —sigue siendo la del
   * estudiante involucrado— sino quién la recibe y la firma. Sus datos van en
   * blanco para llenar a mano: el sistema todavía no guarda al apoderado de
   * cada estudiante, y emitir el acta con el nombre del estudiante en la línea
   * de firma haría firmar a quien no corresponde.
   */
  destinatario?: 'estudiante' | 'apoderado';
  /** Las medidas que se le están notificando a esta persona. */
  medidas: { descripcion: string; tipo_medida?: string; fecha_aplicacion?: string }[];
  /** Plazo para pedir reconsideración, en texto. */
  plazo: string;
  /**
   * Quién notifica. El cargo va en el acta junto al nombre: la notificación la
   * hace el establecimiento a través de un funcionario determinado, y quien
   * revise el expediente tiene que poder ver en qué calidad actuó. El correo
   * queda como identificador de la cuenta que la emitió.
   */
  notificador: { nombre?: string; cargo?: string; correo: string };
}

/**
 * El acta de notificación que se imprime, se firma en papel y se vuelve a subir
 * escaneada.
 *
 * Existe porque la constancia que guarda el sistema (fecha + vía) prueba lo que
 * el establecimiento dice haber hecho, no lo que la persona reconoce haber
 * recibido. Lo segundo se prueba con una firma, y para firmar hace falta un
 * papel: este.
 *
 * Es una hoja y no un expediente a propósito: quien la firma tiene que poder
 * leer completo lo que se le notifica y en qué plazo puede reclamar.
 */
@Injectable({ providedIn: 'root' })
export class ActaNotificacionService {
  private readonly TINTA: [number, number, number] = [17, 24, 39];
  private readonly GRIS: [number, number, number] = [107, 114, 128];
  private readonly LINEA: [number, number, number] = [209, 213, 219];
  private readonly MARGEN = 56;

  /**
   * Las fuentes estándar de jsPDF sólo cubren Latin-1: un guion largo o unas
   * comillas tipográficas descuadran la línea entera. Tildes y ñ sí van.
   */
  private plano(valor: any): string {
    return (
      String(valor ?? '')
        // Las tildes descompuestas ("I" + acento suelto, como las manda macOS)
        // se recomponen antes de filtrar: si no, el filtro Latin-1 se lleva el
        // acento suelto y parte la palabra — "MARÍA" salía como "MARIÌ•A", y de
        // ahí pasaba al nombre del archivo.
        .normalize('NFC')
    )
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/→/g, '->')
      .replace(/[^\x00-\xFF]/g, '');
  }

  /**
   * "Notificacion Benjamin Aburto". Se nombra por la persona y no por el número
   * del caso: quien busca el archivo en la carpeta —o lo ve en la cola de
   * impresión— lo busca por el alumno, no por un id.
   */
  private nombreArchivo(d: DatosActa): string {
    const persona = this.plano(d.persona.nombre).replace(/[\\/:*?"<>|]/g, '').trim();
    const quien = d.destinatario === 'apoderado' ? 'Notificacion apoderado de' : 'Notificacion';
    return `${quien} ${persona || 'caso ' + d.caso.id}`;
  }

  descargar(d: DatosActa) {
    this.documento(d).save(`${this.nombreArchivo(d)}.pdf`);
  }

  /** Imprime exactamente el mismo PDF que se descarga. */
  imprimir(d: DatosActa) {
    const doc = this.documento(d);
    const url = URL.createObjectURL(doc.output('blob'));
    const win = window.open(url, '_blank');
    if (!win) {
      doc.save(`${this.nombreArchivo(d)}.pdf`);
      return;
    }
    win.addEventListener('load', () => win.print(), { once: true });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // ── Armado ────────────────────────────────────────────────────────────────

  private documento(d: DatosActa): jsPDF {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const ancho = doc.internal.pageSize.getWidth();
    const m = this.MARGEN;
    const util = ancho - m * 2;
    let y = m;

    const parrafo = (texto: string, tam = 10, estilo: 'normal' | 'bold' | 'italic' = 'normal',
                     color = this.TINTA) => {
      doc.setFontSize(tam).setFont('helvetica', estilo).setTextColor(...color);
      const lineas = doc.splitTextToSize(this.plano(texto), util) as string[];
      doc.text(lineas, m, y);
      y += lineas.length * (tam + 3) + 6;
    };

    const dato = (etiqueta: string, valor: any) => {
      const ancho_etiqueta = 120;
      doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
      doc.text(this.plano(etiqueta).toUpperCase(), m, y);
      doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(...this.TINTA);
      const lineas = doc.splitTextToSize(this.plano(valor) || '-', util - ancho_etiqueta) as string[];
      doc.text(lineas, m + ancho_etiqueta, y);
      y += lineas.length * 13 + 5;
    };

    const linea = () => {
      doc.setDrawColor(...this.LINEA).setLineWidth(0.7);
      doc.line(m, y, ancho - m, y);
      y += 16;
    };

    // Encabezado
    if (d.establecimiento?.nombre) {
      doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...this.TINTA);
      doc.text(this.plano(d.establecimiento.nombre), m, y);
      y += 14;
      if (d.establecimiento.rbd) {
        doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
        doc.text(`RBD ${this.plano(d.establecimiento.rbd)}`, m, y);
        y += 14;
      }
    }
    const alApoderado = d.destinatario === 'apoderado';
    doc.setFontSize(15).setFont('helvetica', 'bold').setTextColor(...this.TINTA);
    doc.text(alApoderado ? 'ACTA DE NOTIFICACION AL APODERADO' : 'ACTA DE NOTIFICACION', m, y + 8);
    y += 26;
    doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
    doc.text(this.plano(d.paso.nombre), m, y);
    y += 18;
    linea();

    // A quién y por qué. Al apoderado se lo identifica a mano —el sistema no lo
    // tiene— y el estudiante pasa a ser de quién es apoderado, no el notificado.
    const enBlanco = '______________________________________________';
    if (alApoderado) {
      dato('Apoderado de', d.persona.nombre);
      if (d.persona.rut) dato('RUT del estudiante', d.persona.rut);
      if (d.persona.curso) dato('Curso', d.persona.curso);
      if (d.persona.rol) dato('Calidad en el caso', d.persona.rol);
      dato('Nombre del apoderado', enBlanco);
      dato('RUT del apoderado', enBlanco);
    } else {
      dato('Notificado a', d.persona.nombre);
      if (d.persona.rut) dato('RUT', d.persona.rut);
      if (d.persona.curso) dato('Curso', d.persona.curso);
      if (d.persona.rol) dato('Calidad en el caso', d.persona.rol);
    }
    dato('Caso', `N° ${d.caso.id} - ${d.caso.protocolo}`);
    if (d.caso.asunto) dato('Asunto', d.caso.asunto);
    if (d.caso.fecha_incidente) dato('Fecha del hecho', formatearFecha(d.caso.fecha_incidente));
    dato('Fecha de notificacion', formatearFecha(new Date().toISOString(), true));
    y += 6;
    linea();

    // Lo que se notifica
    parrafo('SE NOTIFICA', 9, 'bold', this.GRIS);
    if (d.medidas.length) {
      for (const med of d.medidas) {
        parrafo(
          `- ${med.tipo_medida ? med.tipo_medida + ': ' : ''}${med.descripcion}` +
            (med.fecha_aplicacion ? ` (aplicada el ${formatearFecha(med.fecha_aplicacion)})` : ''),
        );
      }
    } else {
      // Sin medidas cargadas el acta se emite igual: se llena a mano antes de
      // firmar. Un acta que no se puede imprimir porque falta un dato deja al
      // establecimiento sin constancia, que es peor.
      parrafo('_______________________________________________________________________');
      parrafo('_______________________________________________________________________');
      parrafo('_______________________________________________________________________');
    }
    y += 4;

    parrafo('PLAZO PARA PEDIR RECONSIDERACION', 9, 'bold', this.GRIS);
    parrafo(d.plazo);
    y += 4;
    linea();

    // Firmas. Sin la del notificado el acta no prueba nada, así que va primero.
    // `detalle` acepta varias líneas: bajo la firma de quien notifica tienen que
    // ir su nombre y su cargo, no sólo el correo. Quien lee el acta después
    // —una superintendencia, un apoderado— necesita saber en qué calidad
    // notificó esa persona; el correo identifica la cuenta, no el rol.
    const firmar = (rotulo: string, detalle: string | string[], x: number, anchoFirma: number) => {
      doc.setDrawColor(...this.TINTA).setLineWidth(0.8);
      doc.line(x, y + 44, x + anchoFirma, y + 44);
      doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...this.TINTA);
      doc.text(this.plano(rotulo), x, y + 58);
      doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
      const lineas = (Array.isArray(detalle) ? detalle : [detalle])
        .filter(Boolean)
        .flatMap((t) => doc.splitTextToSize(this.plano(t), anchoFirma) as string[]);
      doc.text(lineas, x, y + 70);
    };
    const anchoFirma = (util - 24) / 2;
    firmar(
      alApoderado ? 'Firma del apoderado o adulto responsable' : 'Firma de quien recibe la notificacion',
      alApoderado ? `Apoderado de ${d.persona.nombre}` : d.persona.nombre,
      m,
      anchoFirma,
    );
    firmar(
      'Firma de quien notifica',
      [d.notificador.nombre ?? '', d.notificador.cargo ?? '', d.notificador.correo],
      m + anchoFirma + 24,
      anchoFirma,
    );
    y += 100;

    doc.setFontSize(8).setFont('helvetica', 'italic').setTextColor(...this.GRIS);
    const pie = doc.splitTextToSize(
      this.plano(
        'La negativa a firmar no invalida la notificacion: se deja constancia de ella en esta ' +
          'misma acta y en la bitacora del caso. Una copia queda en poder ' +
          (alApoderado ? 'del apoderado.' : 'de la persona notificada.'),
      ),
      util,
    ) as string[];
    doc.text(pie, m, y);

    return doc;
  }
}
