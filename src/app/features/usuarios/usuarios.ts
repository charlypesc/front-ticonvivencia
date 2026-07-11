import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  usuarios = signal<any[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  error = signal('');
  success = signal('');

  form = {
    correo: '',
    password: '',
    rol: '' as 'ENCARGADO' | 'DIRECTOR' | '',
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.api.getUsuarios().subscribe({
      next: (data) => {
        this.usuarios.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.form = { correo: '', password: '', rol: '' };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
  }

  guardar() {
    this.error.set('');
    const { correo, password, rol } = this.form;

    if (!correo || !password || !rol) {
      this.error.set('Todos los campos son requeridos');
      return;
    }

    this.api.createUsuario({ correo, password, rol }).subscribe({
      next: () => {
        this.success.set('Usuario creado exitosamente');
        this.cerrarForm();
        this.cargar();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Error al crear usuario'),
    });
  }

  toggle(u: any) {
    this.api.toggleUsuario(u.id_usuario).subscribe({
      next: () => this.cargar(),
      error: () => this.error.set('Error al actualizar estado'),
    });
  }
}
