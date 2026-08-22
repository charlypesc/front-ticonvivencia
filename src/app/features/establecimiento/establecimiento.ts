import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';

@Component({
  selector: 'app-establecimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede],
  templateUrl: './establecimiento.html',
  styleUrl: './establecimiento.scss',
})
export class Establecimiento implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  loading = signal(true);
  error = signal('');
  success = signal('');

  // Contexto geográfico de solo lectura: el backend ya no devuelve `region` y
  // `comuna` como texto libre, sino `id_comuna` resuelto contra la jerarquía
  // País → Región → Provincia → Comuna del directorio oficial.
  ubicacion = signal<{ comuna?: string; provincia?: string; region?: string }>({});
  datosDirectorio = signal<{
    direccion?: string;
    telefono?: string;
    correo?: string;
    tipo_dependencia?: string;
    matriculas?: number | null;
  }>({});

  form = {
    nombre: '',
    rbd: '',
    id_comuna: null as number | null,
    direccion: '',
    telefono: '',
    correo: '',
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getEstablecimiento().subscribe({
      next: (data) => {
        this.form = {
          nombre: data.nombre,
          rbd: data.rbd,
          id_comuna: data.id_comuna ?? null,
          direccion: data.direccion ?? '',
          telefono: data.telefono ?? '',
          correo: data.correo ?? '',
        };
        this.datosDirectorio.set({
          direccion: data.direccion,
          telefono: data.telefono,
          correo: data.correo,
          tipo_dependencia: data.tipo_dependencia,
          matriculas: data.matriculas,
        });
        this.cargarUbicacion(data.id_comuna);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? 'Error al cargar el establecimiento');
        this.loading.set(false);
      },
    });
  }

  // Los nombres de comuna/provincia/región se resuelven contra el catálogo Geo,
  // en vez de venir escritos a mano en la fila del establecimiento.
  private cargarUbicacion(idComuna: number | null) {
    if (!idComuna) return;
    this.api.getComunas().subscribe({
      next: (comunas) => {
        const c = comunas.find((x: any) => x.id_comuna === idComuna);
        if (c) this.ubicacion.set({ comuna: c.nombre, provincia: c.provincia, region: c.region });
      },
      error: () => {},
    });
  }

  guardar() {
    this.error.set('');
    this.success.set('');
    if (!this.form.nombre || !this.form.rbd) {
      this.error.set('Nombre y RBD son requeridos');
      return;
    }

    this.api.updateEstablecimiento(this.form).subscribe({
      next: () => {
        this.success.set('Establecimiento actualizado');
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al guardar'),
    });
  }
}
