---
name: exportar-grafos-protocolo
description: Exporta el diagrama de flujo de uno, varios o todos los protocolos genéricos como imágenes JPG (con el nombre del protocolo como título). Usar cuando pidan "sacame un jpg del grafo", "exportá los diagramas de los protocolos", "quiero el flujo de X como imagen" o similar.
---

# Exportar los grafos de protocolo como JPG

Genera una imagen por protocolo con el **mismo diagrama que ve el usuario** en
`features/protocolo-flujo` (vista Diagrama), encabezada por el nombre del
protocolo.

## Por qué se hace así

El layout del diagrama (niveles, carriles de retroceso, dónde cae cada rótulo)
lo calcula `shared/components/grafo-protocolo` midiendo texto en el navegador.
No hay forma de reproducirlo desde Node sin reescribirlo, y una reescritura
paralela se desincroniza al primer ajuste. Entonces se renderiza el componente
de verdad dentro de Chrome headless, que `ng test` ya levanta.

Los datos se leen directo de la BD y no del backend: exportar es una tarea de
escritorio, sin sesión ni JWT, y exigir el server levantado + login para sacar
una imagen es más frágil.

El puente Chrome → disco es un POST a un servidor local (`receptor.js`): desde
el navegador no se puede escribir un archivo.

## Requisitos

- Node 20 (`nvm use v20.19.0`) — el node por defecto es viejo para el Angular CLI.
- `backticonvivencia/.env` con las credenciales de la BD (`DB_PASSWORD`, ojo: no
  se llama `DB_PASS`) y `backticonvivencia/node_modules` instalado: de ahí salen
  `mysql2` y `dotenv`.
- Google Chrome en `/Applications/Google Chrome.app` (o exportar `CHROME`).

## Pasos

Desde la raíz del front (`front-ticonvivencia`), con `SK` apuntando a esta skill
y `TMP` a una carpeta del scratchpad:

```bash
SK=.claude/skills/exportar-grafos-protocolo
TMP=/tmp/grafos-export           # mejor: la carpeta de scratchpad de la sesión
SPEC=src/app/shared/components/grafo-protocolo/tmp-exportar.spec.ts

# 1. Datos: 'todos', o los ids que se quieran (node bajar-grafos.js ... 43 45 6)
node $SK/scripts/bajar-grafos.js $TMP/grafos.json todos

# 2. Receptor en segundo plano (deja las páginas en $TMP/html)
node $SK/scripts/receptor.js $TMP/html &

# 3. Spec temporal + render en Chrome headless
node $SK/scripts/generar-spec.js $TMP/grafos.json $SPEC
source ~/.nvm/nvm.sh && nvm use v20.19.0
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx ng test --watch=false --browsers=ChromeHeadless --include='**/tmp-exportar.spec.ts'

# 4. JPG (a ~/Downloads salvo que pidan otra cosa)
bash $SK/scripts/capturar.sh $TMP/html ~/Downloads

# 5. Limpieza: el spec NO se commitea
rm $SPEC
kill $(lsof -ti :4599)
```

## Al terminar, siempre

1. **Borrar el spec temporal** (`tmp-exportar.spec.ts`) y bajar el receptor.
2. **Mirar al menos la imagen del protocolo con más pasos** antes de dar el
   trabajo por hecho. Los renders destapan defectos del diagrama que en pantalla
   pasan desapercibidos porque uno hace scroll: rótulos encimados, líneas que
   se pierden, códigos crudos de la BD escritos sobre una flecha. Si aparece
   algo así, se arregla el componente y se re-exporta — no se entrega la imagen
   con el defecto.
3. Decirle al usuario dónde quedaron los archivos y con qué medidas.

## Notas

- El nombre del archivo es el slug del nombre del protocolo
  (`protocolo-de-acoso-escolar-bullying.jpg`).
- El tamaño de la imagen lo decide el propio dibujo: el spec mide el SVG y el
  título dentro del navegador y lo deja en un `<meta name="captura">` que lee
  `capturar.sh`. No hay que recortar nada a mano.
- La escala es 2x (`ESCALA=1` para imágenes más livianas).
- El mapeo de pasos/transiciones a nodos/aristas está duplicado en
  `generar-spec.js` a propósito (el componente recibe datos ya normalizados).
  Si cambia el de `features/protocolo-flujo/protocolo-flujo.ts`, hay que
  actualizarlo acá también o la imagen deja de ser lo que ve el usuario.
