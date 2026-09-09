import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CerrarConEsc } from '../../directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../directives/guardar-con-cmd-enter.directive';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CerrarConEsc, GuardarConCmdEnter],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModal {
  constructor(public confirmService: ConfirmService) {}
}
