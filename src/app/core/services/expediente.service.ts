import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

/**
 * Da salida al expediente de un caso: impresión o PDF.
 *
 * El backend devuelve el expediente como datos; acá se le da forma de
 * documento. La misma estructura alimenta las dos salidas, así que lo que se
 * imprime y lo que se descarga no pueden divergir — que es justo el problema
 * cuando el PDF se arma por un lado y la vista de impresión por otro.
 *
 * La ley no define un formato para estos antecedentes, así que el criterio es
 * que se lea como un expediente: qué protocolo, en qué versión, qué pasos, con
 * qué plazos y si se cumplieron.
 */
@Injectable({ providedIn: 'root' })
export class ExpedienteService {
  /** Secciones de texto plano; es la fuente única de las dos salidas. */
  private secciones(e: any): { titulo: string; lineas: string[] }[] {
    const fecha = (f: any) => (f ? String(f).slice(0, 10) : '—');
    const cumplimiento: Record<string, string> = {
      en_plazo: 'cumplido en plazo',
      fuera_de_plazo: 'CUMPLIDO FUERA DE PLAZO',
      vencido: 'VENCIDO, sin cumplir',
      en_curso: 'en curso',
      sin_plazo: 'sin plazo definido',
    };

    return [
      {
        titulo: 'Identificación',
        lineas: [
          `Establecimiento: ${e.establecimiento?.nombre ?? '—'} (RBD ${e.establecimiento?.rbd ?? '—'})`,
          `Protocolo aplicado: ${e.caso?.protocolo ?? '—'} — versión ${e.caso?.version ?? '—'}`,
          `Categoría: ${e.caso?.categoria_ley ?? '—'}`,
          `Activado el: ${fecha(e.caso?.fecha_activacion)}`,
          `Estado: ${e.caso?.estado ?? '—'}${e.caso?.fecha_cierre ? ` (cerrado el ${fecha(e.caso.fecha_cierre)})` : ''}`,
          `Plazo máximo de investigación: ${fecha(e.caso?.fecha_limite_investigacion)}`,
          `Documento emitido el: ${fecha(e.emitido_el)}${e.modo === 'redactado' ? ' — versión con datos personales resguardados' : ''}`,
        ],
      },
      {
        titulo: 'Hecho',
        lineas: [
          `Fecha del incidente: ${fecha(e.hecho?.fecha_incidente)}`,
          `Tipo de falta: ${e.hecho?.tipo_falta ?? '—'} (${e.hecho?.gravedad ?? '—'})`,
          `Asunto: ${e.hecho?.asunto ?? '—'}`,
          `Antecedentes: ${e.hecho?.antecedentes ?? '—'}`,
          `Acuerdos: ${e.hecho?.acuerdos ?? '—'}`,
        ],
      },
      {
        titulo: 'Involucrados',
        lineas: (e.involucrados ?? []).map((i: any) =>
          i.iniciales
            ? `${i.iniciales} — ${i.rol_en_incidente ?? 'sin rol indicado'}`
            : `${i.nombre} ${i.apellido} (${i.run}) — ${i.rol_en_incidente ?? 'sin rol indicado'}`,
        ),
      },
      {
        titulo: 'Pasos ejecutados',
        lineas: (e.pasos ?? []).flatMap((p: any) => [
          `${p.nombre} [${p.estado}] — ${cumplimiento[p.cumplimiento] ?? p.cumplimiento}`,
          `    plazo: ${p.plazo ?? 'sin plazo'} · límite: ${fecha(p.fecha_limite)} · completado: ${fecha(p.fecha_completado)}` +
            (p.responsable ? ` · responsable: ${p.responsable}` : ''),
          ...(p.campos ?? [])
            .filter((c: any) => c.valor !== null && c.valor !== undefined && c.valor !== '')
            .map((c: any) => `    ${c.etiqueta}: ${c.valor}`),
        ]),
      },
      {
        titulo: 'Medidas de protección',
        lineas: (e.medidas_proteccion ?? []).map((m: any) =>
          `${m.tipo} — del ${fecha(m.fecha_inicio)} al ${fecha(m.fecha_termino)} [${m.estado}]` +
          (m.es_reaplicacion ? ' (reaplicación)' : '') +
          (m.fundamento ? `\n    fundamento: ${m.fundamento}` : ''),
        ),
      },
      {
        titulo: 'Medidas disciplinarias y sus resultados',
        lineas: (e.medidas_disciplinarias ?? []).map((m: any) =>
          `${fecha(m.fecha_aplicacion)} — ${m.descripcion}\n    resultado: ${m.resultado ?? 'SIN REGISTRAR'}`,
        ),
      },
      {
        titulo: 'Bitácora',
        lineas: (e.bitacora ?? []).map((b: any) =>
          `${fecha(b.fecha)} — ${b.tipo_evento}: ${b.descripcion ?? ''}${b.usuario ? ` (${b.usuario})` : ''}`,
        ),
      },
      {
        titulo: 'Resumen de cumplimiento',
        lineas: [
          `Pasos totales: ${e.resumen_cumplimiento?.pasos_totales ?? 0}`,
          `Cumplidos en plazo: ${e.resumen_cumplimiento?.en_plazo ?? 0}`,
          `Cumplidos fuera de plazo: ${e.resumen_cumplimiento?.fuera_de_plazo ?? 0}`,
          `Vencidos sin cumplir: ${e.resumen_cumplimiento?.vencidos_abiertos ?? 0}`,
        ],
      },
    ].filter((s) => s.lineas.length > 0);
  }

  private titulo(e: any): string {
    return `Expediente — ${e.caso?.protocolo ?? 'caso'} v${e.caso?.version ?? ''}`;
  }

  /** Abre el expediente en una ventana y dispara el diálogo de impresión. */
  imprimir(e: any) {
    const esc = (t: string) =>
      String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const cuerpo = this.secciones(e)
      .map(
        (s) =>
          `<h2>${esc(s.titulo)}</h2><ul>${s.lineas
            .map((l) => `<li>${esc(l).replace(/\n/g, '<br>')}</li>`)
            .join('')}</ul>`,
      )
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>${esc(this.titulo(e))}</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 32px; color: #111; font-size: 12px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        ul { margin: 0; padding-left: 18px; }
        li { margin-bottom: 4px; white-space: pre-wrap; }
      </style></head><body>
      <h1>${esc(this.titulo(e))}</h1>
      ${cuerpo}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  descargar(e: any) {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const margen = 48;
    const ancho = doc.internal.pageSize.getWidth() - margen * 2;
    const alto = doc.internal.pageSize.getHeight() - margen;
    let y = margen;

    const salto = (necesario: number) => {
      if (y + necesario > alto) {
        doc.addPage();
        y = margen;
      }
    };

    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text(this.titulo(e), margen, y);
    y += 22;

    for (const s of this.secciones(e)) {
      salto(30);
      doc.setFontSize(11).setFont('helvetica', 'bold');
      doc.text(s.titulo, margen, y);
      y += 14;

      doc.setFontSize(9).setFont('helvetica', 'normal');
      for (const linea of s.lineas) {
        // splitTextToSize respeta los \n propios y además corta por ancho: sin
        // esto, una línea larga se sale de la hoja en vez de envolverse.
        for (const trozo of doc.splitTextToSize(linea, ancho)) {
          salto(12);
          doc.text(trozo, margen, y);
          y += 11;
        }
      }
      y += 8;
    }

    doc.save(`expediente-${e.caso?.id_protocolo_activado ?? 'caso'}.pdf`);
  }
}
