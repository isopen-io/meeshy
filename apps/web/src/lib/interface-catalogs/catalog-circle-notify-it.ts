/**
 * « QUI EST PRÉVENU » (#14063), ITALIEN : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const it = {
  'circleNotify.title': 'Avvisa',
  'circleNotify.intro': 'Scegli, azione per azione, quale cerchia delle tue persone riceve una notifica.',
  'circleNotify.intro.question': 'Chi riceve queste notifiche?',
  'circleNotify.family.publication': 'Le mie pubblicazioni',
  'circleNotify.family.onMyContent': 'Sui miei contenuti',
  'circleNotify.family.elsewhere': 'Altrove',
  'circleNotify.summary.mixed': 'Dipende dall’azione',
  'circleNotify.action.post': 'Post',
  'circleNotify.action.reel': 'Reel',
  'circleNotify.action.story': 'Storia',
  'circleNotify.action.mood': 'Umore',
  'circleNotify.action.repost': 'Ripubblicazione',
  'circleNotify.action.share': 'Condivisione',
  'circleNotify.action.comment': 'Commento',
  'circleNotify.action.reaction': 'Reazione',
  'circleNotify.action.quote': 'Citazione',
  'circleNotify.action.reference': 'Riferimento',
  'circleNotify.action.mention': 'Menzione',
  'circleNotify.choice.NOBODY': 'Nessuno',
  'circleNotify.explain.question': 'Chi viene avvisato con questa scelta?',
  'circleNotify.explain.COMMUNITY': 'Tutti i tuoi legami, da Sangue a Conoscente, e i membri delle community che condividi.',
  'circleNotify.explain.PUBLIC': 'Le stesse persone di Comunità: Meeshy non ha follower, nessuno sconosciuto viene avvisato.',
  'circleNotify.loading': 'Caricamento…',
  'circleNotify.unavailable': 'Impossibile leggere queste impostazioni.',
  'circleNotify.retry': 'Riprova',
} as const satisfies CircleNotifyCatalog;

export default it;
