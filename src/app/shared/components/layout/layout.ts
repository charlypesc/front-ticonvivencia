import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from '../navbar/navbar';
import { Sidebar } from '../sidebar/sidebar';
import { ConfirmModal } from '../confirm-modal/confirm-modal';
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Navbar, Sidebar, ConfirmModal],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {}
