import type { FastifyRequest } from 'fastify';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { CurrentSessionRef } from '../SessionService';

/**
 * **« Cet appareil-ci », lu sur la requête** (#9606) — le site UNIQUE où une
 * route de gestion de sessions apprend quelle session l'appelle.
 *
 * `GET /sessions`, `DELETE /sessions`, `POST /logout` et le changement de mot
 * de passe lisaient chacun `request.headers['x-session-token']`, qu'aucun
 * client inscrit n'envoie en REST. La liste ne marquait donc aucune session
 * comme courante, et « révoquer les autres » révoquait aussi l'appareil
 * courant.
 *
 * La voie nominale est le `sid` du JWT VÉRIFIÉ, posé sur le contexte par le
 * middleware unifié (`UnifiedAuthContext.sessionId`) — jamais relu dans le
 * jeton brut : seul le middleware sait que la signature est bonne. L'en-tête
 * reste lu, pour un client qui l'enverrait encore.
 */
export function currentSessionOf(request: FastifyRequest): CurrentSessionRef {
  const sessionId = (request as Partial<UnifiedAuthRequest>).authContext?.sessionId;
  const header = request.headers['x-session-token'];
  const sessionToken = typeof header === 'string' && header.trim() !== '' ? header.trim() : null;
  return { sessionId: sessionId ?? null, sessionToken };
}
