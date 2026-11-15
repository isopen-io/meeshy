import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const es = {
  'revokeSessions.title': '¿No fuiste tú?',
  'revokeSessions.body': 'Cierra la sesión de tu cuenta en todos los dispositivos, incluido el que acaba de iniciar sesión. Después tendrás que volver a iniciar sesión.',
  'revokeSessions.action': 'Cerrar sesión en todos los dispositivos',
  'revokeSessions.working': 'Cerrando sesión…',
  'revokeSessions.done.title': 'Se cerró la sesión en todos los dispositivos',
  'revokeSessions.done.body': 'Cambia tu contraseña la próxima vez que inicies sesión.',
  'revokeSessions.invalid': 'Este enlace de seguridad caducó o ya se usó. Inicia sesión para gestionar tus sesiones.',
  'revokeSessions.dismiss': 'Fui yo',
} as const satisfies RevokeSessionsCatalog;

export default es;
