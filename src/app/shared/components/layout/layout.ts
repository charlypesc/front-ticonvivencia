import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from '../navbar/navbar';
import { Sidebar } from '../sidebar/sidebar';
import { ConfirmModal } from '../confirm-modal/confirm-modal';
import { ProgresoImportacion } from '../progreso-importacion/progreso-importacion';
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Navbar, Sidebar, ConfirmModal, ProgresoImportacion],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {}
