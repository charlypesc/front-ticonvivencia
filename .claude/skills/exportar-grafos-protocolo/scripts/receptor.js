/**
 * Recibe las páginas que arma el spec dentro del navegador y las deja en disco.
 *
 * El diagrama se dibuja en Chrome (lo corre el test runner), y desde ahí no se
 * puede escribir un archivo: el navegador está en su sandbox. El puente más
 * corto es un POST a este servidor, que corre en el mismo equipo y sí escribe.
 *
 *   node receptor.js <carpeta-destino> [puerto]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const destino = process.argv[2];
const puerto = +(process.argv[3] ?? 4599);
if (!destino) {
  console.error('Uso: node receptor.js <carpeta-destino> [puerto]');
  process.exit(1);
}
fs.mkdirSync(destino, { recursive: true });

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();

    // El nombre del archivo viene en la URL; se lo limpia igual, que el slug lo
    // arma el nombre del protocolo y un `../` acá escribiría fuera de destino.
    const slug = path.basename(decodeURIComponent(req.url.replace(/^\//, ''))) || 'sin-nombre';
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      fs.writeFileSync(path.join(destino, `${slug}.html`), cuerpo);
      console.log(`recibido ${slug} (${cuerpo.length} bytes)`);
      res.end('ok');
    });
  })
  .listen(puerto, () => console.log(`receptor escuchando en ${puerto} → ${destino}`));
