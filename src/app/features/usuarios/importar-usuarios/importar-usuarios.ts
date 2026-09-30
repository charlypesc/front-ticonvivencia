import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.services';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CerrarConEsc } from '../../../shared/directives/cerrar-con-esc.directive';
import { descargarPdf, imprimirPdf, pdfDesdeBase64 } from '../../../shared/utils/pdf-salida';

interface FilaConError {
  fila: number;
  correo: string | null;
  problemas: string[];
}

interface Creado {
  id_usuario: number;
  nombre: string;
  correo: string;
  rol: string;
  password: string;
}

/**
 * Carga masiva de usuarios: descargar la plantilla, pasársela a quien la
 * llene y subirla completa.
 *
 * El backend crea todos o ninguno. Si hay errores se listan por fila para
 * corregir el Excel y volver a subirlo entero. Si sale bien, se muestran las
 * claves (única vez, como en el alta de a uno) con un PDF de una hoja por
 * persona para imprimir y repartir.
 */
@Component({
  selector: 'app-importar-usuarios',
  standalone: true,
  imports: [CommonModule, CerrarConEsc],
  templateUrl: './importar-usuarios.html',
  styleUrls: [
    '../../../shared/components/credenciales-modal/credenciales-modal.scss',
    './importar-usuarios.scss',
  ],
})
export class ImportarUsuarios {
  @Output() cerrar = new EventEmitter<void>();
  /** Se emite al crear cuentas, para que la tabla de Usuarios se recargue. */
  @Output() importados = new EventEmitter<void>();

  private api = inject(ApiService);
  private confirm = inject(ConfirmService);

  descargando = signal(false);
  subiendo = signal(false);
  error = signal('');
  errores = signal<FilaConError[]>([]);
  creados = signal<Creado[]>([]);
  mostrarExportar = signal(false);
  private pdfBase64: string | null = null;
  private pdfNombre = 'credenciales-usuarios.pdf';

  descargarPlantilla() {
    this.descargando.set(true);
    this.api.descargarPlantillaUsuarios().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla-usuarios.xlsx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        this.descargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo descargar la plantilla');
        this.descargando.set(false);
      },
    });
  }

  subir(ev: Event) {
    const input = ev.target as HTMLInputElement;
    // Traba contra el doble disparo del change (Android): la segunda
    // invocación se ignora mientras la primera sigue en curso.
    if (input.dataset['subiendo'] === '1') return;
    const archivo = input.files?.[0];
    // Se limpia apenas se captura el archivo, no al terminar: así se puede
    // volver a elegir el mismo Excel después de corregirlo.
    input.value = '';
    if (!archivo) return;

    input.dataset['subiendo'] = '1';
    this.subiendo.set(true);
    this.error.set('');
    this.errores.set([]);

    const fd = new FormData();
    fd.append('archivo', archivo);
    this.api.importarUsuariosExcel(fd).subscribe({
      next: (r) => {
        this.creados.set(r.creados);
        this.pdfBase64 = r.pdf_base64;
        if (r.pdf_nombre) this.pdfNombre = r.pdf_nombre;
        this.importados.emit();
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'No se pudo importar el archivo');
        this.errores.set(err.error?.errores ?? []);
      },
    }).add(() => {
      delete input.dataset['subiendo'];
      this.subiendo.set(false);
    });
  }

  get hayPdf() {
    return !!this.pdfBase64;
  }

  imprimir() {
    this.mostrarExportar.set(false);
    if (this.pdfBase64) imprimirPdf(pdfDesdeBase64(this.pdfBase64));
  }

  descargar() {
    this.mostrarExportar.set(false);
    if (this.pdfBase64) descargarPdf(pdfDesdeBase64(this.pdfBase64), this.pdfNombre);
  }

  /**
   * Con cuentas recién creadas las claves no se vuelven a ver: cerrar tiene
   * que ser una decisión, igual que en el modal de credenciales.
   */
  async salir() {
    if (this.creados().length) {
      const ok = await this.confirm.confirmarAccion(
        'Las contraseñas no se vuelven a mostrar.\n\n' +
          '¿Ya imprimiste o descargaste el documento con las credenciales?',
      );
      if (!ok) return;
    }
    this.cerrar.emit();
  }
}
