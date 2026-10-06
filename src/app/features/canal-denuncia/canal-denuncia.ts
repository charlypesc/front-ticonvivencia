import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { AutoAjustarTextarea } from '../../shared/directives/auto-ajustar-textarea.directive';
import { comprimirImagen } from '../../shared/utils/comprimir-imagen';

const MAX_ARCHIVOS = 5;

/**
 * Formulario PÚBLICO del canal de denuncias (art. 46 letra e LGE, Ley 21.809).
 *
 * Se llega por el QR o el link del colegio, sin cuenta. Lo usan sobre todo
 * estudiantes desde el teléfono: lenguaje simple, una sola columna y lo mínimo
 * obligatorio (qué pasó). Lo demás ayuda, pero no puede ser una barrera para
 * contar algo.
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
  archivos = signal<File[]>([]);
  procesandoArchivos = signal(false);

  form = {
    modo: 'anonima' as 'anonima' | 'reservada',
    relato: '',
    lugar: '',
    fecha_hechos: '',
    personas_involucradas: '',
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

  /**
   * En Android, un input con capture + multiple puede disparar el change dos
   * veces: la traba evita procesar los mismos archivos dos veces, y el valor
   * se limpia apenas se toman los archivos (no al final).
   */
  async alElegirArchivos(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.dataset['subiendo'] === '1') return;
    const elegidos = Array.from(input.files ?? []);
    input.value = '';
    if (!elegidos.length) return;

    input.dataset['subiendo'] = '1';
    this.procesandoArchivos.set(true);
    try {
      const espacio = MAX_ARCHIVOS - this.archivos().length;
      if (elegidos.length > espacio)
        this.error.set(`Puedes adjuntar hasta ${MAX_ARCHIVOS} archivos en total`);
      const comprimidos = await Promise.all(elegidos.slice(0, Math.max(espacio, 0)).map(comprimirImagen));
      this.archivos.update((a) => [...a, ...comprimidos]);
    } finally {
      input.dataset['subiendo'] = '';
      this.procesandoArchivos.set(false);
    }
  }

  quitarArchivo(i: number) {
    this.archivos.update((a) => a.filter((_, j) => j !== i));
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

    const datos = new FormData();
    datos.append('modo', this.form.modo);
    datos.append('relato', this.form.relato.trim());
    datos.append('urgente', String(this.form.urgente));
    for (const campo of ['lugar', 'fecha_hechos', 'personas_involucradas'] as const)
      if (this.form[campo].trim()) datos.append(campo, this.form[campo].trim());
    // Con la denuncia anónima no se manda nada de la identidad, aunque se haya
    // escrito y después se haya cambiado de opción.
    if (this.form.modo === 'reservada')
      for (const campo of ['nombre', 'curso', 'contacto'] as const)
        if (this.form[campo].trim()) datos.append(campo, this.form[campo].trim());
    this.archivos().forEach((f) => datos.append('archivos', f, f.name));

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
    this.archivos.set([]);
    this.form = { ...this.form, relato: '', lugar: '', fecha_hechos: '', personas_involucradas: '', urgente: false };
  }
}
