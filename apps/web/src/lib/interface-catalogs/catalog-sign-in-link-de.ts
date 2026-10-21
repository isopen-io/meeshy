import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const de = {
  'signInLink.confirm.title': 'Als @{username} anmelden?',
  'signInLink.confirm.lead': 'Dieser Link wurde nicht auf diesem Gerät angefordert. Fahre nur fort, wenn dieses Konto dir gehört.',
  'signInLink.confirm.leadSignedIn': 'Du bist als @{current} angemeldet. Dieser Link würde stattdessen das Konto unten öffnen; @{current} bleibt in deinen Konten auf diesem Gerät.',
  'signInLink.confirm.accept': 'Anmelden',
  'signInLink.confirm.cancel': 'Abbrechen',
  'signInLink.confirm.claim': 'Diese Adresse wird @{username} zugeordnet und aus jedem anderen Meeshy-Konto entfernt.',
  'signInLink.confirm.acceptClaim': 'Adresse zuordnen und anmelden',
  'verifyEmail.bar.title': 'E-Mail-Bestätigung',
  'verifyEmail.noAddress': 'Dieser Link enthält keine zu bestätigende E-Mail-Adresse. Öffne ihn aus der E-Mail, die Meeshy dir geschickt hat.',
  'verifyEmail.continue': 'Weiter',
  'verifyEmail.title': 'Prüfe deine E-Mails',
  'verifyEmail.subtitle': 'Gib den 6-stelligen Code ein, der an {email} gesendet wurde',
  'verifyEmail.subtitle.created': 'Wir haben dein Konto erstellt und einen Code und einen Link an {email} gesendet. Gib den Code ein oder öffne den Link.',
  'verifyEmail.subtitle.pending': 'Dein Passwort ist richtig, aber dein Konto muss zuerst aktiviert werden, indem du bestätigst, dass diese Adresse dir gehört. Wir haben gerade einen Code und einen Link an {email} gesendet.',
  'verifyEmail.subtitle.pending.inbox': 'Öffne dein Postfach und sieh auch im Spam-Ordner nach.',
  'verifyEmail.resend.prompt': 'Keinen Code erhalten?',
  'verifyEmail.resend': 'Code erneut senden',
  'verifyEmail.resend.busy': 'Wird gesendet…',
  'verifyEmail.resend.locked': 'Code erneut senden ({seconds}s)',
  'verifyEmail.resend.done': 'Code erneut gesendet!',
  'verifyEmail.link.invalid': 'Dieser Link ist nicht mehr gültig. Gib den Code aus derselben E-Mail ein.',
  'verifyEmail.handoff.opened': 'Der Link wurde in der Meeshy-App geöffnet.',
  'verifyEmail.handoff.stay': 'Im Browser fortfahren',
  'verifyEmail.arrival.title': 'Adresse bestätigt!',
  'verifyEmail.arrival.lead': 'Deine Unterhaltungen werden vorbereitet…',
  'verifyEmail.arrival.status': 'Adresse bestätigt — Anmeldung…',
} satisfies SignInLinkCatalog;

export default de;
