/**
 * The unreachable phone of close ones and Blood (#18737, TEL-01), English — loaded on demand
 * (`i18n-phone-reachability-catalog.ts`), never at startup.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const en = {
  'phone.announce.unreachable': '{name}’s phone has been unreachable since {time}',
  'phone.announce.unreachableSomeone': 'A close one’s phone has been unreachable since {time}',
  'phone.announce.reachable': '{name}’s phone is responding again',
  'phone.announce.reachableSomeone': 'A close one’s phone is responding again',
  'phone.a11y.unreachable': 'phone unreachable since {time}',
  'phone.detail.title': 'Phone',
  'phone.detail.since': 'Phone unreachable since {time}',
  'phone.cause.battery': 'Probably a dead battery',
  'phone.cause.network': 'Probably no network or airplane mode',
  'phone.share.title': 'Let {name} know if my phone is unreachable',
  'phone.share.explainClose': '{name} will know since when your phone has stopped responding, and the likely reason. Nothing is shared until you turn it on.',
  'phone.share.explainBlood': 'On by default with your Blood. You can turn it off at any time.',
  'phone.share.globalOff': 'You no longer let anyone know: it is turned off for everyone, from your profile.',
  'phone.global.title': 'Let my close ones know if my phone is unreachable',
  'phone.global.short': 'Unreachable phone',
  'phone.global.explain': 'Your Blood, and the close ones you allowed, know since when your phone has stopped responding, and the likely reason. Never in a conversation.',
  'phone.global.question': 'Who is told?',
  'phone.consent.title': 'Let {name} know if your phone stops responding?',
  'phone.consent.body': '{name} will know your phone is unreachable, since when, and whether it is probably the battery or the network. You can change this here at any time.',
  'phone.consent.confirm': 'Continue',
  'phone.settings.failed': 'The setting could not be saved.',
  'phone.settings.offline': 'Offline: the setting was not saved.',
  'phone.webNote': 'This browser does not count: only the Meeshy app on your phone tells whether it is reachable.',
} as const satisfies PhoneReachabilityCatalog;

export default en;
