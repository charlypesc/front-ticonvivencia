import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { Usuario, AuthResponse } from '../models/usuario.model';
import { CODIGO_POR_ID, PermisoId } from '../constants/permisos';
import { environment } from '../../../environments/environment';

const ID_POR_CODIGO = new Map(
  Object.entries(CODIGO_POR_ID).map(([id, codigo]) => [codigo, Number(id)])
);

/**
 * Las sesiones guardadas en localStorage antes de este cambio traen los
 * permisos como códigos de texto. Se traducen al cargarlas para que el menú no
 * aparezca vacío hasta que la persona vuelva a entrar. Se puede borrar cuando
 * ya no queden sesiones viejas dando vueltas.
 */
function normalizarPermisos(permisos: unknown): number[] {
  if (!Array.isArray(permisos)) return [];
  return permisos
    .map((p) => (typeof p === 'number' ? p : ID_POR_CODIGO.get(p as string)))
    .filter((p): p is number => p !== undefined);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'tc_token';
  private readonly USER_KEY = 'tc_user';
  /** Establecimiento que el ADMIN eligió para navegar los módulos operativos. */
  private readonly EST_KEY = 'tc_est_activo';

  usuario = signal<Usuario | null>(this.loadUser());

  esAdmin = computed(() => this.usuario()?.es_admin === true);

  /**
   * El ADMIN no pertenece a ningún establecimiento: elige uno para navegar. El
   * resto queda fijado al suyo. Lo consume el interceptor de establecimiento.
   */
  establecimientoActivo = signal<number | null>(this.loadEstablecimiento());

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  login(correo: string, password: string) {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, { correo, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.TOKEN_KEY, res.token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.usuario));
          this.usuario.set(res.usuario);
          this.setEstablecimientoActivo(res.usuario.id_establecimiento);
        }),
        // El ADMIN llega con id_establecimiento null y el backend le responde 400
        // en todos los módulos operativos hasta que elija uno. Si tuviera que
        // descubrir el selector del navbar por su cuenta, entraría a un sistema
        // que parece roto: se le preselecciona el primer establecimiento y desde
        // ahí puede cambiarlo.
        switchMap((res) => {
          if (!res.usuario.es_admin || this.establecimientoActivo() !== null) return of(res);
          return this.http.get<any[]>(`${environment.apiUrl}/establecimientos`).pipe(
            tap((ests) => {
              if (ests.length > 0) this.setEstablecimientoActivo(ests[0].id_establecimiento);
            }),
            // Que falle la preselección no debe impedir iniciar sesión: el
            // selector del navbar sigue estando para elegir a mano.
            catchError(() => of(null)),
            switchMap(() => of(res)),
          );
        }),
      );
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.EST_KEY);
    this.usuario.set(null);
    this.establecimientoActivo.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  /**
   * Un usuario puede tener varios roles a la vez, así que se compara contra el
   * array (con fallback a `rol` para sesiones abiertas antes de RBAC).
   *
   * Preferir `can()`: con roles dinámicos, chequear por nombre de rol deja
   * afuera a cualquier rol nuevo creado desde la administración.
   */
  hasRole(...roles: string[]): boolean {
    const u = this.usuario();
    if (!u) return false;
    if (u.es_admin) return true;
    const propios = u.roles?.length ? u.roles : u.rol ? [u.rol] : [];
    return propios.some((r) => roles.includes(r));
  }

  /**
   * Espejo de requirePermission() del backend.
   *
   * Recibe un id de Permiso, no un string: el tipo PermisoId hace que un
   * permiso inexistente no compile, en vez de esconder la opción en silencio.
   */
  can(permiso: PermisoId): boolean {
    const u = this.usuario();
    if (!u) return false;
    if (u.es_admin) return true;
    return (u.permisos ?? []).includes(permiso);
  }

  canAny(...permisos: PermisoId[]): boolean {
    return permisos.some((p) => this.can(p));
  }

  setEstablecimientoActivo(id: number | null) {
    this.establecimientoActivo.set(id);
    if (id === null) localStorage.removeItem(this.EST_KEY);
    else localStorage.setItem(this.EST_KEY, String(id));
  }

  private loadUser(): Usuario | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Usuario;
    // Sesión guardada antes de RBAC: normalizar para no romper con undefined.
    u.roles ??= u.rol ? [u.rol] : [];
    u.permisos = normalizarPermisos(u.permisos);
    u.es_admin ??= u.roles.includes('ADMIN');
    return u;
  }

  private loadEstablecimiento(): number | null {
    const raw = localStorage.getItem(this.EST_KEY);
    return raw ? Number(raw) : null;
  }
}
