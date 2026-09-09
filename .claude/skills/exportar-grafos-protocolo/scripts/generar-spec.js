/**
 * Escribe el spec temporal que dibuja los grafos dentro de Chrome.
 *
 * El layout del diagrama (niveles, carriles, rótulos) vive en el componente
 * `GrafoProtocolo` y depende de medir texto en el navegador, así que la única
 * forma de obtener el dibujo de verdad —el mismo que ve el usuario— es
 * renderizar el componente. Un spec de Karma es la vía más corta: `ng test` ya
 * levanta Chrome headless con el proyecto compilado, sin tocar angular.json ni
 * agregar dependencias.
 *
 *   node generar-spec.js <grafos.json> <ruta-del-spec.ts> [url-receptor]
 */
const fs = require('fs');

const [datosPath, specPath, receptor = 'http://localhost:4599'] = process.argv.slice(2);
if (!datosPath || !specPath) {
  console.error('Uso: node generar-spec.js <grafos.json> <ruta-del-spec.ts> [url-receptor]');
  process.exit(1);
}

const datos = fs.readFileSync(datosPath, 'utf8');

const spec = `import { TestBed } from '@angular/core/testing';
import { GrafoProtocolo } from './grafo-protocolo';
import { etiquetaDe, humanizar } from '../../pipes/etiqueta.pipe';

// ARCHIVO TEMPORAL, generado por la skill exportar-grafos-protocolo.
// Se borra al terminar la exportación; no lo commitees.
const PROTOCOLOS: any[] = ${datos};
const RECEPTOR = '${receptor}';

/** Ancho mínimo de la página: un grafo angosto no puede dejar el título
 *  partido en cinco líneas. */
const ANCHO_MIN = 620;
const PAD = 20;
const HUECO_TITULO = 14;

describe('exportar grafos de protocolo', () => {
  for (const proto of PROTOCOLOS) {
    it('dibuja ' + proto.slug, async () => {
      // Mismo mapeo que hace la pantalla del editor de flujo
      // (features/protocolo-flujo/protocolo-flujo.ts): si eso cambia, esto
      // también, o la imagen deja de ser lo que ve el usuario.
      const etiquetas = new Map<string, string>([['aprobado', '¿Aprobado?']]);
      for (const c of proto.campos)
        if (c.codigo) etiquetas.set(c.codigo, c.etiqueta || humanizar(c.codigo));

      const legible = (condicion?: string | null) => {
        if (!condicion) return '';
        const [codigo, valor] = condicion.split('=');
        const campo = etiquetas.get((codigo ?? '').trim()) ?? humanizar(codigo ?? '');
        const v = (valor ?? '').trim();
        if (!v) return campo;
        return campo + ' = ' + etiquetaDe(v, 'opcion_campo');
      };

      const nodos = proto.pasos.map((p: any) => ({
        id: p.id_paso,
        nombre: p.nombre,
        tipo_paso: p.tipo_paso,
        es_paso_inicial: p.es_paso_inicial,
        es_paso_final: p.es_paso_final,
        plazo: p.plazo_valor ? p.plazo_valor + ' ' + etiquetaDe(p.plazo_unidad, 'plazo_unidad') : undefined,
        por_involucrado_rol: p.por_involucrado_rol,
        requiere_notificacion: p.requiere_notificacion,
        accion_al_vencer: p.accion_al_vencer,
      }));
      const aristas = proto.transiciones.map((t: any) => ({
        origen: t.id_paso_origen,
        destino: t.id_paso_destino,
        condicion: t.condicion,
        condicion_legible: legible(t.condicion),
        etiqueta: t.etiqueta,
        es_default: t.es_default,
      }));

      await TestBed.configureTestingModule({ imports: [GrafoProtocolo] }).compileComponents();
      const fixture = TestBed.createComponent(GrafoProtocolo);
      fixture.componentRef.setInput('nodos', nodos);
      fixture.componentRef.setInput('aristas', aristas);
      // Sin la barra de acciones: la imagen es para leer el protocolo, no para
      // editarlo, y los botones son HTML por fuera del SVG (no saldrían).
      fixture.componentRef.setInput('acciones', false);
      fixture.detectChanges();

      const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
      expect(svg).toBeTruthy();

      // El CSS del componente vive en las hojas que Karma inyectó en la página;
      // sin copiarlo, el SVG suelto sale sin colores ni tipografías.
      let css = '';
      for (const hoja of Array.from(document.styleSheets) as CSSStyleSheet[]) {
        try {
          for (const regla of Array.from(hoja.cssRules)) css += regla.cssText + '\\n';
        } catch {}
      }

      const anchoSvg = Math.ceil(svg.width.baseVal.value);
      const altoSvg = Math.ceil(svg.height.baseVal.value);
      const ancho = Math.max(anchoSvg, ANCHO_MIN);

      const estiloTitulo =
        'margin:0;font:600 20px/1.3 system-ui,-apple-system,\\'Segoe UI\\',Roboto,sans-serif;color:#1e3a6e;width:' +
        ancho + 'px';

      // El alto del título se mide de verdad y no se estima: los nombres van de
      // cuatro palabras a dos renglones largos, y con un alto fijo la captura
      // cortaba el diagrama o dejaba una franja blanca abajo.
      const medidor = document.createElement('h1');
      medidor.setAttribute('style', estiloTitulo);
      medidor.textContent = proto.nombre;
      document.body.appendChild(medidor);
      const altoTitulo = medidor.offsetHeight;
      medidor.remove();

      // La captura se hace por fuera, con Chrome: se le deja acá la medida
      // exacta de la página para que no invente una ventana ni haya que
      // recortar la imagen después.
      const w = ancho + PAD * 2;
      const h = altoTitulo + HUECO_TITULO + altoSvg + PAD * 2;

      const html =
        '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
        '<meta name="captura" content="' + w + ',' + h + '">' +
        '<title>' + proto.nombre + '</title>' +
        '<style>' + css + '</style>' +
        '<style>body{margin:0;padding:' + PAD + 'px;background:#fff;' +
        'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}</style>' +
        '</head><body>' +
        '<h1 style="' + estiloTitulo + ';margin-bottom:' + HUECO_TITULO + 'px">' + proto.nombre + '</h1>' +
        svg.outerHTML +
        '</body></html>';

      await fetch(RECEPTOR + '/' + proto.slug, { method: 'POST', body: html });
      TestBed.resetTestingModule();
    });
  }
});
`;

fs.writeFileSync(specPath, spec);
console.log(`spec escrito en ${specPath} (${JSON.parse(datos).length} protocolos)`);
