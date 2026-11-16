/**
 * Das unerreichbare Telefon nahestehender Personen und des Bluts (#18737, TEL-01), Deutsch — bei Bedarf geladen
 * (`i18n-phone-reachability-catalog.ts`), nie beim Start.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const de = {
  'phone.announce.unreachable': 'Das Telefon von {name} ist seit {time} nicht erreichbar',
  'phone.announce.unreachableSomeone': 'Das Telefon einer nahestehenden Person ist seit {time} nicht erreichbar',
  'phone.announce.reachable': 'Das Telefon von {name} antwortet wieder',
  'phone.announce.reachableSomeone': 'Das Telefon einer nahestehenden Person antwortet wieder',
  'phone.a11y.unreachable': 'Telefon seit {time} nicht erreichbar',
  'phone.detail.title': 'Telefon',
  'phone.detail.since': 'Telefon seit {time} nicht erreichbar',
  'phone.cause.battery': 'Wahrscheinlich leerer Akku',
  'phone.cause.network': 'Wahrscheinlich kein Netz oder Flugmodus',
  'phone.share.title': '{name} benachrichtigen, wenn mein Telefon nicht erreichbar ist',
  'phone.share.explainClose': '{name} erfährt, seit wann dein Telefon nicht mehr antwortet und warum wahrscheinlich. Nichts wird geteilt, bevor du es aktivierst.',
  'phone.share.explainBlood': 'Bei deinem Blut standardmäßig aktiviert. Du kannst es jederzeit entziehen.',
  'phone.share.globalOff': 'Du benachrichtigst niemanden mehr: Es ist für alle ausgeschaltet, in deinem Profil.',
  'phone.global.title': 'Meine Nahestehenden benachrichtigen, wenn mein Telefon nicht erreichbar ist',
  'phone.global.short': 'Telefon nicht erreichbar',
  'phone.global.explain': 'Dein Blut und die Nahestehenden, denen du es erlaubt hast, erfahren, seit wann dein Telefon nicht mehr antwortet und warum wahrscheinlich. Nie in einer Unterhaltung.',
  'phone.global.question': 'Wer wird benachrichtigt?',
  'phone.consent.title': '{name} benachrichtigen, wenn dein Telefon nicht mehr antwortet?',
  'phone.consent.body': '{name} erfährt, dass dein Telefon nicht erreichbar ist, seit wann, und ob es wahrscheinlich am Akku oder am Netz liegt. Du kannst das hier jederzeit ändern.',
  'phone.consent.confirm': 'Weiter',
  'phone.settings.failed': 'Die Einstellung konnte nicht gespeichert werden.',
  'phone.settings.offline': 'Offline: Die Einstellung wurde nicht gespeichert.',
  'phone.webNote': 'Dieser Browser zählt nicht: Nur die Meeshy-App auf deinem Telefon meldet, ob es erreichbar ist.',
} as const satisfies PhoneReachabilityCatalog;

export default de;
