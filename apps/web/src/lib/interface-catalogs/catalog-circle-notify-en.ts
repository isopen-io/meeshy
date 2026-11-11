/**
 * « QUI EST PRÉVENU » (#14063), ANGLAIS : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const en = {
  'circleNotify.title': 'Notify',
  'circleNotify.intro': 'Choose, action by action, which circle of your people receives a notification.',
  'circleNotify.intro.question': 'Who gets these notifications?',
  'circleNotify.family.publication': 'My publications',
  'circleNotify.family.onMyContent': 'On my content',
  'circleNotify.family.elsewhere': 'Elsewhere',
  'circleNotify.summary.mixed': 'Depends on the action',
  'circleNotify.action.post': 'Post',
  'circleNotify.action.reel': 'Reel',
  'circleNotify.action.story': 'Story',
  'circleNotify.action.mood': 'Mood',
  'circleNotify.action.repost': 'Repost',
  'circleNotify.action.share': 'Share',
  'circleNotify.action.comment': 'Comment',
  'circleNotify.action.reaction': 'Reaction',
  'circleNotify.action.quote': 'Quote',
  'circleNotify.action.reference': 'Reference',
  'circleNotify.action.mention': 'Mention',
  'circleNotify.choice.NOBODY': 'Nobody',
  'circleNotify.explain.question': 'Who is notified with this choice?',
  'circleNotify.explain.COMMUNITY': 'All your connections, from Blood to Acquaintance, and members of the communities you share.',
  'circleNotify.explain.PUBLIC': 'The same people as Community: Meeshy has no followers, so no stranger is notified.',
  'circleNotify.loading': 'Loading…',
  'circleNotify.unavailable': 'These settings could not be read.',
  'circleNotify.retry': 'Try again',
} as const satisfies CircleNotifyCatalog;

export default en;
