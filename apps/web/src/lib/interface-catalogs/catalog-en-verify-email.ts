/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-en.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const enVerifyEmail = {
  'verifyEmail.bar.title': 'Email verification',
  'verifyEmail.noAddress': 'This link doesn’t include an email address to verify. Open it from the email Meeshy sent you.',
  'verifyEmail.backToLogin': 'Back to sign in',
  'verifyEmail.verified': 'Email verified!',
  'verifyEmail.continue': 'Continue',
  'verifyEmail.title': 'Check your email',
  'verifyEmail.subtitle': 'Enter the 6-digit code sent to {email}',
  'verifyEmail.subtitle.created': 'We created your account and sent a code and a link to {email}. Enter the code or open the link.',
  'verifyEmail.subtitle.pending': 'Your account is waiting to be verified: we sent a new code and link to {email}.',
  'verifyEmail.code.label': 'Verification code',
  'verifyEmail.submit': 'Verify',
  'verifyEmail.submit.busy': 'Verifying…',
  'verifyEmail.error.invalid': 'Invalid or expired code',
  'verifyEmail.error.offline': 'No connection. Check your network and try again.',
  'verifyEmail.error.rateLimited': 'Too many attempts — try again in a few minutes.',
  'verifyEmail.resend.prompt': 'Didn’t get the code?',
  'verifyEmail.resend': 'Resend code',
  'verifyEmail.resend.busy': 'Sending…',
  'verifyEmail.resend.locked': 'Resend code ({seconds}s)',
  'verifyEmail.resend.done': 'Code sent again!',
  'verifyEmail.link.checking': 'Checking the link…',
  'verifyEmail.link.invalid': 'This link is no longer valid. Enter the code from the same email.',
  'verifyEmail.signingIn': 'Signing in…',
  'emailSent.codeOrLink': 'Enter the 6-digit code sent to {email}, or open the link in the same email.',
};

export default enVerifyEmail;
