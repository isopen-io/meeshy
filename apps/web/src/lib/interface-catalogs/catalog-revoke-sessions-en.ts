import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const en = {
  'revokeSessions.title': 'Wasn’t you?',
  'revokeSessions.body': 'Sign your account out of every device, including the one that just signed in. You will need to sign in again afterwards.',
  'revokeSessions.action': 'Sign out all devices',
  'revokeSessions.working': 'Signing out…',
  'revokeSessions.done.title': 'All devices are signed out',
  'revokeSessions.done.body': 'Change your password the next time you sign in.',
  'revokeSessions.invalid': 'This security link has expired or was already used. Sign in to manage your sessions.',
  'revokeSessions.dismiss': 'It was me',
} as const satisfies RevokeSessionsCatalog;

export default en;
