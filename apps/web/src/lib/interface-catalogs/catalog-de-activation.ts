/**
 * LA MODAL « VALIDEZ VOTRE COMPTE » (#8239, loi serveur #8238) — tranche du
 * catalogue `catalog-de.ts`, extraite pour tenir le budget de taille
 * (CLAUDE.md) : le catalogue la RÉPAND. De J7 à J28, l'invitation à prouver
 * son adresse et à ajouter un numéro, sans quitter l'app.
 */
const deActivation = {
  'activation.invite.title': 'Bestätige dein Konto',
  'activation.invite.daysLeft': 'Du hast noch {days} Tage, um dein Konto zu bestätigen. Danach verlangt die Anmeldung einen Code.',
  'activation.invite.daysLeft.one': 'Du hast noch 1 Tag, um dein Konto zu bestätigen. Danach verlangt die Anmeldung einen Code.',
  'activation.invite.lead': 'Bestätige dein Konto, um es ohne Unterbrechung weiter zu nutzen.',
  'activation.email.label': 'Bestätige deine E-Mail-Adresse',
  'activation.email.send': 'Code erhalten',
  'activation.email.sending': 'Wird gesendet…',
  'activation.email.sent': 'Code an {email} gesendet. Gib ihn unten ein.',
  'activation.email.failed': 'Der Code konnte nicht gesendet werden. Bitte versuche es erneut.',
  'activation.email.done': 'E-Mail bestätigt ✓',
  'activation.phone.label': 'Füge eine Telefonnummer hinzu, um dein Konto zu schützen und wiederherzustellen',
  'activation.phone.add': 'Meine Nummer hinzufügen',
  'activation.phone.field': 'Telefonnummer',
  'activation.phone.hint': 'Im internationalen Format, zum Beispiel +49 151 23456789',
  'activation.phone.send': 'Code senden',
  'activation.phone.code': 'Per SMS erhaltener Code',
  'activation.phone.verify': 'Bestätigen',
  'activation.phone.busy': 'Wird gesendet…',
  'activation.phone.invalid': 'Gib eine Nummer im internationalen Format ein (+…).',
  'activation.phone.failed': 'Diese Nummer konnte nicht gespeichert werden. Bitte versuche es erneut.',
  'activation.phone.codeInvalid': 'Ungültiger oder abgelaufener Code',
  'activation.phone.done': 'Nummer bestätigt ✓',
  'activation.complete': 'Dein Konto ist bestätigt. Danke!',
  'activation.later': 'Später',
  'activation.close': 'Schließen',
} as const;

export default deActivation;
