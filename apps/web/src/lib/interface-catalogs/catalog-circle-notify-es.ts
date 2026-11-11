/**
 * « QUI EST PRÉVENU » (#14063), ESPAGNOL : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const es = {
  'circleNotify.title': 'Avisar',
  'circleNotify.intro': 'Elige, acción por acción, qué círculo de tu entorno recibe una notificación.',
  'circleNotify.intro.question': '¿Quién recibe estas notificaciones?',
  'circleNotify.family.publication': 'Mis publicaciones',
  'circleNotify.family.onMyContent': 'En mis contenidos',
  'circleNotify.family.elsewhere': 'En otros sitios',
  'circleNotify.summary.mixed': 'Según la acción',
  'circleNotify.action.post': 'Publicación',
  'circleNotify.action.reel': 'Reel',
  'circleNotify.action.story': 'Historia',
  'circleNotify.action.mood': 'Estado de ánimo',
  'circleNotify.action.repost': 'Republicación',
  'circleNotify.action.share': 'Compartido',
  'circleNotify.action.comment': 'Comentario',
  'circleNotify.action.reaction': 'Reacción',
  'circleNotify.action.quote': 'Cita',
  'circleNotify.action.reference': 'Referencia',
  'circleNotify.action.mention': 'Mención',
  'circleNotify.choice.NOBODY': 'Nadie',
  'circleNotify.explain.question': '¿A quién se avisa con esta opción?',
  'circleNotify.explain.COMMUNITY': 'Todos tus vínculos, de Sangre a Conocido, y los miembros de las comunidades que compartes.',
  'circleNotify.explain.PUBLIC': 'Las mismas personas que Comunidad: Meeshy no tiene seguidores, ningún desconocido recibe el aviso.',
  'circleNotify.loading': 'Cargando…',
  'circleNotify.unavailable': 'No se pudieron leer estos ajustes.',
  'circleNotify.retry': 'Reintentar',
} as const satisfies CircleNotifyCatalog;

export default es;
