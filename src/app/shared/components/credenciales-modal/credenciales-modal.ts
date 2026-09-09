import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Credenciales } from '../../../core/models/usuario.model';
import type { VarianteCredenciales } from '../../utils/credenciales-pdf';
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
  /** Nombre del colegio, para encabezar el documento. Opcional. */
  @Input() establecimiento = '';
  /** Rol o roles ya legibles ("Inspector, Docente"), no códigos. Opcional. */
  @Input() rol = '';
  @Input() titulo = 'Usuario creado';
  /**
   * Qué documento se emite. Cambia el saludo y la advertencia del PDF: recibir
   * una cuenta nueva no es lo mismo que enterarse de que te cambiaron la clave.
   */
  @Input() variante: VarianteCredenciales = 'creacion';
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

  async imprimir() {
    this.mostrarExportar.set(false);

    const url = URL.createObjectURL((await this.pdf()).output('blob'));

    // Un iframe oculto y no window.open(): los bloqueadores de popups matan la
    // ventana nueva sin avisar, y el usuario se queda mirando un botón que "no
    // hace nada". El iframe siempre está permitido.
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
      // El iframe no se puede quitar en cuanto vuelve print(): el diálogo es
      // asíncrono y desmontarlo antes cancela la impresión.
      setTimeout(() => {
        marco.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };

    document.body.appendChild(marco);
  }

  async descargar() {
    this.mostrarExportar.set(false);
    const { nombreArchivoCredenciales } = await import('../../utils/credenciales-pdf');
    (await this.pdf()).save(nombreArchivoCredenciales(this.credenciales.correo));
  }

  /**
   * El documento se arma como PDF y no como HTML: es lo que la gente espera al
   * "descargar un comprobante", se abre igual en cualquier equipo o teléfono y
   * al imprimirlo no depende de los márgenes ni del zoom que traiga el
   * navegador de turno.
   *
   * jsPDF se carga bajo demanda: pesa bastante y este modal aparece unas pocas
   * veces al año, no tiene por qué estar en el bundle inicial de la app.
   */
  private async pdf() {
    const { construirCredencialesPdf } = await import('../../utils/credenciales-pdf');
    return construirCredencialesPdf({
      correo: this.credenciales.correo,
      nombre: this.credenciales.nombre,
      password: this.credenciales.password,
      establecimiento: this.establecimiento,
      rol: this.rol,
      variante: this.variante,
    });
  }
}
