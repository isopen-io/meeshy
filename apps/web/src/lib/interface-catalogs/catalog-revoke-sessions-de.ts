import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const de = {
  'revokeSessions.title': 'Das warst nicht du?',
  'revokeSessions.body': 'Melde dein Konto auf allen Geräten ab, auch auf dem, das sich gerade angemeldet hat. Danach musst du dich erneut anmelden.',
  'revokeSessions.action': 'Alle Geräte abmelden',
  'revokeSessions.working': 'Abmeldung…',
  'revokeSessions.done.title': 'Alle Geräte sind abgemeldet',
  'revokeSessions.done.body': 'Ändere dein Passwort bei der nächsten Anmeldung.',
  'revokeSessions.invalid': 'Dieser Sicherheitslink ist abgelaufen oder wurde bereits verwendet. Melde dich an, um deine Sitzungen zu verwalten.',
  'revokeSessions.dismiss': 'Das war ich',
} as const satisfies RevokeSessionsCatalog;

export default de;
