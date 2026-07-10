import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Registros
  getRegistros() {
    return this.http.get<any[]>(`${this.base}/registros`);
  }
  getRegistro(id: number) {
    return this.http.get<any>(`${this.base}/registros/${id}`);
  }
  createRegistro(data: any) {
    return this.http.post(`${this.base}/registros`, data);
  }
  validarRegistro(id: number) {
    return this.http.patch(`${this.base}/registros/${id}/validar`, {});
  }

  // Estudiantes
  getEstudiantes() {
    return this.http.get<any[]>(`${this.base}/estudiantes`);
  }

  // Usuarios
  getUsuarios() {
    return this.http.get<any[]>(`${this.base}/usuarios`);
  }
  createUsuario(data: any) {
    return this.http.post(`${this.base}/usuarios`, data);
  }
  toggleUsuario(id: number) {
    return this.http.patch(`${this.base}/usuarios/${id}/toggle`, {});
  }
}
