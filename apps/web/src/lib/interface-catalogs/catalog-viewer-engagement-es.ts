/** La feuille « Vues » enrichie (#9727), ESPAGNOL — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const es = {
  'viewerEngagement.shares.one': '{count} compartido',
  'viewerEngagement.shares.other': '{count} compartidos',
  'viewerEngagement.reposts.one': '{count} republicación',
  'viewerEngagement.reposts.other': '{count} republicaciones',
  'viewerEngagement.comments.one': '{count} comentario',
  'viewerEngagement.comments.other': '{count} comentarios',
  'viewerEngagement.replies.one': '{count} respuesta',
  'viewerEngagement.replies.other': '{count} respuestas',
  'viewerEngagement.reactions': 'Reacciones: {emojis}',
  'viewerEngagement.viewedAt': 'Visto a las {time}',
  'viewerEngagement.onlyViewed': 'Lo vio, sin otra interacción',
  'viewerEngagement.openProfile': 'Ver perfil',
  'viewerEngagement.back': 'Volver a las vistas',
  'viewerEngagement.openDetail': 'Ver lo que hizo {name}',
  'viewerEngagement.empty.subtitle': 'Las personas que vean esta publicación aparecerán aquí.',
  'viewerEngagement.forbidden': 'Solo el autor puede ver quién vio esta publicación.',
  'viewerEngagement.unavailable': 'El detalle de la actividad no está disponible por el momento.',
} satisfies ViewerEngagementCatalog;

export default es;
