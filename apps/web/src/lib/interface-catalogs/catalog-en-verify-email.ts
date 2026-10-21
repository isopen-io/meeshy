/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-en.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const enVerifyEmail = {
  'verifyEmail.backToLogin': 'Back to sign in',
  'verifyEmail.verified': 'Email verified!',
  'verifyEmail.code.label': 'Verification code',
  'verifyEmail.submit': 'Verify',
  'verifyEmail.submit.busy': 'Verifying…',
  'verifyEmail.error.invalid': 'Invalid or expired code',
  'verifyEmail.error.offline': 'No connection. Check your network and try again.',
  'verifyEmail.error.rateLimited': 'Too many attempts — try again in a few minutes.',
  'verifyEmail.link.checking': 'Checking the link…',
  'verifyEmail.proven': 'Address confirmed ✓ — enter the code you received to sign in here.',
  'emailSent.codeOrLink': 'Enter the 6-digit code sent to {email}, or open the link in the same email.',
  'signInLink.switchAccount.title': 'Open a DIFFERENT account?',
  'signInLink.switchAccount.lead': 'You’re signed in as @{current}, but what you just opened leads to a different account:',
  'signInLink.switchAccount.warning': 'If you didn’t request this link or code yourself, cancel: you stay signed in and nothing changes.',
  'signInLink.switchAccount.cancel': 'Cancel and stay on @{current}',
  'signInLink.switchAccount.confirm': 'Open this other account',
  'signInLink.switchAccount.kept': '@{current} will stay in your accounts on this device.',
  'signInLink.switchAccount.busy': 'One moment…',
  'signInLink.switchAccount.failed': 'This other account can’t be opened right now. You stay signed in, and the link has been closed.',
  'signInLink.switchAccount.expired': 'This link has expired: request a new one. You stay signed in.',
  'signInLink.switchAccount.leave': 'Back to home',
  'emailSent.title': 'Email sent',
  'emailSent.openLink': 'Open the link sent to {email}',
  'emailSent.nothingReceived': 'Nothing received?',
  'emailSent.nothingReceived.text': 'Check your spam folder: the message may have landed there.',
};

export default enVerifyEmail;
