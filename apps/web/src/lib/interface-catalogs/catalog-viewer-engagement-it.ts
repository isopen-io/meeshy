/** La feuille « Vues » enrichie (#9727), ITALIEN — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const it = {
  'viewerEngagement.shares.one': '{count} condivisione',
  'viewerEngagement.shares.other': '{count} condivisioni',
  'viewerEngagement.reposts.one': '{count} ripubblicazione',
  'viewerEngagement.reposts.other': '{count} ripubblicazioni',
  'viewerEngagement.comments.one': '{count} commento',
  'viewerEngagement.comments.other': '{count} commenti',
  'viewerEngagement.replies.one': '{count} risposta',
  'viewerEngagement.replies.other': '{count} risposte',
  'viewerEngagement.reactions': 'Reazioni: {emojis}',
  'viewerEngagement.bookmarked': 'Salvato nei preferiti',
  'viewerEngagement.viewedAt': 'Visto alle {time}',
  'viewerEngagement.onlyViewed': 'Ha visto, senza altre interazioni',
  'viewerEngagement.openProfile': 'Vedi profilo',
  'viewerEngagement.back': 'Torna alle visualizzazioni',
  'viewerEngagement.openDetail': 'Vedi cosa ha fatto {name}',
  'viewerEngagement.empty.subtitle': 'Le persone che vedranno questo post appariranno qui.',
  'viewerEngagement.forbidden': 'Solo l’autore può vedere chi ha visto questo post.',
  'viewerEngagement.unavailable': 'Il dettaglio dell’attività è momentaneamente non disponibile.',
} satisfies ViewerEngagementCatalog;

export default it;
