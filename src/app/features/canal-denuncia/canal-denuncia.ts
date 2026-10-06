import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';

/**
 * Formulario PÚBLICO del canal de denuncias (art. 46 letra e LGE, Ley 21.809).
 *
 * Se llega por el QR o el link del colegio, sin cuenta. Lo usan sobre todo
 * estudiantes desde el teléfono: lenguaje simple y lo mínimo. La ley no exige
 * ningún dato en particular para denunciar, y pedir fecha, lugar, nombres y
 * pruebas a quien lo está pasando mal es cargarle el armado del caso. Por eso
 * hay un solo campo de relato y nada de adjuntos: las pruebas se piden después,
 * en el registro. Las fotos además pueden traer metadatos (GPS, modelo del
 * teléfono) que delatarían a quien denunció en forma anónima.
 */
@Component({
  selector: 'app-canal-denuncia',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoAjustarTextarea],
  templateUrl: './canal-denuncia.html',
  styleUrl: './canal-denuncia.scss',
})
export class CanalDenuncia implements OnInit {
  private token = '';
  colegio = signal('');
  cargando = signal(true);
  invalido = signal('');
  enviando = signal(false);
  error = signal('');
  codigo = signal('');

  form = {
    modo: 'anonima' as 'anonima' | 'reservada',
    relato: '',
    urgente: false,
    nombre: '',
    curso: '',
    contacto: '',
  };

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.api.getCanalPublico(this.token).subscribe({
      next: (c) => {
        this.colegio.set(c.nombre_establecimiento);
        this.cargando.set(false);
      },
      error: (err) => {
        this.invalido.set(err.error?.message ?? 'Este enlace de denuncias no existe o ya no está vigente');
        this.cargando.set(false);
      },
    });
  }

  enviar() {
    this.error.set('');
    if (this.form.relato.trim().length < 10) {
      this.error.set('Cuéntanos con un poco más de detalle qué pasó');
      return;
    }
    if (this.form.modo === 'reservada' && !this.form.nombre.trim()) {
      this.error.set('Para la denuncia con reserva de identidad necesitamos tu nombre');
      return;
    }

    const reservada = this.form.modo === 'reservada';
    const datos = {
      modo: this.form.modo,
      relato: this.form.relato.trim(),
      urgente: this.form.urgente,
      // Con la denuncia anónima no se manda nada de la identidad, aunque se haya
      // escrito y después se haya cambiado de opción.
      nombre: reservada ? this.form.nombre.trim() : undefined,
      curso: reservada ? this.form.curso.trim() || undefined : undefined,
      contacto: reservada ? this.form.contacto.trim() || undefined : undefined,
    };

    this.enviando.set(true);
    this.api.enviarDenuncia(this.token, datos).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.codigo.set(r.codigo);
        window.scrollTo({ top: 0 });
      },
      error: (err) => {
        this.enviando.set(false);
        this.error.set(err.error?.message ?? 'No pudimos enviar la denuncia. Intenta de nuevo en un momento.');
      },
    });
  }

  otraDenuncia() {
    this.codigo.set('');
    this.form = { ...this.form, relato: '', urgente: false };
  }
}
