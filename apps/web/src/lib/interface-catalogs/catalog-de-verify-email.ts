/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-de.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const deVerifyEmail = {
  'verifyEmail.bar.title': 'E-Mail-Bestätigung',
  'verifyEmail.noAddress': 'Dieser Link enthält keine zu bestätigende E-Mail-Adresse. Öffne ihn aus der E-Mail, die Meeshy dir geschickt hat.',
  'verifyEmail.backToLogin': 'Zurück zur Anmeldung',
  'verifyEmail.verified': 'E-Mail bestätigt!',
  'verifyEmail.continue': 'Weiter',
  'verifyEmail.title': 'Prüfe deine E-Mails',
  'verifyEmail.subtitle': 'Gib den 6-stelligen Code ein, der an {email} gesendet wurde',
  'verifyEmail.subtitle.created': 'Wir haben dein Konto erstellt und einen Code und einen Link an {email} gesendet. Gib den Code ein oder öffne den Link.',
  'verifyEmail.subtitle.pending': 'Dein Konto wartet auf die Bestätigung: Wir haben einen neuen Code und Link an {email} gesendet.',
  'verifyEmail.code.label': 'Bestätigungscode',
  'verifyEmail.submit': 'Bestätigen',
  'verifyEmail.submit.busy': 'Wird bestätigt…',
  'verifyEmail.error.invalid': 'Ungültiger oder abgelaufener Code',
  'verifyEmail.error.offline': 'Keine Verbindung. Prüfe dein Netzwerk und versuche es erneut.',
  'verifyEmail.error.rateLimited': 'Zu viele Versuche – versuche es in ein paar Minuten erneut.',
  'verifyEmail.resend.prompt': 'Keinen Code erhalten?',
  'verifyEmail.resend': 'Code erneut senden',
  'verifyEmail.resend.busy': 'Wird gesendet…',
  'verifyEmail.resend.locked': 'Code erneut senden ({seconds}s)',
  'verifyEmail.resend.done': 'Code erneut gesendet!',
  'verifyEmail.link.checking': 'Link wird geprüft…',
  'verifyEmail.link.invalid': 'Dieser Link ist nicht mehr gültig. Gib den Code aus derselben E-Mail ein.',
  'verifyEmail.proven': 'Adresse bestätigt ✓ — gib den erhaltenen Code ein, um dich hier anzumelden.',
  'verifyEmail.handoff.opened': 'Der Link wurde in der Meeshy-App geöffnet.',
  'verifyEmail.handoff.stay': 'Im Browser fortfahren',
  'verifyEmail.signingIn': 'Anmeldung…',
  'emailSent.codeOrLink': 'Gib den 6-stelligen Code ein, der an {email} gesendet wurde, oder öffne den Link in derselben E-Mail.',
};

export default deVerifyEmail;
