/**
 * Baja de la BD lo que el diagrama necesita para dibujarse, para uno, varios o
 * todos los protocolos genéricos.
 *
 * Son las mismas cuatro consultas que hace `getGrafo` en
 * `backticonvivencia/src/controllers/protocoloFlujo.controller.js`; se copian
 * acá en vez de levantar el backend porque la exportación es una tarea de
 * escritorio (no hay sesión, ni JWT, ni establecimiento) y pedirle al usuario
 * que tenga el server y el login andando para sacar una imagen es más frágil
 * que leer la BD directo.
 *
 *   node bajar-grafos.js <salida.json> [todos | 43 45 6 ...]
 */
const path = require('path');

const BACK = path.resolve(__dirname, '../../../../../backticonvivencia');
const mysql = require(`${BACK}/node_modules/mysql2/promise`);
require(`${BACK}/node_modules/dotenv`).config({ path: `${BACK}/.env` });
const fs = require('fs');

const [salida, ...args] = process.argv.slice(2);
if (!salida) {
  console.error('Uso: node bajar-grafos.js <salida.json> [todos | <id> <id> ...]');
  process.exit(1);
}
const todos = args.length === 0 || args[0] === 'todos';
const ids = todos ? null : args.map(Number);

/** `Protocolo de acoso escolar / bullying` → `protocolo-de-acoso-escolar-bullying`. */
const slugificar = (nombre) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

(async () => {
  const cx = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [protocolos] = todos
    ? await cx.query('SELECT id_protocolo, nombre FROM CATALOGO_PROTOCOLOS_GENERICOS ORDER BY nombre')
    : await cx.query(
        'SELECT id_protocolo, nombre FROM CATALOGO_PROTOCOLOS_GENERICOS WHERE id_protocolo IN (?) ORDER BY nombre',
        [ids],
      );

  const resultado = [];
  for (const proto of protocolos) {
    const id = proto.id_protocolo;
    const [pasos] = await cx.query(
      'SELECT * FROM CATALOGO_PROTOCOLO_PASO WHERE id_protocolo = ? ORDER BY orden_visual, id_paso',
      [id],
    );
    // Un protocolo sin pasos dibuja un lienzo vacío: no vale una imagen.
    if (pasos.length === 0) {
      console.log(`${id} :: ${proto.nombre} — SIN PASOS, se omite`);
      continue;
    }
    const [transiciones] = await cx.query(
      'SELECT * FROM CATALOGO_PROTOCOLO_TRANSICION WHERE id_protocolo = ? ORDER BY id_paso_origen, es_default, id_transicion',
      [id],
    );
    const [campos] = await cx.query(
      `SELECT c.* FROM CATALOGO_PROTOCOLO_PASO_CAMPO c
       JOIN CATALOGO_PROTOCOLO_PASO p ON p.id_paso = c.id_paso
       WHERE p.id_protocolo = ? ORDER BY c.orden, c.id_campo`,
      [id],
    );
    resultado.push({ id, nombre: proto.nombre, slug: slugificar(proto.nombre), pasos, transiciones, campos });
    console.log(`${id} :: ${proto.nombre} — ${pasos.length} pasos, ${transiciones.length} transiciones`);
  }

  fs.writeFileSync(salida, JSON.stringify(resultado));
  console.log(`\n${resultado.length} protocolos en ${salida}`);
  await cx.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
