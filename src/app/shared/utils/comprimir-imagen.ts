/**
 * Bajarle el peso a las fotos antes de subirlas, en vez de rechazarlas.
 *
 * La persona saca la foto del acta con el teléfono y la sube tal cual: 6, 8, 12
 * MB. Pedirle que la achique antes es trasladarle un problema del sistema, así
 * que la achicamos nosotros. Un acta escaneada a 2200 px de lado mayor sigue
 * siendo perfectamente legible para el OCR y baja de varios MB a unos cientos
 * de KB.
 *
 * Los PDF pasan sin tocar (no se pueden recomprimir en el navegador sin una
 * librería pesada) y los HEIC que el navegador no sepa decodificar también:
 * esos los convierte el backend con heic-convert.
 */

/** Lado mayor máximo, en píxeles. Suficiente para OCR de un acta. */
const MAX_LADO = 2200;
const CALIDAD_JPEG = 0.82;

const esImagen = (file: File) =>
  file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

const cambiarExtension = (nombre: string, ext: string) =>
  nombre.replace(/\.[^.]+$/, '') + ext;

export async function comprimirImagen(file: File): Promise<File> {
  if (!esImagen(file)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Chrome/Firefox no decodifican HEIC: que lo resuelva el backend.
    return file;
  }

  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // Fondo blanco: si el original tiene transparencia (PNG), al pasar a JPEG
  // esas zonas quedarían negras.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG),
  );
  if (!blob) return file;

  // Si comprimir no ganó nada (foto ya chica y liviana), nos quedamos con el
  // original: tiene mejor calidad y el mismo peso.
  if (blob.size >= file.size && escala === 1) return file;

  return new File([blob], cambiarExtension(file.name, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
