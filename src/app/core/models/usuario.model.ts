export interface Usuario {
  id: number;
  correo: string;
  rol: 'ENCARGADO' | 'DIRECTOR';
  id_establecimiento: number;
  nombre_establecimiento?: string;
}

export interface AuthResponse {
  token: string;
  usuario: Usuario;
}
