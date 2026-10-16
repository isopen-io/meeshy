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
} satisfies AccountRecoveryCatalog;

export default en;
