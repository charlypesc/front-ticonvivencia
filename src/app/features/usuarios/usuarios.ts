import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.services';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Credenciales, Rol } from '../../core/models/usuario.model';
import { Permiso } from '../../core/constants/permisos';
import { Puede } from '../../shared/directives/permiso.directive';
import { CredencialesModal } from '../../shared/components/credenciales-modal/credenciales-modal';
import { CerrarConEsc } from '../../shared/directives/cerrar-con-esc.directive';
import { GuardarConCmdEnter } from '../../shared/directives/guardar-con-cmd-enter.directive';
import { EtiquetaPipe } from '../../shared/pipes/etiqueta.pipe';
import {
  completarDominio,
  dominioDe,
  dominioDeCuentas,
  dominiosSugeridos,
} from '../../shared/utils/correo';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, Puede, CredencialesModal, CerrarConEsc, GuardarConCmdEnter, EtiquetaPipe],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class Usuarios implements OnInit {
  /** El template no ve los imports del módulo: hay que exponerlo en la clase. */
  protected readonly Permiso = Permiso;

  usuarios = signal<any[]>([]);
  // El catálogo viene del backend: ya no hay lista dura de roles, así que un rol
  // creado desde la administración aparece acá sin tocar el frontend.
  roles = signal<Rol[]>([]);
  loading = signal(true);
  mostrarForm = signal(false);
  /** Usuario que se está editando; null cuando el modal es un alta. */
  editando = signal<any | null>(null);
  error = signal('');
  success = signal('');

  /**
   * Credenciales recién emitidas (alta o restablecimiento). Vive solo en
   * memoria y solo mientras el modal está abierto: la contraseña en claro no
   * se guarda en ningún lado, ni acá ni en el servidor.
   */
  credenciales = signal<Credenciales | null>(null);
  tituloCredenciales = signal('Usuario creado');
  /** Roles del usuario de esas credenciales, ya legibles, para mostrarlos en el modal. */
  rolCredenciales = signal('');

  guardando = signal(false);

  form: { correo: string; nombre: string; roles: string[] } = { correo: '', nombre: '', roles: [] };

  /**
   * Dominios propuestos para el correo, derivados del establecimiento (ver
   * `shared/utils/correo.ts`). Sin esto todas las cuentas terminan copiando el
   * `@colegio.cl` del placeholder y no hay forma de saber, leyendo un correo,
   * de qué colegio es la cuenta.
   */
  private dominiosDeducidos = signal<string[]>([]);

  /** El dominio que ya usan las cuentas del colegio; '' si es la primera. */
  dominioEnUso = computed(() => dominioDeCuentas(this.usuarios().map((u) => u.correo)));

  /**
   * Lo que ya usan las cuentas manda sobre lo deducido: apenas existe el primer
   * usuario, su dominio define el orden del establecimiento.
   */
  dominios = computed(() =>
    [...new Set([this.dominioEnUso(), ...this.dominiosDeducidos()].filter(Boolean))],
  );

  constructor(
    private api: ApiService,
    private confirm: ConfirmService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.cargar();
    this.api.getRoles().subscribe({
      // Solo un ADMIN puede otorgar ADMIN: al resto ni se le ofrece. El backend
      // lo valida igual — esconderlo acá no es el control de acceso.
      next: (rs) => this.roles.set(rs.filter((r) => r.codigo !== 'ADMIN' || this.auth.esAdmin())),
      error: () => this.error.set('No se pudo cargar el catálogo de roles'),
    });

    // El GET de /establecimiento va contra el establecimiento del token (o el
    // activo, si es un ADMIN), así que sirve igual para los dos casos. Es el
    // único lugar donde llega el correo institucional, que el JWT no trae.
    this.api.getEstablecimiento().subscribe({
      next: (est) => this.dominiosDeducidos.set(dominiosSugeridos(est)),
      // Una sugerencia no vale una alerta: si falla, el campo queda como estaba.
      error: () =>
        this.dominiosDeducidos.set(
          dominiosSugeridos({ nombre: this.auth.usuario()?.nombre_establecimiento }),
        ),
    });
  }

  /** El dominio que se completa solo; '' mientras no se sepa cuál es. */
  dominioPorDefecto = () => this.dominios()[0] ?? '';

  /**
   * Se dispara al salir del campo: si escribieron solo el nombre de usuario, se
   * le pega el dominio. No pisa nada cuando ya escribieron un `@`.
   */
  completarCorreo() {
    this.form.correo = completarDominio(this.form.correo, this.dominioPorDefecto());
  }

  /** Aplica una de las sugerencias, conservando lo tipeado antes del `@`. */
  usarDominio(dominio: string) {
    const usuario = this.form.correo.split('@')[0].trim();
    this.form.correo = usuario ? `${usuario}@${dominio}` : `@${dominio}`;
  }

  /**
   * Avisa cuando el correo escrito sale del dominio que usa el resto del
   * colegio. Es un aviso y no un bloqueo a propósito: hay altas legítimas fuera
   * del dominio (un psicólogo externo, alguien del sostenedor), y una regla
   * dura dejaría al establecimiento amarrado para siempre a un typo del primer
   * usuario, que no se puede corregir desde ninguna pantalla.
   *
   * Es un método y no un `computed` porque depende de `form`, que es un objeto
   * plano del ngModel y no una señal: un computed no se enteraría al tipear.
   */
  dominioDistintoAlDelColegio(): boolean {
    const enUso = this.dominioEnUso();
    const escrito = dominioDe(this.form.correo);
    return !!enUso && !!escrito && escrito !== enUso;
  }

  /** Cuántas cuentas del colegio usan el dominio en uso, para el aviso. */
  cuentasConDominioEnUso(): number {
    const enUso = this.dominioEnUso();
    return this.usuarios().filter((u) => dominioDe(u.correo) === enUso).length;
  }

  cargar() {
    this.loading.set(true);
    this.api.getUsuarios().subscribe({
      next: (data) => {
        this.usuarios.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  abrirForm() {
    this.error.set('');
    this.success.set('');
    this.editando.set(null);
    this.form = { correo: '', nombre: '', roles: [] };
    this.mostrarForm.set(true);
  }

  /**
   * Abre el mismo modal para corregir una cuenta ya creada. La contraseña no se
   * toca desde acá: para eso está "Restablecer contraseña", que emite una nueva
   * y devuelve el documento a entregar.
   */
  editar(u: any) {
    if (!this.auth.can(Permiso.UsuarioCrear)) return;
    this.error.set('');
    this.success.set('');
    this.editando.set(u);
    this.form = { correo: u.correo ?? '', nombre: u.nombre ?? '', roles: [...(u.roles ?? [])] };
    this.mostrarForm.set(true);
  }

  cerrarForm() {
    this.mostrarForm.set(false);
    this.editando.set(null);
  }

  /**
   * Si el modal de edición tiene algo escrito que todavía no se guardó.
   *
   * Hace falta para el paso a la pantalla de permisos: esa lee el estado
   * GUARDADO del servidor, así que abrirla con un rol cambiado y sin guardar
   * mostraría los permisos del rol viejo, y quien mire va a creer que el rol
   * nuevo no le dio nada.
   *
   * Los roles se comparan como conjunto: el orden en que se tildan las
   * casillas no es un cambio.
   */
  private hayCambiosSinGuardar(): boolean {
    const u = this.editando();
    if (!u) return false;
    const antes = [...(u.roles ?? [])].sort().join(',');
    const ahora = [...this.form.roles].sort().join(',');
    return (
      this.form.nombre.trim() !== (u.nombre ?? '') ||
      this.form.correo !== (u.correo ?? '') ||
      antes !== ahora
    );
  }

  /**
   * Salta de "Editar usuario" a los permisos de esa misma persona. El botón
   * vive también en el modal porque es ahí donde se está pensando en qué puede
   * hacer alguien; obligar a cerrar, buscar la fila y apretar otro ícono era
   * hacer el recorrido dos veces.
   */
  async editarPermisosDelFormulario() {
    const u = this.editando();
    if (!u) return;

    if (this.hayCambiosSinGuardar()) {
      const ok = await this.confirm.confirmarAccion(
        'Tienes cambios sin guardar en esta ficha (nombre, correo o roles).\n\n' +
          'Los permisos se calculan sobre lo que ya está guardado, así que hay que descartarlos ' +
          'para continuar. ¿Seguir de todos modos?',
      );
      if (!ok) return;
    }

    this.cerrarForm();
    this.abrirPermisos(u);
  }

  estaSeleccionado(codigo: string) {
    return this.form.roles.includes(codigo);
  }

  toggleRolSeleccionado(codigo: string) {
    const i = this.form.roles.indexOf(codigo);
    if (i >= 0) this.form.roles.splice(i, 1);
    else this.form.roles.push(codigo);
  }

  guardar() {
    this.error.set('');
    // Guardar con Enter no dispara el blur del campo: sin esto, un correo
    // escrito sin dominio se enviaría al backend a medias.
    this.completarCorreo();
    const { correo, nombre, roles } = this.form;

    if (!correo || !nombre.trim() || roles.length === 0) {
      this.error.set('Nombre, correo y al menos un rol son requeridos');
      return;
    }

    this.guardando.set(true);

    // Editar no emite credenciales: la cuenta ya existe y su clave no cambia,
    // así que acá alcanza con el mensaje de éxito y recargar la tabla.
    const enEdicion = this.editando();
    if (enEdicion) {
      this.api
        .updateUsuario(enEdicion.id_usuario, {
          correo,
          nombre: nombre.trim(),
          // Los roles se envían solo si esta persona puede cambiarlos: mandar
          // la misma lista sin el permiso haría rebotar la edición entera con
          // un 403 por algo que ni siquiera se tocó.
          roles: this.auth.can(Permiso.UsuarioAsignarRol) ? roles : undefined,
        })
        .subscribe({
          next: () => {
            this.cerrarForm();
            this.success.set('Usuario actualizado');
            this.cargar();
          },
          error: (err) => this.error.set(err.error?.message ?? 'Error al actualizar el usuario'),
        })
        .add(() => this.guardando.set(false));
      return;
    }

    this.api
      .createUsuario({ correo, nombre: nombre.trim(), roles })
      .subscribe({
        // El modal de credenciales reemplaza al mensaje de éxito: la clave solo
        // existe en esta respuesta, así que cerrar el formulario sin mostrarla
        // obligaría a restablecerla antes de siquiera haberla entregado.
        next: (cred) => {
          this.cerrarForm();
          this.tituloCredenciales.set('Usuario creado');
          this.rolCredenciales.set(this.nombresDeRoles(roles));
          this.credenciales.set(cred);
          this.cargar();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al crear usuario'),
      })
      .add(() => this.guardando.set(false));
  }

  async restablecer(u: any) {
    this.error.set('');
    this.success.set('');

    const ok = await this.confirm.confirmarAccion(
      `¿Restablecer la contraseña de ${u.correo}?\n\n` +
        'Se generará una contraseña nueva y la actual dejará de funcionar de inmediato. ' +
        'Tendrás que entregarle el documento con la clave nueva.',
    );
    if (!ok) return;

    this.api.resetPasswordUsuario(u.id_usuario).subscribe({
      next: (cred) => {
        this.tituloCredenciales.set('Contraseña restablecida');
        this.rolCredenciales.set(this.nombresDeRoles(u.roles));
        this.credenciales.set(cred);
      },
      error: (err) =>
        this.error.set(err.error?.message ?? 'Error al restablecer la contraseña'),
    });
  }

  cerrarCredenciales() {
    this.credenciales.set(null);
    this.rolCredenciales.set('');
  }

  /**
   * Pasa los códigos de rol a los nombres del catálogo, para que el documento
   * diga "Encargado de convivencia" y no "ENCARGADO". Si un código no está en
   * el catálogo (rol propio de otro colegio) cae al código: es feo, pero es
   * peor entregar la hoja con el campo en blanco.
   */
  private nombresDeRoles(codigos: string[] = []): string {
    return codigos.map((c) => this.roles().find((r) => r.codigo === c)?.nombre ?? c).join(', ');
  }

  toggle(u: any) {
    this.api.toggleUsuario(u.id_usuario).subscribe({
      next: () => this.cargar(),
      error: (err) => this.error.set(err.error?.message ?? 'Error al actualizar estado'),
    });
  }

  // ─── Permisos de una persona ────────────────────────────────────────────
  //
  // Los roles útiles (Inspectoría, Psicólogo, Orientador, UTP…) son globales:
  // los comparten todos los colegios, así que la pantalla de Roles no deja
  // tocarlos — cambiarle un permiso a Inspectoría se lo cambiaría a todos los
  // establecimientos del país. Acá se resuelve el caso real: "esta inspectora
  // mía, además, exporta expedientes".
  //
  // La pantalla NO le pide a nadie que piense en "conceder" y "denegar": se
  // marca lo que la persona puede hacer y listo. Las excepciones se deducen
  // comparando contra lo que le da el rol (ver `guardarPermisos`). Pedirle al
  // usuario que declare el efecto sería obligarlo a razonar sobre la herencia
  // en vez de sobre lo que quiere que pase.

  mostrarPermisos = signal(false);
  /** La persona cuyos permisos se están viendo. */
  personaPermisos = signal<any | null>(null);
  /** El catálogo ya viene recortado a lo que esta cuenta puede repartir. */
  catalogoPermisos = signal<any[]>([]);
  /** Lo que le dan sus roles: la línea base contra la que se calcula el diff. */
  heredados = signal<Set<number>>(new Set());
  /** De qué rol viene cada permiso heredado, para el tooltip. */
  rolesPorPermiso = signal<Map<number, string[]>>(new Map());
  /** Lo que la persona puede hacer hoy; es lo que se edita con los checkboxes. */
  permisosPersona = signal<Set<number>>(new Set());
  cargandoPermisos = signal(false);
  guardandoPermisos = signal(false);
  motivoPermisos = '';

  /** El catálogo agrupado por recurso, igual que en la pantalla de Roles. */
  permisosPorRecurso = computed(() => {
    const grupos = new Map<string, any[]>();
    for (const p of this.catalogoPermisos()) {
      if (!grupos.has(p.recurso)) grupos.set(p.recurso, []);
      grupos.get(p.recurso)!.push(p);
    }
    return [...grupos.entries()]
      .map(([recurso, permisos]) => ({ recurso, permisos }))
      .sort((a, b) => a.recurso.localeCompare(b.recurso));
  });

  /**
   * Las excepciones que quedarían al guardar. Se muestra el conteo antes de
   * confirmar: un override es deuda —en seis meses nadie recuerda por qué
   * existe—, así que conviene que se vea cuántos se están creando.
   */
  diffPermisos = computed(() => {
    const base = this.heredados();
    const sel = this.permisosPersona();
    return {
      conceder: [...sel].filter((id) => !base.has(id)),
      denegar: [...base].filter((id) => !sel.has(id)),
    };
  });

  abrirPermisos(u: any) {
    this.error.set('');
    this.success.set('');
    this.personaPermisos.set(u);
    this.motivoPermisos = '';
    this.mostrarPermisos.set(true);
    this.cargandoPermisos.set(true);

    // El catálogo se pide una sola vez y se reusa entre personas: no cambia
    // entre una fila y la siguiente.
    if (this.catalogoPermisos().length === 0)
      this.api.getCatalogoPermisos().subscribe({
        next: (c) => this.catalogoPermisos.set(c),
        error: () => this.error.set('No se pudo cargar el catálogo de permisos'),
      });

    this.api.getPermisosDeUsuario(u.id_usuario).subscribe({
      next: (r) => {
        this.heredados.set(new Set(r.heredados.map((h) => h.permiso_id)));
        this.rolesPorPermiso.set(new Map(r.heredados.map((h) => [h.permiso_id, h.roles])));
        // Se arranca de los efectivos y no de los heredados: si la persona ya
        // tenía excepciones, el modal tiene que abrirse mostrándolas aplicadas.
        this.permisosPersona.set(new Set(r.efectivos));
        // El motivo se precarga del primer override que lo tenga: es el mismo
        // para todos (se guarda por tanda) y así no se pierde al reeditar.
        this.motivoPermisos = r.overrides.find((o) => o.motivo)?.motivo ?? '';
        this.cargandoPermisos.set(false);
      },
      error: (err) => {
        this.cargandoPermisos.set(false);
        this.error.set(err.error?.message ?? 'No se pudieron cargar los permisos de la persona');
        this.mostrarPermisos.set(false);
      },
    });
  }

  cerrarPermisos() {
    this.mostrarPermisos.set(false);
    this.personaPermisos.set(null);
    this.modoGuardarRol.set(false);
  }

  // ─── Convertir la selección en un rol reutilizable ──────────────────────
  //
  // Una excepción por persona no se hereda: si en marzo entra otra inspectora
  // que necesita lo mismo, hay que rehacerle la lista a mano. Un rol se marca
  // en el alta y ya. Por eso el modal ofrece las dos salidas y no solo la
  // excepción — que queda para lo genuinamente irrepetible.

  modoGuardarRol = signal(false);
  formRol = { nombre: '', descripcion: '' };

  abrirGuardarComoRol() {
    this.error.set('');
    // El nombre se propone, no se impone: "Inspectoría +1" es un punto de
    // partida legible, y quien lo lea después va a querer algo más específico.
    const base = this.personaPermisos()?.roles?.[0] ?? 'Rol';
    const { conceder, denegar } = this.diffPermisos();
    const sufijo = [
      conceder.length ? `+${conceder.length}` : '',
      denegar.length ? `-${denegar.length}` : '',
    ].filter(Boolean).join(' ');
    this.formRol = {
      nombre: sufijo ? `${this.nombresDeRoles([base])} ${sufijo}` : this.nombresDeRoles([base]),
      descripcion: '',
    };
    this.modoGuardarRol.set(true);
  }

  async guardarComoRol() {
    const persona = this.personaPermisos();
    if (!persona) return;
    if (!this.formRol.nombre.trim()) {
      this.error.set('Ponle un nombre al rol');
      return;
    }

    // El reemplazo de roles es lo que más sorprende de esta acción, así que se
    // dice antes y con el nombre del rol viejo, no después en un mensaje de
    // éxito que ya no se puede deshacer.
    const anteriores = this.nombresDeRoles(persona.roles) || 'sin rol';
    const ok = await this.confirm.confirmarAccion(
      `¿Crear el rol "${this.formRol.nombre.trim()}" con estos permisos?\n\n` +
        `Se le asignará a ${persona.nombre || persona.correo} en reemplazo de ${anteriores}, ` +
        'y quedará disponible para asignárselo a cualquier otra persona del colegio.\n\n' +
        'Los cambios se aplican cuando cada una vuelva a iniciar sesión.',
    );
    if (!ok) return;

    this.error.set('');
    this.guardandoPermisos.set(true);
    this.api
      .guardarPermisosComoRol(persona.id_usuario, {
        nombre: this.formRol.nombre.trim(),
        descripcion: this.formRol.descripcion.trim() || undefined,
        permisos: [...this.permisosPersona()],
      })
      .subscribe({
        next: (res) => {
          this.cerrarPermisos();
          this.success.set(res.advertencia ? `${res.message}. ${res.advertencia}` : res.message);
          // La tabla muestra el rol de cada uno y el selector del alta se
          // arma con el catálogo: los dos quedaron desactualizados.
          this.cargar();
          this.api.getRoles().subscribe({
            next: (rs) =>
              this.roles.set(rs.filter((r) => r.codigo !== 'ADMIN' || this.auth.esAdmin())),
          });
        },
        error: (err) => this.error.set(err.error?.message ?? 'Error al crear el rol'),
      })
      .add(() => this.guardandoPermisos.set(false));
  }

  tienePermiso(id: number) {
    return this.permisosPersona().has(id);
  }

  /** Si lo trae el rol: define si desmarcarlo es una denegación o solo no darlo. */
  vieneDelRol(id: number) {
    return this.heredados().has(id);
  }

  /** true cuando lo marcado no coincide con lo que da el rol: es una excepción. */
  esExcepcion(id: number) {
    return this.vieneDelRol(id) !== this.tienePermiso(id);
  }

  /** "Inspectoría, Docente" para el tooltip de un permiso heredado. */
  origenDe(id: number) {
    const roles = this.rolesPorPermiso().get(id);
    if (!roles?.length) return '';
    return roles.join(', ');
  }

  alternarPermiso(id: number) {
    if (!this.auth.can(Permiso.UsuarioAsignarPermiso)) return;
    const s = new Set(this.permisosPersona());
    s.has(id) ? s.delete(id) : s.add(id);
    this.permisosPersona.set(s);
  }

  /** Vuelve la persona a exactamente lo que le da su rol: borra las excepciones. */
  restaurarDelRol() {
    if (!this.auth.can(Permiso.UsuarioAsignarPermiso)) return;
    this.permisosPersona.set(new Set(this.heredados()));
    this.motivoPermisos = '';
  }

  async guardarPermisos() {
    const persona = this.personaPermisos();
    if (!persona) return;
    const { conceder, denegar } = this.diffPermisos();

    // Confirmación explícita: cambiarle los permisos a alguien no se deshace
    // solo, y el aviso de que recién aplica al reingresar tiene que leerse
    // ANTES de guardar — si no, se guarda, se prueba, no pasa nada y parece
    // que el sistema está roto.
    const detalle = conceder.length || denegar.length
      ? `Va a quedar con ${conceder.length} permiso(s) agregado(s) y ${denegar.length} quitado(s) respecto de su rol.`
      : 'No queda ninguna excepción: vuelve a tener exactamente los permisos de su rol.';
    const ok = await this.confirm.confirmarAccion(
      `¿Guardar los permisos de ${persona.nombre || persona.correo}?\n\n${detalle}\n\n` +
        'Los cambios se aplican cuando esa persona vuelva a iniciar sesión.',
    );
    if (!ok) return;

    this.error.set('');
    this.guardandoPermisos.set(true);
    this.api
      .setPermisosDeUsuario(persona.id_usuario, {
        conceder,
        denegar,
        motivo: this.motivoPermisos.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.cerrarPermisos();
          this.success.set(res.advertencia ? `${res.message}. ${res.advertencia}` : res.message);
        },
        error: (err) =>
          this.error.set(err.error?.message ?? 'Error al guardar los permisos de la persona'),
      })
      .add(() => this.guardandoPermisos.set(false));
  }
}
