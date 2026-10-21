import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const de = {
  'recovery.forgot.lead': 'Erhalte per E-Mail einen Link, um ein neues Passwort festzulegen.',
  'recovery.forgot.neverHad': 'Noch nie ein Passwort gehabt?',
  'recovery.forgot.neverHad.text': 'Mit demselben Link kannst du eines erstellen.',
  'recovery.reset.newPassword': 'Neues Passwort',
  'recovery.reset.lead': 'Wähle ein neues Passwort.',
  'recovery.reset.confirm': 'Passwort bestätigen',
  'recovery.reset.tooShort': 'Passwort zu kurz (mind. {min} Zeichen)',
  'recovery.reset.mismatch': 'Passwörter stimmen nicht überein',
  'recovery.reset.submit': 'Passwort speichern',
  'recovery.reset.submit.busy': 'Wird gespeichert…',
  'recovery.reset.invalid.title': 'Ungültiger oder abgelaufener Link',
  'recovery.reset.invalid.text': 'Fordere einen neuen Link an, um dein Passwort festzulegen.',
  'recovery.reset.invalid.action': 'Neuen Link anfordern',
  'recovery.reset.done.title': 'Passwort gespeichert',
  'recovery.reset.done.text': 'Du kannst dich jetzt mit deinem neuen Passwort anmelden.',
  'recovery.reset.code': 'Bestätigungscode',
  'recovery.reset.code.lead': 'Gib den 6-stelligen Code aus deiner Authenticator-App ein.',
  'recovery.reset.error.codeRequired': 'Dieses Konto ist geschützt: Gib den Bestätigungscode aus deiner Authenticator-App ein.',
  'recovery.reset.error.codeInvalid': 'Falscher Bestätigungscode.',
  'recovery.reset.error.weak': 'Dieses Passwort ist zu leicht zu erraten. Wähle ein längeres oder weniger vorhersehbares.',
  'recovery.reset.error.reused': 'Du hast dieses Passwort kürzlich verwendet. Wähle ein anderes.',
  'recovery.reset.error.rateLimited': 'Zu viele Versuche. Warte ein paar Minuten, bevor du es erneut versuchst.',
  'recovery.reset.error.locked': 'Dieses Konto ist vorübergehend gesperrt. Wende dich an den Support.',
  'recovery.reset.exhausted.title': 'Zu viele falsche Codes',
  'recovery.reset.exhausted.text': 'Zu deiner Sicherheit wurde dieser Link deaktiviert. Fordere einen neuen an.',
} satisfies AccountRecoveryCatalog;

export default de;
