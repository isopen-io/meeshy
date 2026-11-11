/**
 * « QUI EST PRÉVENU » (#14063), ALLEMAND : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const de = {
  'circleNotify.title': 'Wer benachrichtigt wird',
  'circleNotify.intro': 'Wähle für jede Aktion, welcher Kreis deiner Leute eine Benachrichtigung erhält.',
  'circleNotify.family.publication': 'Meine Veröffentlichungen',
  'circleNotify.family.onMyContent': 'Aktivität anderer bei meinen Inhalten',
  'circleNotify.family.elsewhere': 'Meine Aktivität anderswo',
  'circleNotify.summary.mixed': 'Je nach Aktion',
  'circleNotify.action.post': 'Beitrag',
  'circleNotify.action.reel': 'Reel',
  'circleNotify.action.story': 'Story',
  'circleNotify.action.mood': 'Stimmung',
  'circleNotify.action.repost': 'Repost',
  'circleNotify.action.share': 'Teilen',
  'circleNotify.action.comment': 'Kommentar',
  'circleNotify.action.reaction': 'Reaktion',
  'circleNotify.action.quote': 'Zitat',
  'circleNotify.action.reference': 'Verweis',
  'circleNotify.action.mention': 'Erwähnung',
  'circleNotify.choice.NOBODY': 'Niemand',
  'circleNotify.explain.NOBODY': 'Niemand aus deinem Umfeld wird benachrichtigt.',
  'circleNotify.explain.COMMUNITY': 'Alle deine Verbindungen, von Blut bis Bekannter, und die Mitglieder deiner gemeinsamen Communities.',
  'circleNotify.explain.PUBLIC': 'Dieselben Personen wie bei Community: Meeshy hat keine Follower, kein Fremder wird benachrichtigt.',
  'circleNotify.loading': 'Wird geladen…',
  'circleNotify.unavailable': 'Diese Einstellungen konnten nicht gelesen werden.',
  'circleNotify.retry': 'Erneut versuchen',
} as const satisfies CircleNotifyCatalog;

export default de;
