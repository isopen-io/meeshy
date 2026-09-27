/**
 * LA MODAL « VALIDEZ VOTRE COMPTE » (#8239, loi serveur #8238) — tranche du
 * catalogue `catalog-en.ts`, extraite pour tenir le budget de taille
 * (CLAUDE.md) : le catalogue la RÉPAND. De J7 à J28, l'invitation à prouver
 * son adresse et à ajouter un numéro, sans quitter l'app.
 */
const enActivation = {
  'activation.invite.title': 'Verify your account',
  'activation.invite.daysLeft': 'You have {days} days left to verify your account. After that, signing in will require a code.',
  'activation.invite.daysLeft.one': 'You have 1 day left to verify your account. After that, signing in will require a code.',
  'activation.invite.lead': 'Verify your account to keep using it without interruption.',
  'activation.email.label': 'Confirm your email address',
  'activation.email.send': 'Get the code',
  'activation.email.sending': 'Sending…',
  'activation.email.sent': 'Code sent to {email}. Enter it below.',
  'activation.email.failed': 'The code couldn’t be sent. Please try again.',
  'activation.email.done': 'Email verified ✓',
  'activation.phone.label': 'Add a phone number to secure and recover your account',
  'activation.phone.add': 'Add my number',
  'activation.phone.field': 'Phone number',
  'activation.phone.hint': 'In international format, for example +1 415 555 0123',
  'activation.phone.send': 'Send the code',
  'activation.phone.code': 'Code received by SMS',
  'activation.phone.verify': 'Confirm',
  'activation.phone.busy': 'Sending…',
  'activation.phone.invalid': 'Enter a number in international format (+…).',
  'activation.phone.failed': 'This number couldn’t be saved. Please try again.',
  'activation.phone.codeInvalid': 'Invalid or expired code',
  'activation.phone.done': 'Number verified ✓',
  'activation.complete': 'Your account is verified. Thank you!',
  'activation.later': 'Later',
  'activation.close': 'Close',
  'activation.gate.title': 'Verify your email address',
  'activation.gate.publish': 'To publish, verify your address. Your post is kept and will go out as soon as the code is confirmed.',
  'activation.gate.invite': 'To invite by email, verify your address. Your invitation will go out as soon as the code is confirmed.',
  'activation.gate.link': 'To create a link, verify your address. Your link will be created as soon as the code is confirmed.',
} as const;

export default enActivation;
