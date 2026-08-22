import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfidencialService } from '../../core/services/confidencial.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  loading = signal(true);
  resumen = signal<any>(null);
  usuario = computed(() => this.auth.usuario());

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private confidencial: ConfidencialService,
  ) {}

  ngOnInit() {
    this.api.getDashboard().subscribe({
      next: (data) => {
        this.resumen.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  esConfidencialBloqueado(r: any) {
    return this.confidencial.estaBloqueado(r);
  }

  abrirRegistro(r: any) {
    if (this.confidencial.bloqueaApertura(r)) return;
    // El id viaja por query param: la lista de registros es la dueña del
    // formulario, así que abrirlo desde acá es pedirle a ella que lo abra.
    this.router.navigate(['/registros'], { queryParams: { abrir: r.id_registro } });
  }
}
