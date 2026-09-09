import { Injectable, inject } from '@angular/core';
import jsPDF from 'jspdf';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.services';
import { formatearFecha, formatearFechasEnTexto } from '../../shared/utils/fecha';
import { etiquetaDe } from '../../shared/pipes/etiqueta.pipe';

/** Una sección del expediente: o son datos etiquetados, o es una lista de hechos. */
type Seccion =
  | { titulo: string; tipo: 'campos'; campos: { etiqueta: string; valor: string }[] }
  | { titulo: string; tipo: 'items'; items: Item[] };

/** Un hecho del expediente: un paso, una medida, un involucrado, una anotación. */
interface Item {
  titulo: string;
  /** Texto corto a la derecha del título (estado, cumplimiento, fecha). */
  marca?: string;
  /** Rojo cuando la marca es un incumplimiento; el resto va en gris. */
  alerta?: boolean;
  detalles?: string[];
}

/**
 * Da salida al expediente de un caso. Un solo formato: PDF.
 *
 * El expediente es el antecedente que se le entrega a la Superintendencia, al
 * sostenedor o a la familia, y ahí lo que importa es que el documento no se
 * pueda alterar después de emitido. Por eso no se ofrecen Word, HTML ni texto:
 * un expediente editable no prueba nada. Imprimir también pasa por el PDF, así
 * lo que se firma en papel es exactamente el archivo que se descarga.
 *
 * La ley no define un formato para estos antecedentes, así que el criterio es
 * que se lea como un expediente: qué protocolo, en qué versión, qué pasos, con
 * qué plazos y si se cumplieron.
 */
@Injectable({ providedIn: 'root' })
export class ExpedienteService {
  /** Para traer las actas firmadas que se anexan al final del documento. */
  private readonly api = inject(ApiService);

  // Paleta sobria: el documento es un antecedente formal, no una pantalla.
  private readonly TINTA: [number, number, number] = [17, 24, 39];
  private readonly GRIS: [number, number, number] = [107, 114, 128];
  private readonly LINEA: [number, number, number] = [209, 213, 219];
  private readonly ACENTO: [number, number, number] = [30, 64, 175];
  private readonly ALERTA: [number, number, number] = [185, 28, 28];

  private readonly MARGEN = 54;

  private fecha(f: any): string {
    return formatearFecha(f) || '—';
  }

  /**
   * Texto listo para el papel. Hace tres cosas que el expediente no puede
   * dejar pasar:
   *
   * 1. Traduce los códigos de la base: en el PDF no puede leerse
   *    `gestion_involucrado` ni `inicio_paso`, que son identificadores
   *    técnicos y no castellano.
   * 2. Formatea las fechas que el backend deja pegadas dentro de la frase.
   * 3. Saca los caracteres fuera de Latin-1 (flechas, comillas tipográficas).
   *    Con las fuentes estándar de jsPDF, un solo carácter así hace que toda
   *    la línea salga con las letras separadas y se vaya del margen — es lo
   *    que pasaba con el `→` de las transiciones.
   */
  private texto(valor: any, dominio?: string): string {
    const bruto = String(valor ?? '');
    // Un valor todo en minúscula y sin espacios es un código de la base, no
    // algo que escribió una persona: solo esos se traducen.
    const codigo = /^[a-z][a-z0-9_]*$/.test(bruto);
    return this.plano(codigo ? etiquetaDe(bruto, dominio) : formatearFechasEnTexto(bruto));
  }

