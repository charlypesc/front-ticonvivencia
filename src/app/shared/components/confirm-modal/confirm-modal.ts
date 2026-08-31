import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, CerrarConEsc],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModal {
  constructor(public confirmService: ConfirmService) {}
}
