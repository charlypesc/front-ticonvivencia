import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Credenciales } from '../../../core/models/usuario.model';
import { descargarPdf, imprimirPdf, pdfDesdeBase64 } from '../../utils/pdf-salida';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../directives/guardar-con-cmd-enter.directive';

/**
 * Muestra las credenciales recién emitidas y permite llevárselas en papel.
 *
 * Es la única vez que la contraseña se puede ver: el backend guarda el hash y
 * no hay endpoint que la relea. Por eso el modal no se cierra haciendo clic
 * afuera ni con el backdrop — sería demasiado fácil perderla de un clic
 * distraído y tener que restablecerla.
 */
@Component({
  selector: 'app-credenciales-modal',
  standalone: true,
  imports: [CommonModule, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './credenciales-modal.html',
  styleUrl: './credenciales-modal.scss',
})
export class CredencialesModal {
  @Input({ required: true }) credenciales!: Credenciales;
  /** Rol o roles ya legibles ("Inspector, Docente"), no códigos. Opcional. */
  @Input() rol = '';
  @Input() titulo = 'Usuario creado';
  @Output() cerrar = new EventEmitter<void>();

  /** Popover de exportación: en vez de descargar directo, se elige qué hacer. */
  mostrarExportar = signal(false);
  copiado = signal(false);

  async copiar() {
    try {
      await navigator.clipboard.writeText(
        `Usuario: ${this.credenciales.correo}\nContraseña: ${this.credenciales.password}`,
      );
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      // clipboard falla en contextos no seguros (http sin localhost). No es
      // motivo para molestar con un error: la clave está a la vista y se puede
      // copiar a mano o imprimir.
    }
  }

  /**
   * El comprobante lo armó el backend en el mismo request que generó la clave
   * y vino en esa respuesta: la contraseña no tiene que volver a viajar al
   * servidor para que alguien la imprima.
   */
  imprimir() {
    this.mostrarExportar.set(false);
    const pdf = this.pdf();
    if (pdf) imprimirPdf(pdf);
  }

  descargar() {
    this.mostrarExportar.set(false);
    const pdf = this.pdf();
    if (pdf)
      descargarPdf(pdf, this.credenciales.pdf_nombre ?? `credenciales-${this.credenciales.id_usuario}.pdf`);
  }

  /** Sin PDF (falló su armado en el servidor) el botón no se ofrece. */
  get hayPdf() {
    return !!this.credenciales.pdf_base64;
  }

  private pdf(): Blob | null {
    return this.credenciales.pdf_base64 ? pdfDesdeBase64(this.credenciales.pdf_base64) : null;
  }
}
