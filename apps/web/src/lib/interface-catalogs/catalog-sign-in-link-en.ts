import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const en = {
  'signInLink.confirm.title': 'Sign in as @{username}?',
  'signInLink.confirm.lead': 'This link wasn’t requested from this device. Only continue if this account is yours.',
  'signInLink.confirm.leadSignedIn': 'You’re signed in as @{current}. This link would open the account below instead; @{current} will stay in your accounts on this device.',
  'signInLink.confirm.accept': 'Sign in',
  'signInLink.confirm.cancel': 'Cancel',
  'signInLink.confirm.claim': 'This address will be attached to @{username} and removed from any other Meeshy account.',
  'signInLink.confirm.acceptClaim': 'Attach the address and sign in',
  'verifyEmail.bar.title': 'Email verification',
  'verifyEmail.noAddress': 'This link doesn’t include an email address to verify. Open it from the email Meeshy sent you.',
  'verifyEmail.continue': 'Continue',
  'verifyEmail.title': 'Check your email',
  'verifyEmail.subtitle': 'Enter the 6-digit code sent to {email}',
  'verifyEmail.subtitle.created': 'We created your account and sent a code and a link to {email}. Enter the code or open the link.',
  'verifyEmail.subtitle.pending': 'Your password is correct, but your account must first be activated by proving this address is yours. We just sent a code and a link to {email}.',
  'verifyEmail.subtitle.pending.inbox': 'Open your inbox, and remember to check your spam folder.',
  'verifyEmail.resend.prompt': 'Didn’t get the code?',
  'verifyEmail.resend': 'Resend code',
  'verifyEmail.resend.busy': 'Sending…',
  'verifyEmail.resend.locked': 'Resend code ({seconds}s)',
  'verifyEmail.resend.done': 'Code sent again!',
  'verifyEmail.link.invalid': 'This link is no longer valid. Enter the code from the same email.',
  'verifyEmail.handoff.opened': 'The link was opened in the Meeshy app.',
  'verifyEmail.handoff.stay': 'Continue in the browser',
  'verifyEmail.arrival.title': 'Address confirmed!',
  'verifyEmail.arrival.lead': 'Getting your conversations ready…',
  'verifyEmail.arrival.status': 'Address confirmed — signing in…',
} satisfies SignInLinkCatalog;

export default en;
