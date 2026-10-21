/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-de.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const deVerifyEmail = {
  'verifyEmail.backToLogin': 'Zurück zur Anmeldung',
  'verifyEmail.verified': 'E-Mail bestätigt!',
  'verifyEmail.code.label': 'Bestätigungscode',
  'verifyEmail.submit': 'Bestätigen',
  'verifyEmail.submit.busy': 'Wird bestätigt…',
  'verifyEmail.error.invalid': 'Ungültiger oder abgelaufener Code',
  'verifyEmail.error.offline': 'Keine Verbindung. Prüfe dein Netzwerk und versuche es erneut.',
  'verifyEmail.error.rateLimited': 'Zu viele Versuche – versuche es in ein paar Minuten erneut.',
  'verifyEmail.link.checking': 'Link wird geprüft…',
  'verifyEmail.proven': 'Adresse bestätigt ✓ — gib den erhaltenen Code ein, um dich hier anzumelden.',
  'emailSent.codeOrLink': 'Gib den 6-stelligen Code ein, der an {email} gesendet wurde, oder öffne den Link in derselben E-Mail.',
  'signInLink.switchAccount.title': 'Ein ANDERES Konto öffnen?',
  'signInLink.switchAccount.lead': 'Du bist als @{current} angemeldet, aber was du gerade geöffnet hast, führt zu einem anderen Konto:',
  'signInLink.switchAccount.warning': 'Wenn du diesen Link oder Code nicht selbst angefordert hast, brich ab: Du bleibst angemeldet und nichts ändert sich.',
  'signInLink.switchAccount.cancel': 'Abbrechen und bei @{current} bleiben',
  'signInLink.switchAccount.confirm': 'Dieses andere Konto öffnen',
  'signInLink.switchAccount.kept': '@{current} bleibt in deinen Konten auf diesem Gerät.',
  'signInLink.switchAccount.busy': 'Einen Moment…',
  'signInLink.switchAccount.failed': 'Dieses andere Konto lässt sich gerade nicht öffnen. Du bleibst angemeldet, und der Link wurde geschlossen.',
  'signInLink.switchAccount.expired': 'Dieser Link ist abgelaufen: Fordere einen neuen an. Du bleibst angemeldet.',
  'signInLink.switchAccount.leave': 'Zurück zur Startseite',
  'emailSent.title': 'E-Mail gesendet',
  'emailSent.openLink': 'Öffne den Link, gesendet an {email}',
  'emailSent.nothingReceived': 'Nichts erhalten?',
  'emailSent.nothingReceived.text': 'Sieh in deinem Spam-Ordner nach: Die Nachricht könnte dort gelandet sein.',
};

export default deVerifyEmail;
