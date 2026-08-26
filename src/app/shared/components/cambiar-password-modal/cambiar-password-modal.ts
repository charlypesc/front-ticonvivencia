import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.services';

/** Mismo mínimo que valida el backend. Si cambia allá, cambia acá. */
const LARGO_MINIMO = 8;

/**
 * Cambio de la contraseña propia. Disponible para cualquier usuario con sesión
 * iniciada: no hay permiso que lo habilite, la guardia es la clave actual.
 *
 * Es la contraparte del documento que se entrega al crear el usuario: quien
 * llega con una clave impresa la reemplaza acá por una que solo él conoce.
 */
@Component({
  selector: 'app-cambiar-password-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cambiar-password-modal.html',
  styleUrl: './cambiar-password-modal.scss',
})
export class CambiarPasswordModal {
  @Output() cerrar = new EventEmitter<void>();

  form = { actual: '', nueva: '', confirmar: '' };

  /** Un ojo por campo: quien tipea desde un papel necesita verificar lo escrito. */
  ver = { actual: false, nueva: false, confirmar: false };

  guardando = signal(false);
  error = signal('');
  listo = signal(false);

  constructor(private api: ApiService) {}

  guardar() {
    this.error.set('');
    const { actual, nueva, confirmar } = this.form;

    if (!actual || !nueva || !confirmar) {
      this.error.set('Completa los tres campos');
      return;
    }
    // Se compara acá y no solo en el servidor porque el backend nunca ve
    // `confirmar`: es una verificación de tipeo, no una regla de negocio.
    if (nueva !== confirmar) {
      this.error.set('La nueva contraseña y su confirmación no coinciden');
      return;
    }
    if (nueva.length < LARGO_MINIMO) {
      this.error.set(`La nueva contraseña debe tener al menos ${LARGO_MINIMO} caracteres`);
      return;
    }
    if (nueva === actual) {
      this.error.set('La nueva contraseña debe ser distinta de la actual');
      return;
    }

    this.guardando.set(true);
    this.api
      .cambiarPassword(actual, nueva)
      .subscribe({
        // No se cierra sola ni se fuerza un logout: el token sigue siendo
        // válido y desloguear a alguien que acaba de acertar su clave actual
        // parecería un error del sistema. Se confirma y la persona sigue.
        next: () => this.listo.set(true),
        error: (err) => this.error.set(err.error?.message ?? 'No se pudo cambiar la contraseña'),
      })
      .add(() => this.guardando.set(false));
  }
}
