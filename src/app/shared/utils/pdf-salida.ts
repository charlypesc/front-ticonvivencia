import { HttpResponse } from '@angular/common/http';

/**
 * Qué hacer con un PDF que ya armó el backend: descargarlo o mandarlo a
 * imprimir. Los PDF (expediente, acta de notificación, credenciales) se
 * generan en el servidor; acá solo se les da salida, siempre detrás del
 * popover Imprimir / Descargar.
 */

/** Descarga el PDF con su nombre. */
export function descargarPdf(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre el diálogo de impresión con el PDF.
 *
 * Un iframe oculto y no window.open(): los bloqueadores de popups matan la
 * ventana nueva sin avisar y el usuario se queda mirando un botón que "no hace
 * nada". El iframe siempre está permitido.
 */
export function imprimirPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const marco = document.createElement('iframe');
  marco.style.position = 'fixed';
  marco.style.right = '0';
  marco.style.bottom = '0';
  marco.style.width = '0';
  marco.style.height = '0';
  marco.style.border = '0';
  marco.src = url;

  // onload y no una llamada directa: sin esperar a que el visor de PDF
  // termine de cargar, Safari imprime una hoja en blanco.
  marco.onload = () => {
    marco.contentWindow!.focus();
    marco.contentWindow!.print();
    // No se desmonta en cuanto vuelve print(): el diálogo es asíncrono y
    // quitarlo antes cancela la impresión.
    setTimeout(() => {
      marco.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  document.body.appendChild(marco);
}

/** El PDF que viene en base64 dentro de un JSON (credenciales). */
export function pdfDesdeBase64(base64: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * El nombre del archivo que puso el backend en Content-Disposition. Prefiere
 * `filename*` (UTF-8, con tildes) y cae a `filename` o al valor por defecto.
 */
export function nombreDelPdf(resp: HttpResponse<Blob>, porDefecto: string): string {
  const cabecera = resp.headers.get('Content-Disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* cae al siguiente */
    }
  }
  const simple = /filename="?([^";]+)"?/i.exec(cabecera);
  return simple?.[1] ?? porDefecto;
}

/**
 * Con `responseType: 'blob'`, un error del backend llega como Blob y no como
 * JSON: sin esto el mensaje ("El registro de origen es confidencial") se
 * perdía y la pantalla decía un genérico.
 */
export async function mensajeDeErrorPdf(err: any, porDefecto: string): Promise<string> {
  try {
    if (err?.error instanceof Blob) return JSON.parse(await err.error.text())?.message ?? porDefecto;
  } catch {
    /* no era JSON */
  }
  return err?.error?.message ?? porDefecto;
}
