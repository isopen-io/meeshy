/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-es.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const esRevokeSessions = {
  'revokeSessions.title': '¿No fuiste tú?',
  'revokeSessions.body': 'Cierra la sesión de tu cuenta en todos los dispositivos, incluido el que acaba de iniciar sesión. Después tendrás que volver a iniciar sesión.',
  'revokeSessions.action': 'Cerrar sesión en todos los dispositivos',
  'revokeSessions.working': 'Cerrando sesión…',
  'revokeSessions.done.title': 'Se cerró la sesión en todos los dispositivos',
  'revokeSessions.done.body': 'Cambia tu contraseña la próxima vez que inicies sesión.',
  'revokeSessions.invalid': 'Este enlace de seguridad caducó o ya se usó. Inicia sesión para gestionar tus sesiones.',
  'revokeSessions.dismiss': 'Fui yo',
} as const;

export default esRevokeSessions;
