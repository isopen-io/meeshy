/**
 * « QUI EST PRÉVENU » (#14063), ANGLAIS : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const en = {
  'circleNotify.title': 'Who gets notified',
  'circleNotify.intro': 'Choose, action by action, which circle of your people receives a notification.',
  'circleNotify.family.publication': 'My publications',
  'circleNotify.family.onMyContent': 'Others’ activity on my content',
  'circleNotify.family.elsewhere': 'My activity elsewhere',
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
  'circleNotify.explain.NOBODY': 'No one around you is notified.',
  'circleNotify.explain.COMMUNITY': 'All your connections, from Blood to Acquaintance, and members of the communities you share.',
  'circleNotify.explain.PUBLIC': 'The same people as Community: Meeshy has no followers, so no stranger is notified.',
  'circleNotify.loading': 'Loading…',
  'circleNotify.unavailable': 'These settings could not be read.',
  'circleNotify.retry': 'Try again',
} as const satisfies CircleNotifyCatalog;

export default en;
