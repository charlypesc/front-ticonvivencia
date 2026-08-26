import { Pipe, PipeTransform } from '@angular/core';

/**
 * Traduce los códigos internos (los ENUM de la base y los `recurso`/`accion`
 * de los permisos) al texto que se le muestra a la persona.
 *
 * Existe porque las pantallas venían imprimiendo el valor crudo de la columna:
 * "notificacion_externa", "dias_habiles", "asignar_permiso". Eso es el
 * identificador técnico, no una etiqueta — sin tildes, sin ñ y con guiones
 * bajos, porque así tiene que estar escrito en la base.
 *
 * El diccionario va por dominio y no todo junto porque hay códigos repetidos
 * que no significan lo mismo: `pendiente` es un registro sin validar en un
 * lado y un paso que aún no empieza en el otro.
 *
 * Un código sin traducir no rompe la pantalla: se humaniza (guiones bajos por
 * espacios y mayúscula inicial), que es peor que una etiqueta pensada pero
 * mejor que el código pelado.
 */
export const ETIQUETAS: Record<string, Record<string, string>> = {
  tipo_paso: {
    informativo: 'Informativo',
    formulario: 'Formulario',
    adjunto: 'Adjunto',
    aprobacion: 'Aprobación',
    notificacion_externa: 'Notificación externa',
  },

  // En minúscula: se leen dentro de una frase ("2 días hábiles").
  plazo_unidad: {
    horas: 'horas',
    dias_habiles: 'días hábiles',
    dias_corridos: 'días corridos',
  },

  accion_al_vencer: {
    notificar: 'notificar',
    escalar: 'escalar',
    marcar_alerta: 'marcar alerta',
  },

  tipo_participacion: {
    ejecutor: 'Ejecutor',
    aprobador: 'Aprobador',
    notificado: 'Notificado',
  },

  tipo_campo: {
    texto: 'Texto',
    numero: 'Número',
    fecha: 'Fecha',
    seleccion: 'Selección',
    booleano: 'Sí / No',
  },

  // Opciones de los campos `seleccion` de los pasos de protocolo. El valor
  // guardado es el código y así tiene que quedarse: las condiciones de las
  // transiciones lo comparan literal (`organismo == 'tribunal_familia'`), o sea
  // que renombrar el dato rompería los flujos. Lo que se traduce es solo lo que
  // se muestra. Un código nuevo que el ADMIN invente cae en humanizar().
  opcion_campo: {
    ambas: 'Ambas',
    apoderado_apoderado: 'Entre apoderados',
    apoderado_funcionario: 'Apoderado y funcionario',
    autolesion: 'Autolesión',
    carabineros: 'Carabineros',
    cesfam: 'CESFAM',
    cibernetica: 'Cibernética',
    consumado: 'Consumado',
    consumo: 'Consumo',
    convivencia: 'Convivencia',
    disciplinaria: 'Disciplinaria',
    embarazo: 'Embarazo',
    fiscalia: 'Fiscalía',
    fisica: 'Física',
    formativa: 'Formativa',
    funcionario_funcionario: 'Entre funcionarios',
    gira: 'Gira de estudio',
    grave: 'Grave',
    gravisima: 'Gravísima',
    ideacion: 'Ideación',
    intento: 'Intento',
    laboral: 'Laboral',
    leve: 'Leve',
    maternidad: 'Maternidad',
    mensajeria: 'Mensajería',
    moderado: 'Moderado',
    no: 'No',
    observacion: 'Observación',
    oln: 'OLN (Oficina Local de la Niñez)',
    opd: 'OPD (Oficina de Protección de Derechos)',
    otro: 'Otro',
    paternidad: 'Paternidad',
    pdi: 'PDI',
    pdi_cibercrimen: 'PDI — Cibercrimen',
    porte: 'Porte',
    psicologica: 'Psicológica',
    red_social: 'Red social',
    relato: 'Relato',
    salida_pedagogica: 'Salida pedagógica',
    senda: 'SENDA',
    si: 'Sí',
    tercero: 'Tercero',
    trafico: 'Tráfico',
    tribunal_familia: 'Tribunal de Familia',
  },

  estado_flujo: {
    borrador: 'Borrador',
    publicado: 'Publicado',
  },

  estado_caso: {
    activo: 'Activo',
    cerrado: 'Cerrado',
    anulado: 'Anulado',
  },

  estado_paso: {
    pendiente: 'Pendiente',
    en_curso: 'En curso',
    completado: 'Completado',
    omitido: 'Omitido',
    vencido: 'Vencido',
  },

  estado_validacion: {
    pendiente: 'Pendiente',
    validado: 'Validado',
  },

  tipo_evento: {
    activacion: 'Activación',
    inicio_paso: 'Inicio de paso',
    completado_paso: 'Paso completado',
    omitido_paso: 'Paso omitido',
    transicion: 'Transición',
    vencimiento: 'Vencimiento',
    cierre: 'Cierre',
    anulacion: 'Anulación',
    nota: 'Nota',
  },

  // Los dos de abajo son el catálogo de permisos: cada fila de PERMISOS tiene
  // un recurso y una acción, y la pantalla de roles los agrupa por recurso.
  recurso: {
    comuna: 'Comunas',
    curso: 'Cursos',
    dashboard: 'Panel',
    documento: 'Documentos',
    establecimiento: 'Establecimientos',
    estudiante: 'Estudiantes',
    mi_establecimiento: 'Mi establecimiento',
    pais: 'Países',
    protocolo_activado: 'Protocolos activados',
    protocolo_establecimiento: 'Protocolos del establecimiento',
    protocolo_flujo: 'Flujo de protocolos del catálogo',
    protocolo_flujo_establecimiento: 'Flujo de protocolos del establecimiento',
    protocolo_generico: 'Protocolos del catálogo',
    provincia: 'Provincias',
    region: 'Regiones',
    registro: 'Registros',
    rol: 'Roles y permisos',
    sostenedor: 'Sostenedores',
    tipo_falta: 'Tipos de falta',
    usuario: 'Usuarios',
  },

  accion: {
    activar: 'Activar',
    anular: 'Anular',
    aprobar_paso: 'Aprobar paso',
    asignar_establecimiento: 'Asignar establecimiento',
    asignar_permiso: 'Asignar permisos',
    asignar_rol: 'Asignar roles',
    buscar: 'Buscar',
    cerrar: 'Cerrar',
    completar_paso: 'Completar paso',
    confirmar: 'Confirmar',
    crear: 'Crear',
    crear_propio: 'Crear propios',
    editar: 'Editar',
    editar_confidencialidad: 'Editar confidencialidad',
    eliminar: 'Eliminar',
    eliminar_masivo: 'Eliminar en masa',
    importar: 'Importar',
    omitir_paso: 'Omitir paso',
    personalizar: 'Personalizar',
    publicar: 'Publicar',
    reasignar_paso: 'Reasignar paso',
    restablecer_password: 'Restablecer contraseña',
    restaurar: 'Restaurar',
    subir: 'Subir',
    validar: 'Validar',
    ver: 'Ver',
    ver_bitacora: 'Ver bitácora',
    ver_confidencial: 'Ver confidenciales',
    ver_todos: 'Ver todos',
  },
};

/** `hay_senales_fisicas` → `Hay senales fisicas`. Sin tildes, porque no se
 *  pueden adivinar: es el último recurso cuando no hay etiqueta. */
export function humanizar(codigo: string): string {
  const texto = codigo.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function etiquetaDe(codigo: string | null | undefined, dominio?: string): string {
  if (codigo === null || codigo === undefined || codigo === '') return '';
  const valor = String(codigo);
  return (dominio ? ETIQUETAS[dominio]?.[valor] : undefined) ?? humanizar(valor);
}

@Pipe({ name: 'etiqueta', standalone: true })
export class EtiquetaPipe implements PipeTransform {
  transform(codigo: string | null | undefined, dominio?: string): string {
    return etiquetaDe(codigo, dominio);
  }
}
