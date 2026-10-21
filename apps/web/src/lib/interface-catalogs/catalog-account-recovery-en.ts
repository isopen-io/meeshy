import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const en = {
  'recovery.forgot.lead': 'Get a link by email to choose a new password.',
  'recovery.forgot.neverHad': 'Never had a password?',
  'recovery.forgot.neverHad.text': 'The same link lets you create one.',
  'recovery.reset.newPassword': 'New password',
  'recovery.reset.lead': 'Choose a new password.',
  'recovery.reset.confirm': 'Confirm password',
  'recovery.reset.tooShort': 'Password too short (min {min} characters)',
  'recovery.reset.mismatch': 'Passwords do not match',
  'recovery.reset.submit': 'Save password',
  'recovery.reset.submit.busy': 'Saving…',
  'recovery.reset.invalid.title': 'Invalid or expired link',
  'recovery.reset.invalid.text': 'Request a new link to choose your password.',
  'recovery.reset.invalid.action': 'Request a new link',
  'recovery.reset.done.title': 'Password saved',
  'recovery.reset.done.text': 'You can now sign in with your new password.',
  'recovery.reset.code': 'Verification code',
  'recovery.reset.code.lead': 'Enter the 6-digit code from your authenticator app.',
  'recovery.reset.error.codeRequired': 'This account is protected: enter the verification code from your authenticator app.',
  'recovery.reset.error.codeInvalid': 'Incorrect verification code.',
  'recovery.reset.error.weak': 'This password is too easy to guess. Choose a longer or less predictable one.',
  'recovery.reset.error.reused': 'You used this password recently. Choose a different one.',
  'recovery.reset.error.rateLimited': 'Too many attempts. Wait a few minutes before trying again.',
  'recovery.reset.error.locked': 'This account is temporarily locked. Contact support.',
  'recovery.reset.exhausted.title': 'Too many incorrect codes',
  'recovery.reset.exhausted.text': 'For your security, this link has been disabled. Request a new one.',
} satisfies AccountRecoveryCatalog;

export default en;
