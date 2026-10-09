/** La feuille « Vues » enrichie (#9727), ALLEMAND — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const de = {
  'viewerEngagement.shares.one': '{count} Mal geteilt',
  'viewerEngagement.shares.other': '{count} Mal geteilt',
  'viewerEngagement.reposts.one': '{count} Repost',
  'viewerEngagement.reposts.other': '{count} Reposts',
  'viewerEngagement.comments.one': '{count} Kommentar',
  'viewerEngagement.comments.other': '{count} Kommentare',
  'viewerEngagement.replies.one': '{count} Antwort',
  'viewerEngagement.replies.other': '{count} Antworten',
  'viewerEngagement.reactions': 'Reaktionen: {emojis}',
  'viewerEngagement.viewedAt': 'Angesehen um {time}',
  'viewerEngagement.onlyViewed': 'Angesehen, ohne weitere Interaktion',
  'viewerEngagement.openProfile': 'Profil ansehen',
  'viewerEngagement.back': 'Zurück zu den Aufrufen',
  'viewerEngagement.openDetail': 'Ansehen, was {name} getan hat',
  'viewerEngagement.empty.subtitle': 'Personen, die diesen Beitrag ansehen, erscheinen hier.',
  'viewerEngagement.forbidden': 'Nur der Autor kann sehen, wer diesen Beitrag angesehen hat.',
  'viewerEngagement.unavailable': 'Die Aktivitätsdetails sind vorübergehend nicht verfügbar.',
} satisfies ViewerEngagementCatalog;

export default de;