  /**
   * Sólo el punto 3 de `texto()`. Se aplica además justo antes de dibujar,
   * porque los rótulos y separadores del propio documento ('—') tampoco están
   * en Latin-1 y romperían la línea igual que un dato del backend.
   */
  private plano(valor: any): string {
    return (
      String(valor ?? '')
        // macOS entrega las tildes descompuestas ("I" + acento suelto). Sin
        // recomponerlas, el filtro Latin-1 de abajo se lleva el acento y deja
        // la letra sola o partida: es lo que salía como "MARIÌ•A".
        .normalize('NFC')
    )
      .replace(/[→⇒⟶]/g, '->')
      .replace(/[←⇐]/g, '<-')
      .replace(/[–—]/g, '-')
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/[•●▪]/g, '·')
      .replace(/ /g, ' ')
      .replace(/[^\x00-\xFF]/g, '');
  }

  /**
   * "1 día hábil", "5 días hábiles". La unidad viaja como código de la base
   * ('dias_habiles'): antes se imprimía tal cual, con el guion bajo a la vista.
   */
  private plazo(p: any): string {
    if (!p?.plazo_valor) return 'sin plazo';
    // Las etiquetas del dominio están en plural ("días hábiles"), que es lo que
    // sirve casi siempre; el singular se resuelve acá, que es el único lugar
    // donde el valor y la unidad se leen juntos.
    const SINGULAR: Record<string, string> = {
      horas: 'hora',
      dias_habiles: 'día hábil',
      dias_corridos: 'día corrido',
    };
    const unidad = p.plazo_valor === 1
      ? (SINGULAR[p.plazo_unidad] ?? this.texto(p.plazo_unidad, 'plazo_unidad'))
      : this.texto(p.plazo_unidad, 'plazo_unidad');
    return this.plano(`${p.plazo_valor} ${unidad}`);
  }

  /** Estructura del expediente; es la fuente única del documento. */
  private secciones(e: any): Seccion[] {
    const fecha = (f: any) => this.fecha(f);
    const t = (v: any, dominio?: string) => this.texto(v, dominio);
    const cumplimiento: Record<string, string> = {
      en_plazo: 'Cumplido en plazo',
      fuera_de_plazo: 'Cumplido fuera de plazo',
      vencido: 'Vencido, sin cumplir',
      en_curso: 'En curso',
      sin_plazo: 'Sin plazo definido',
    };
    const incumple = (c: string) => c === 'fuera_de_plazo' || c === 'vencido';

    // Una persona del caso: nombre en el expediente completo, iniciales en el
    // redactado. Se resuelve acá porque medidas, suspensiones y gestiones traen
    // todas la misma forma.
    const nombreDe = (p: any) => {
      const quien = t(p?.nombre ?? p?.iniciales) || 'sin identificar';
      return p?.rol ? `${quien} (${t(p.rol, 'rol_involucrado')})` : quien;
    };

    // Había que notificar a esta persona y no consta que se hiciera. No detiene
    // el protocolo mientras corre, pero en el expediente se dice, porque es lo
    // que se va a revisar.
    const faltaConstancia = (p: any, g: any) =>
      !!p.requiere_notificacion && g.estado !== 'no_aplica' && !g.fecha_notificacion;

    // El número con que cada acta firmada queda anexada al final. Es la misma
    // lista y el mismo orden con que después se pegan las páginas, así que la
    // referencia del cuerpo apunta siempre al anexo correcto.
    const anexos = this.anexos(e);
    const anexoDe = (g: any) => {
      const i = anexos.findIndex((a) => a.id === g.adjunto?.id_paso_involucrado);
      return i >= 0 ? i + 1 : null;
    };

    const secciones: Seccion[] = [
      {
        titulo: 'Identificación del caso',
        tipo: 'campos',
        campos: [
          { etiqueta: 'Establecimiento', valor: t(e.establecimiento?.nombre) || '—' },
          { etiqueta: 'RBD', valor: String(e.establecimiento?.rbd ?? '—') },
          {
            etiqueta: 'Protocolo aplicado',
            valor: `${t(e.caso?.protocolo) || '—'} - versión ${e.caso?.version ?? '—'}`,
          },
          { etiqueta: 'Categoría (ley)', valor: t(e.caso?.categoria_ley, 'opcion_campo') || '—' },
          { etiqueta: 'Fecha de activación', valor: fecha(e.caso?.fecha_activacion) },
          {
            etiqueta: 'Estado',
            valor:
              `${t(e.caso?.estado, 'estado_caso') || '—'}` +
              (e.caso?.fecha_cierre ? ` (cerrado el ${fecha(e.caso.fecha_cierre)})` : ''),
          },
          // Por qué se cerró es lo primero que se pregunta cuando el caso no
          // llegó al paso final, así que va junto al estado y no en la bitácora.
          ...(e.caso?.motivo_cierre
            ? [{ etiqueta: 'Motivo del cierre', valor: t(e.caso.motivo_cierre) }]
            : []),
          {
            etiqueta: 'Plazo de investigación',
            valor: fecha(e.caso?.fecha_limite_investigacion),
          },
          { etiqueta: 'Protocolo activado por', valor: t(e.caso?.activado_por) || '—' },
        ],
      },
      // El antecedente inicial: cuándo entró el hecho al sistema y por quién.
      // Sin esto el expediente empieza en la activación, y la Superintendencia
      // pregunta por el paso anterior.
      {
        titulo: 'Antecedente inicial',
        tipo: 'campos',
        campos: [
          { etiqueta: 'Fecha del registro', valor: fecha(e.denuncia?.fecha_registro) },
          {
            etiqueta: 'Registrado por',
            valor: t(e.denuncia?.registrado_por_nombre) || t(e.denuncia?.registrado_por) || '—',
          },
          {
            etiqueta: 'Denunciante',
            valor:
              (e.denuncia?.denunciantes ?? [])
                .map((d: any) => t(d?.nombre ?? d?.iniciales))
                .filter(Boolean)
                .join(', ') || 'no se registró un denunciante',
          },
          // Sólo si lo hay: decir "sin documento digitalizado" es contestar una
          // pregunta que nadie hizo, y en un expediente cada línea se lee como
          // si acreditara algo.
          ...((e.denuncia?.documentos_origen ?? []).length
            ? [
                {
                  etiqueta: 'Documento de origen',
                  valor: (e.denuncia.documentos_origen as any[])
                    .map((d: any) => `${t(d.tipo_archivo)} (${fecha(d.fecha_subida)})`)
                    .join(', '),
                },
              ]
            : []),
        ],
      },
      {
        titulo: 'Hecho denunciado',
        tipo: 'campos',
        campos: [
          { etiqueta: 'Fecha del incidente', valor: fecha(e.hecho?.fecha_incidente) },
          {
            etiqueta: 'Tipo de falta',
            valor: `${t(e.hecho?.tipo_falta) || '—'} (${t(e.hecho?.gravedad, 'opcion_campo') || '—'})`,
          },
          { etiqueta: 'Asunto', valor: t(e.hecho?.asunto) || '—' },
          { etiqueta: 'Antecedentes', valor: t(e.hecho?.antecedentes) || '—' },
          { etiqueta: 'Acuerdos', valor: t(e.hecho?.acuerdos) || '—' },
        ],
      },
      {
        titulo: 'Involucrados',
        tipo: 'items',
        items: (e.involucrados ?? []).map((i: any) => ({
          titulo: i.iniciales ? t(i.iniciales) : t(i.nombre),
          marca: t(i.rol, 'rol_involucrado') || 'sin rol indicado',
          detalles: [
            t(i.tipo_persona, 'tipo_persona'),
            // En modo redactado no vienen: identifican a la persona.
            ...(i.rut ? [`RUT ${i.rut}`] : []),
            ...(i.curso ? [`Curso: ${t(i.curso)}`] : []),
          ].filter(Boolean),
        })),
      },
      {
        titulo: 'Pasos ejecutados',
        tipo: 'items',
        items: (e.pasos ?? []).map((p: any) => ({
          titulo: t(p.nombre),
          marca: cumplimiento[p.cumplimiento] ?? t(p.cumplimiento),
          alerta:
            incumple(p.cumplimiento) ||
            (p.gestiones ?? []).some((g: any) => faltaConstancia(p, g)),
          detalles: [
            `Estado: ${t(p.estado, 'estado_paso')} · Plazo: ${this.plazo(p)} · ` +
              `Vence: ${fecha(p.fecha_limite)} · Completado: ${fecha(p.fecha_completado)}` +
              (p.responsable ? ` · Responsable: ${t(p.responsable)}` : ''),
            ...(p.campos ?? [])
              .filter((c: any) => c.valor !== null && c.valor !== undefined && c.valor !== '')
              // El valor de un campo `seleccion` se guarda como código
              // ('tribunal_familia'): en el expediente va la etiqueta.
              .map((c: any) => `${t(c.etiqueta)}: ${t(c.valor, 'opcion_campo')}`),
            // La actuación persona por persona. Es lo que acredita la entrevista
            // y la notificación a cada familia, y el paso solo dice que "se
            // hizo": sin estas líneas no consta con quién.
            ...(p.gestiones ?? []).flatMap((g: any) => {
              const quien = nombreDe(g.involucrado);
              const cabeza =
                `${quien}: ${t(g.estado, 'estado_gestion')}` +
                (g.fecha_gestion ? ` · Gestión del ${fecha(g.fecha_gestion)}` : '') +
                // Cuándo y CÓMO se notificó, siempre juntos: la vía es lo que se
                // discute cuando el apoderado dice que nunca se enteró, y decir
                // sólo la fecha deja esa mitad sin acreditar.
                (g.fecha_notificacion
                  ? ` · Notificado el ${fecha(g.fecha_notificacion)} por ` +
                    (g.medio_notificacion
                      ? t(g.medio_notificacion, 'medio_notificacion')
                      : 'vía no registrada')
                  : faltaConstancia(p, g)
                    ? ' · SIN CONSTANCIA DE NOTIFICACIÓN'
                    : '') +
                // El acta firmada no se menciona y se deja fuera: va entera al
                // final del expediente, y acá queda el número con que se anexó.
                (g.adjunto
                  ? ` · Acta firmada${anexoDe(g) ? ` en anexo ${anexoDe(g)}` : ''}` +
                    (g.adjunto.nombre_archivo ? ` (${t(g.adjunto.nombre_archivo)})` : '')
                  : '');
              return [cabeza, ...(g.observacion ? [`   ${quien} — ${t(g.observacion)}`] : [])];
            }),
          ],
        })),
      },
      // Solo si el caso tuvo ramas descartadas. En un protocolo lineal la
      // sección no aporta nada y no se imprime.
      ...((e.pasos_no_aplicables ?? []).length
        ? [
            {
              titulo: 'Pasos que no correspondieron',
              tipo: 'items' as const,
              items: (e.pasos_no_aplicables ?? []).map((p: any) => ({
                titulo: t(p.nombre),
                marca: 'No aplicable',
                detalles: [t(p.motivo)],
              })),
            },
          ]
        : []),
      {
        titulo: 'Medidas de protección',
        tipo: 'items',
        items: (e.medidas_proteccion ?? []).map((m: any) => ({
          titulo: t(m.tipo, 'tipo_medida_proteccion') + (m.es_reaplicacion ? ' (reaplicación)' : ''),
          marca: t(m.estado, 'estado_medida'),
          detalles: [
            ...(m.persona ? [`Persona: ${nombreDe(m.persona)}`] : []),
            `Vigencia: ${fecha(m.fecha_inicio)} al ${fecha(m.fecha_termino)}`,
            ...(m.fundamento ? [`Fundamento: ${t(m.fundamento)}`] : []),
            // El seguimiento es la mitad de la obligación del art. 16 E letra j:
            // la medida sin él acredita que se suspendió, no que se acompañó.
            ...(m.seguimientos ?? []).map(
              (s: any) =>
                `Seguimiento ${fecha(s.fecha)} — ${t(s.tipo, 'tipo_seguimiento')}: ${t(s.descripcion)}`,
            ),
            ...((m.seguimientos ?? []).length === 0 ? ['Sin seguimientos registrados'] : []),
          ],
        })),
      },
      // Instituto distinto de la medida de protección (art. 6 letra d) del DFL
      // 2/1998): la decreta el director y tiene plazo fatal para resolver.
      {
        titulo: 'Suspensiones cautelares',
        tipo: 'items',
        items: (e.suspensiones_cautelares ?? []).map((s: any) => ({
          titulo: s.persona ? nombreDe(s.persona) : 'Suspensión cautelar',
          marca: t(s.estado, 'estado_suspension_cautelar'),
          alerta: s.estado === 'vencida',
          detalles: [
            `Notificada el ${fecha(s.fecha_notificacion)}` +
              (s.medio_notificacion
                ? ` (${t(s.medio_notificacion, 'medio_notificacion')})`
                : ''),
            `Plazo para resolver: ${fecha(s.fecha_limite_resolucion)} · ` +
              `Resuelta: ${fecha(s.fecha_resolucion)}`,
            `Fundamento: ${t(s.fundamento)}`,
            s.fecha_reconsideracion
              ? `Reconsideración presentada el ${fecha(s.fecha_reconsideracion)}` +
                (s.resultado_reconsideracion
                  ? ` — ${t(s.resultado_reconsideracion, 'resultado_reconsideracion')}`
                  : ' — sin resolver') +
                (s.fecha_consejo ? ` · Consejo de Profesores del ${fecha(s.fecha_consejo)}` : '')
              : `Sin reconsideración (plazo hasta ${fecha(s.fecha_limite_reconsideracion)})`,
            ...(s.consejo_profesores_acta
              ? [`Pronunciamiento del Consejo: ${t(s.consejo_profesores_acta)}`]
              : []),
            ...(s.decretada_por ? [`Decretada por: ${t(s.decretada_por)}`] : []),
          ],
        })),
      },
      {
        titulo: 'Medidas disciplinarias y sus resultados',
        tipo: 'items',
        items: (e.medidas_disciplinarias ?? []).map((m: any) => ({
          titulo: t(m.descripcion),
          marca: fecha(m.fecha_aplicacion),
          alerta: !m.resultado,
          detalles: [
            ...(m.persona ? [`Persona: ${nombreDe(m.persona)}`] : []),
            `Resultado: ${t(m.resultado) || 'sin registrar'}`,
          ],
        })),
      },
      // Solo cuando hubo: un expediente sin expulsión no gana nada con una
      // sección que diga que no hubo.
      ...(e.informe_expulsion
        ? [
            {
              titulo: 'Informe de expulsión o cancelación de matrícula',
              tipo: 'campos' as const,
              campos: [
                { etiqueta: 'Medida', valor: t(e.informe_expulsion.medida, 'opcion_campo') || '—' },
                {
                  etiqueta: 'Recomendación',
                  valor: t(e.informe_expulsion.recomendacion, 'opcion_campo') || '—',
                },
                {
                  etiqueta: 'Decisión del director',
                  valor: t(e.informe_expulsion.decision_director, 'opcion_campo') || 'pendiente',
                },
                { etiqueta: 'Emitido el', valor: fecha(e.informe_expulsion.fecha_emision) },
                {
                  // De esta notificación cuelgan el plazo de reconsideración y
                  // los 5 días para informar a la Superintendencia: la vía va
                  // junto a la fecha, porque es lo que se discute después.
                  etiqueta: 'Notificado al apoderado',
                  valor: e.informe_expulsion.fecha_notificacion_apoderado
                    ? `${fecha(e.informe_expulsion.fecha_notificacion_apoderado)} por ` +
                      (e.informe_expulsion.medio_notificacion_apoderado
                        ? t(e.informe_expulsion.medio_notificacion_apoderado, 'medio_notificacion')
                        : 'vía no registrada')
                    : '—',
                },
                {
                  etiqueta: 'Informado a la Superintendencia',
                  valor: fecha(e.informe_expulsion.fecha_informe_superintendencia),
                },
                {
                  etiqueta: 'Informado a la SEREMI',
                  valor: fecha(e.informe_expulsion.fecha_informe_seremi),
                },
              ],
            },
          ]
        : []),
      {
        titulo: 'Bitácora',
        tipo: 'items',
        items: (e.bitacora ?? []).map((b: any) => ({
          titulo: t(b.tipo_evento, 'tipo_evento'),
          marca: fecha(b.fecha),
          detalles: [
            t(b.descripcion) + (b.usuario ? ` (${t(b.usuario)})` : ''),
          ].filter((d) => d.trim()),
        })),
      },
      {
        titulo: 'Resumen de cumplimiento',
        tipo: 'campos',
        campos: [
          {
            etiqueta: 'Pasos que correspondían',
            valor: String(e.resumen_cumplimiento?.pasos_totales ?? 0),
          },
          ...(e.resumen_cumplimiento?.pasos_no_aplicables
            ? [
                {
                  etiqueta: 'Pasos de ramas no tomadas',
                  valor: String(e.resumen_cumplimiento.pasos_no_aplicables),
                },
              ]
            : []),
          { etiqueta: 'Cumplidos en plazo', valor: String(e.resumen_cumplimiento?.en_plazo ?? 0) },
          {
            etiqueta: 'Cumplidos fuera de plazo',
            valor: String(e.resumen_cumplimiento?.fuera_de_plazo ?? 0),
          },
          {
            etiqueta: 'Vencidos sin cumplir',
            valor: String(e.resumen_cumplimiento?.vencidos_abiertos ?? 0),
          },
          {
            etiqueta: 'Personas involucradas',
            valor: String(e.resumen_cumplimiento?.involucrados ?? 0),
          },
          {
            etiqueta: 'Gestiones por persona pendientes',
            valor: String(e.resumen_cumplimiento?.gestiones_pendientes ?? 0),
          },
          {
            etiqueta: 'Notificaciones sin constancia',
            valor: String(e.resumen_cumplimiento?.notificaciones_pendientes ?? 0),
          },
        ],
      },
    ];

    // Una sección vacía no se omite en silencio si es parte del cuerpo del
    // expediente: "sin medidas de protección" es información, no un hueco.
    return secciones.filter((s) => (s.tipo === 'campos' ? s.campos.length : true));
  }

  private titulo(e: any): string {
    return `${e.caso?.protocolo ?? 'Caso'} — versión ${e.caso?.version ?? '—'}`;
  }

  /** Nombre base del archivo. */
  private nombreArchivo(e: any): string {
    return `expediente-${e.caso?.id_protocolo_activado ?? 'caso'}`;
  }

  /** Descarga el expediente como PDF, con las actas firmadas anexadas. */
  async descargar(e: any) {
    const blob = await this.conAnexos(e);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.nombreArchivo(e)}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /**
   * Imprime el mismo PDF que se descarga. Antes la impresión armaba un HTML
   * aparte, y eso permitía que el papel y el archivo dijeran cosas distintas.
   */
  async imprimir(e: any) {
    const blob = await this.conAnexos(e);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // Bloqueado por el navegador: al menos que quede el archivo.
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.nombreArchivo(e)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    win.addEventListener('load', () => win.print(), { once: true });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // ── Anexos: las actas firmadas ──────────────────────────────────────────

  /**
   * Las actas de notificación firmadas que tiene el caso, en el orden en que se
   * anexan: por paso y, dentro del paso, por persona.
   *
   * En modo redactado la lista queda vacía a propósito — el backend no manda el
   * id de la gestión —, porque el acta escaneada trae el nombre, el RUT y la
   * firma de la persona: anexarla sería deshacer la redacción con la fotocopia.
   */
  private anexos(e: any): { id: number; paso: string; persona: string; mime: string }[] {
    return (e.pasos ?? []).flatMap((p: any) =>
      (p.gestiones ?? [])
        .filter((g: any) => g.adjunto?.id_paso_involucrado)
        .map((g: any) => ({
          id: g.adjunto.id_paso_involucrado as number,
          mime: String(g.adjunto.mime_type ?? ''),
          paso: this.plano(p.nombre),
          persona: this.plano(g.involucrado?.nombre ?? g.involucrado?.iniciales ?? 'sin identificar'),
        })),
    );
  }

  /**
   * El expediente con las actas firmadas pegadas al final.
   *
   * Van completas y no como una línea que dice que existen: el acta firmada es
   * la única prueba de que la persona recibió la notificación, y un expediente
   * que la nombra sin acompañarla obliga a pedir los archivos por separado.
   *
   * Si un acta no se puede traer o el archivo está roto, el expediente se emite
   * igual con una hoja que dice qué faltó. Perder el documento completo por un
   * adjunto ilegible sería el peor de los dos resultados.
   */
  private async conAnexos(e: any): Promise<Blob> {
    const doc = this.documento(e);
    const anexos = this.anexos(e);
    if (!anexos.length) return doc.output('blob');

    try {
      const pdf = await PDFDocument.load(doc.output('arraybuffer'));
      const normal = await pdf.embedFont(StandardFonts.Helvetica);
      const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

      for (let i = 0; i < anexos.length; i++) {
        const a = anexos[i];
        let error = '';
        let bytes: Uint8Array | null = null;
        try {
          const blob = await firstValueFrom(
            this.api.getActaFirmada(e.caso?.id_protocolo_activado, a.id),
          );
          bytes = new Uint8Array(await blob.arrayBuffer());
        } catch {
          error = 'No fue posible recuperar el archivo desde el sistema.';
        }

        this.portadaAnexo(pdf, negrita, normal, i + 1, a, error);
        if (!bytes) continue;

        try {
          if (a.mime === 'application/pdf') {
            const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
            for (const pagina of await pdf.copyPages(origen, origen.getPageIndices()))
              pdf.addPage(pagina);
          } else {
            const imagen = a.mime.includes('png')
              ? await pdf.embedPng(bytes)
              : await pdf.embedJpg(bytes);
            const pagina = pdf.addPage([612, 792]);
            // Se ajusta a la caja de la hoja conservando la proporción: el acta
            // escaneada tiene que leerse, no llenar la página.
            const escala = Math.min((612 - 72) / imagen.width, (792 - 72) / imagen.height, 1);
            pagina.drawImage(imagen, {
              x: (612 - imagen.width * escala) / 2,
              y: (792 - imagen.height * escala) / 2,
              width: imagen.width * escala,
              height: imagen.height * escala,
            });
          }
        } catch {
          this.notaAnexo(pdf, normal, 'El archivo adjunto no se pudo incorporar al expediente.');
        }
      }

      const bytes = await pdf.save();
      return new Blob([bytes.slice().buffer], { type: 'application/pdf' });
    } catch (err) {
      // El expediente vale por sí solo: si el armado del anexo falla, se emite
      // el documento sin las actas antes que no emitir nada.
      console.error('No se pudieron anexar las actas firmadas', err);
      return doc.output('blob');
    }
  }

  /** Hoja separadora: de quién es el acta que viene a continuación. */
  private portadaAnexo(
    pdf: PDFDocument,
    negrita: PDFFont,
    normal: PDFFont,
    numero: number,
    a: { paso: string; persona: string },
    error: string,
  ) {
    const pagina = pdf.addPage([612, 792]);
    const m = 54;
    let y = 720;
    const linea = (texto: string, fuente: PDFFont, tamano: number, gris = false) => {
      pagina.drawText(this.plano(texto), {
        x: m,
        y,
        size: tamano,
        font: fuente,
        color: gris ? rgb(0.42, 0.45, 0.5) : rgb(0.07, 0.09, 0.15),
      });
      y -= tamano + 8;
    };
    linea(`ANEXO ${numero}`, negrita, 10, true);
    y -= 8;
    linea('Acta de notificación firmada', negrita, 17);
    y -= 6;
    linea(`Paso: ${a.paso}`, normal, 11, true);
    linea(`Persona notificada: ${a.persona}`, normal, 11, true);
    if (error) linea(error, normal, 11);
  }

  /** Nota suelta cuando el archivo llegó pero no se pudo pegar. */
  private notaAnexo(pdf: PDFDocument, normal: PDFFont, texto: string) {
    pdf.addPage([612, 792]).drawText(this.plano(texto), {
      x: 54,
      y: 690,
      size: 11,
      font: normal,
      color: rgb(0.72, 0.11, 0.11),
    });
  }

  // ── Armado del documento ────────────────────────────────────────────────

  private documento(e: any): jsPDF {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const m = this.MARGEN;
    const util = ancho - m * 2;
    // Pie fijo: el cuerpo nunca baja de esta línea.
    const piso = alto - 56;

    let y = this.portada(doc, e, ancho, util);

    const salto = (necesario: number) => {
      if (y + necesario > piso) {
        doc.addPage();
        y = m + 10;
      }
    };

    for (const s of this.secciones(e)) {
      // Un título de sección solo, al final de la hoja, es un título huérfano:
      // se pide espacio para el título más su primera línea de contenido.
      salto(52);
      y = this.tituloSeccion(doc, s.titulo, y, util);

      if (s.tipo === 'campos') {
        for (const c of s.campos) {
          const etiquetaAncho = 132;
          const valor = doc.splitTextToSize(this.plano(c.valor) || '-', util - etiquetaAncho);
          salto(valor.length * 12 + 4);

          doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
          doc.text(this.plano(c.etiqueta).toUpperCase(), m, y);

          doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...this.TINTA);
          doc.text(valor, m + etiquetaAncho, y);
          y += valor.length * 12 + 5;
        }
        y += 8;
        continue;
      }

      if (!s.items.length) {
        salto(18);
        doc.setFontSize(9.5).setFont('helvetica', 'italic').setTextColor(...this.GRIS);
        doc.text('Sin registros.', m, y);
        y += 22;
        continue;
      }

      for (const item of s.items) {
        // Se mide antes de dibujar: el alto del bloque decide si cabe en la
        // hoja, y un bloque partido a la mitad deja el detalle sin su título.
        doc.setFontSize(8).setFont('helvetica', 'bold');
        const marca = this.plano(item.marca).toUpperCase();
        const marcaAncho = marca ? doc.getTextWidth(marca) + 12 : 0;

        doc.setFontSize(10).setFont('helvetica', 'bold');
        const titulo: string[] = doc.splitTextToSize(this.plano(item.titulo) || '-', util - marcaAncho - 20);

        doc.setFontSize(9).setFont('helvetica', 'normal');
        const detalles = (item.detalles ?? []).flatMap(
          (d) => doc.splitTextToSize(this.plano(d), util - 14) as string[],
        );
        salto(titulo.length * 12 + detalles.length * 11 + 14);

        const yBloque = y;

        doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(...this.TINTA);
        doc.text(titulo, m + 14, y);

        if (marca) {
          doc.setFontSize(8).setFont('helvetica', 'bold');
          doc.setTextColor(...(item.alerta ? this.ALERTA : this.GRIS));
          doc.text(marca, ancho - m, y, { align: 'right' });
        }
        y += titulo.length * 12 + 1;

        doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
        for (const linea of detalles) {
          doc.text(linea, m + 14, y);
          y += 11;
        }

        // Filete a la izquierda del bloque: separa un paso del siguiente sin
        // gastar el espacio de una línea completa entre ellos.
        doc.setDrawColor(...(item.alerta ? this.ALERTA : this.LINEA)).setLineWidth(2);
        doc.line(m + 2, yBloque - 8, m + 2, y - 6);

        y += 10;
      }
      y += 6;
    }

    this.pies(doc, e, ancho, alto);
    return doc;
  }

  /** Encabezado de la primera página: quién emite, qué documento y sobre qué caso. */
  private portada(doc: jsPDF, e: any, ancho: number, util: number): number {
    const m = this.MARGEN;
    let y = m + 6;

    doc.setFontSize(8.5).setFont('helvetica', 'bold').setTextColor(...this.GRIS);
    doc.text(this.plano(e.establecimiento?.nombre || 'Establecimiento').toUpperCase(), m, y);
    doc.text(`RBD ${e.establecimiento?.rbd ?? '-'}`, ancho - m, y, { align: 'right' });
    y += 10;

    doc.setDrawColor(...this.ACENTO).setLineWidth(1.5);
    doc.line(m, y, m + util, y);
    y += 26;

    doc.setFontSize(19).setFont('helvetica', 'bold').setTextColor(...this.TINTA);
    doc.text('Expediente del caso', m, y);
    y += 16;

    doc.setFontSize(10.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
    doc.text(doc.splitTextToSize(this.plano(this.titulo(e)), util), m, y);
    y += 18;

    doc.setFontSize(8.5);
    doc.text(`Emitido el ${this.fecha(e.emitido_el)}`, m, y);
    y += 18;

    if (e.modo === 'redactado') {
      // El modo redactado cambia lo que el documento prueba: tiene que verse
      // antes de leer una sola línea, no en una nota al pie.
      const etiqueta = 'DATOS PERSONALES RESGUARDADOS';
      doc.setFontSize(8).setFont('helvetica', 'bold');
      const anchoCaja = doc.getTextWidth(etiqueta) + 16;
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(217, 119, 6).setLineWidth(0.5);
      doc.roundedRect(m, y - 10, anchoCaja, 16, 3, 3, 'FD');
      doc.setTextColor(146, 64, 14);
      doc.text(etiqueta, m + 8, y);
      y += 16;
    }

    return y + 12;
  }

  private tituloSeccion(doc: jsPDF, titulo: string, y: number, util: number): number {
    const m = this.MARGEN;
    doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(...this.ACENTO);
    doc.text(this.plano(titulo).toUpperCase(), m, y);
    doc.setDrawColor(...this.LINEA).setLineWidth(0.5);
    doc.line(m, y + 6, m + util, y + 6);
    return y + 22;
  }

  /**
   * Pie en todas las páginas. Se escribe al final porque el "de N" no se sabe
   * hasta que el documento está completo.
   */
  private pies(doc: jsPDF, e: any, ancho: number, alto: number) {
    const m = this.MARGEN;
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...this.LINEA).setLineWidth(0.5);
      doc.line(m, alto - 42, ancho - m, alto - 42);
      doc.setFontSize(7.5).setFont('helvetica', 'normal').setTextColor(...this.GRIS);
      doc.text(
        this.plano(`Documento reservado · ${e.establecimiento?.nombre ?? ''} · ${this.nombreArchivo(e)}`),
        m,
        alto - 30,
      );
      doc.text(`Página ${p} de ${total}`, ancho - m, alto - 30, { align: 'right' });
    }
  }
}
