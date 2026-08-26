import { Component,inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';



@Component({
  selector: 'app-no-autorizado',
  imports: [],
  templateUrl: './no-autorizado.html',
  styleUrl: './no-autorizado.scss',
})
export class NoAutorizado {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  readonly volver= this.route.snapshot.queryParamMap.get('volver') ?? '/dashboard';
irAtras() {
  this.router.navigateByUrl(this.volver);
}
}