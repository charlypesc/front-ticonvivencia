import { Permiso, PermisoId } from './permisos';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Permiso que habilita el ítem. Mismo id que usa el backend. */
  permiso: PermisoId;
  /**
   * Recursos del catálogo de permisos que se usan dentro de esta pantalla. La
   * grilla de permisos (Roles, Usuarios) arma una tarjeta por ítem del menú
   * con estos recursos, en el orden del menú: así quien configura un rol ve
   * las mismas pantallas que ve en el sidebar. Un recurso que no figura acá
   * cae en la tarjeta "Otros".
   */
  recursos: readonly string[];
}

// El menú se arma por permiso, no por rol: así un rol nuevo creado desde la
// administración ve automáticamente lo que le corresponde, sin desplegar.
export const MENU: readonly NavItem[] = [
  { label: 'Inicio',        icon: 'ti-home',   route: '/dashboard',     permiso: Permiso.DashboardVer, recursos: ['dashboard'] },
  // "Consultar RUT" se fusionó con Estudiantes: era un segundo buscador para
  // la misma persona, y obligaba a elegir de antemano si se la iba a buscar
  // por nombre o por RUT.
  { label: 'Estudiantes',   icon: 'ti-users',  route: '/estudiantes',   permiso: Permiso.EstudianteVer, recursos: ['estudiante'] },
  { label: 'Cursos',        icon: 'ti-school', route: '/cursos',        permiso: Permiso.CursoVer, recursos: ['curso'] },
  { label: 'Registros',     icon: 'ti-folder', route: '/registros',     permiso: Permiso.RegistroVer, recursos: ['registro'] },
  // El QR y el link del canal de denuncias, junto con la bandeja de lo que entra.
  { label: 'QR denuncias', icon: 'ti-qrcode', route: '/denuncias', permiso: Permiso.DenunciaVer, recursos: ['denuncia'] },
  { label: 'Subir documento', icon: 'ti-file', route: '/subir-documento', permiso: Permiso.DocumentoSubir, recursos: ['documento'] },
  { label: 'Tipos de falta', icon: 'ti-settings', route: '/tipos-falta', permiso: Permiso.TipoFaltaVer, recursos: ['tipo_falta'] },
  {
    label: 'Protocolos genéricos',
    icon: 'ti-shield',
    route: '/protocolos-genericos',
    permiso: Permiso.ProtocoloGenericoVer,
    recursos: ['protocolo_generico', 'protocolo_flujo'],
  },
  {
    label: 'Protocolos del establecimiento',
    icon: 'ti-building',
    route: '/protocolos-establecimiento',
    permiso: Permiso.ProtocoloEstablecimientoVer,
    recursos: ['protocolo_establecimiento', 'protocolo_flujo_establecimiento'],
  },
  {
    label: 'Protocolos activados',
    icon: 'ti-shield-check',
    route: '/protocolos-activados',
    // ver_todos y no ver: Inspectoría conserva `ver` para abrir el caso donde
    // tiene un paso (llega por la campana), pero no el listado del colegio.
    permiso: Permiso.ProtocoloActivadoVerTodos,
    recursos: [
      'protocolo_activado', 'medida_proteccion', 'medida_disciplinaria',
      'suspension_cautelar', 'informe_expulsion', 'expediente',
    ],
  },
  // Catálogo cross-tenant (País/Región/Provincia/Comuna)
  {
    label: 'Reglamento y Plan',
    icon: 'ti-book',
    route: '/documentos-institucionales',
    permiso: Permiso.DocumentoInstitucionalVer,
    recursos: ['documento_institucional', 'constancia'],
  },
  { label: 'Feriados', icon: 'ti-calendar', route: '/feriados', permiso: Permiso.FeriadoAdministrar, recursos: ['feriado'] },
  { label: 'Geo',      icon: 'ti-map-2',    route: '/geo',      permiso: Permiso.EstablecimientoVer, recursos: [
    // Sostenedores también: se crean y se asignan a colegios desde /geo.
    'pais', 'region', 'provincia', 'comuna', 'establecimiento', 'sostenedor',
  ] },
  { label: 'Usuarios', icon: 'ti-user-cog', route: '/usuarios', permiso: Permiso.UsuarioVer, recursos: ['usuario'] },
  // Gateado por rol.asignar_permiso (solo ADMIN) y no por rol.ver: quien
  // administra usuarios necesita rol.ver para llenar el selector de roles del
  // formulario, pero no tiene por qué ver la pantalla de configuración.
  { label: 'Roles',    icon: 'ti-lock',     route: '/roles',    permiso: Permiso.RolAsignarPermiso, recursos: ['rol'] },
];
