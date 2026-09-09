#!/bin/bash
#
# Convierte en JPG cada página que dejó el receptor.
#
# La medida de la ventana sale del <meta name="captura"> que el spec calculó
# midiendo el SVG y el título dentro del navegador: así la imagen sale del
# tamaño exacto del dibujo, sin franjas blancas ni recortes.
#
#   ./capturar.sh <carpeta-html> <carpeta-destino>
set -euo pipefail

HTML_DIR="${1:?Uso: capturar.sh <carpeta-html> <carpeta-destino>}"
DESTINO="${2:?Uso: capturar.sh <carpeta-html> <carpeta-destino>}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
# 2x: el texto del diagrama es de 11-13px y a 1x sale con los bordes sucios.
ESCALA="${ESCALA:-2}"

mkdir -p "$DESTINO"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for f in "$HTML_DIR"/*.html; do
  base="$(basename "$f" .html)"
  medida="$(grep -o '<meta name="captura" content="[0-9]*,[0-9]*"' "$f" | head -1 | grep -o '[0-9]*,[0-9]*')"
  if [ -z "$medida" ]; then
    echo "⚠️  $base sin medida de captura, se omite"
    continue
  fi
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor="$ESCALA" --window-size="$medida" \
    --screenshot="$TMP/$base.png" "file://$f" 2>/dev/null
  sips -s format jpeg -s formatOptions 90 --out "$DESTINO/$base.jpg" "$TMP/$base.png" >/dev/null
  echo "✔ $base.jpg (${medida/,/×} css px)"
done
