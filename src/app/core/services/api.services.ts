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
  updateRegistro(data: any) {
    return this.http.put(`${this.base}/registros/${data.id_registro}`, data);
  }
  deleteRegistro(id: number) {
    return this.http.delete(`${this.base}/registros/${id}`);
  }
  // Estudiantes
  getEstudiantes() {
    return this.http.get<any[]>(`${this.base}/estudiantes`);
  }
  createEstudiante(data: any) {
    return this.http.post(`${this.base}/estudiantes`, data);
  }
  updateEstudiante(id: number, data: any) {
    return this.http.put(`${this.base}/estudiantes/${id}`, data);
  }
  toggleEstudiante(id: number) {
    return this.http.patch(`${this.base}/estudiantes/${id}/toggle`, {});
  }
  deleteEstudiante(id: number) {
    return this.http.delete(`${this.base}/estudiantes/${id}`);
  }
  getCursos() {
    return this.http.get<any[]>(`${this.base}/estudiantes/cursos`);
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

  //Faltas

  getTiposFalta() {
    return this.http.get<any[]>(`${this.base}/tipos-falta`);
  }
  createTipoFalta(data: any) {
    return this.http.post(`${this.base}/tipos-falta`, data);
  }
  updateTipoFalta(id: number, data: any) {
    return this.http.put(`${this.base}/tipos-falta/${id}`, data);
  }
  deleteTipoFalta(id: number) {
    return this.http.delete(`${this.base}/tipos-falta/${id}`);
  }
  //subir documento
  subirDocumento(archivo: FormData) {
    return this.http.post(`${this.base}/documents`, archivo);
  }

  confirmarRegistro(id: number, data: any) {
    return this.http.patch(`${this.base}/registros/${id}/confirmar`, data);
  }
  //consulta rut
  consultarRut(rut: string) {
    return this.http.get(`${this.base}/estudiantes/rut/${encodeURIComponent(rut)}`);
  }

  //dashboard

  getDashboard() {
    return this.http.get<any>(`${this.base}/dashboard`);
  }

  // Protocolos genéricos (catálogo)
  getProtocolosGenericos() {
    return this.http.get<any[]>(`${this.base}/protocolos-genericos`);
  }
  createProtocoloGenerico(data: any) {
    return this.http.post(`${this.base}/protocolos-genericos`, data);
  }
  updateProtocoloGenerico(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-genericos/${id}`, data);
  }
  deleteProtocoloGenerico(id: number) {
    return this.http.delete(`${this.base}/protocolos-genericos/${id}`);
  }

  // Protocolos del establecimiento
  getProtocolosEstablecimiento() {
    return this.http.get<any[]>(`${this.base}/protocolos-establecimiento`);
  }
  createProtocoloEstablecimiento(data: any) {
    return this.http.post(`${this.base}/protocolos-establecimiento`, data);
  }
  updateProtocoloEstablecimiento(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-establecimiento/${id}`, data);
  }
  deleteProtocoloEstablecimiento(id: number) {
    return this.http.delete(`${this.base}/protocolos-establecimiento/${id}`);
  }

  // Protocolos activados
  getProtocolosActivados() {
    return this.http.get<any[]>(`${this.base}/protocolos-activados`);
  }
  getProtocolosActivadosByRegistro(idRegistro: number) {
    return this.http.get<any[]>(`${this.base}/protocolos-activados/registro/${idRegistro}`);
  }
  createProtocoloActivado(data: any) {
    return this.http.post(`${this.base}/protocolos-activados`, data);
  }
  updateProtocoloActivado(id: number, data: any) {
    return this.http.put(`${this.base}/protocolos-activados/${id}`, data);
  }
  deleteProtocoloActivado(id: number) {
    return this.http.delete(`${this.base}/protocolos-activados/${id}`);
  }
}
