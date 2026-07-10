import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { RegistroForm } from './registros-form/registro-form';

@Component({
  selector: 'app-registros',
  standalone: true,
  imports: [CommonModule, FormsModule, RegistroForm],
  templateUrl: './registros.html',
  styleUrl: './registros.scss',
})
export class Registros implements OnInit {
  registros = signal<any[]>([]);
  loading = signal(true);
  busqueda = signal('');
  mostrarForm = signal(false);
  itemMove: any;
  filtrados = computed(() => {
    const q = this.busqueda().toLowerCase();
    return this.registros().filter(
      (r) =>
        r.tematica?.toLowerCase().includes(q) || r.tipo_falta_nombre?.toLowerCase().includes(q),
    );
  });

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getRegistros().subscribe({
      next: (data) => {
        this.registros.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm(item: any = null) {
    this.itemMove = item;
    this.mostrarForm.set(true);
  }
  cerrarForm() {
    this.mostrarForm.set(false);
    this.ngOnInit(); // recarga la lista
  }
}
