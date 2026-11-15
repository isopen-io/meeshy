/**
 * Le jeton du lien « ce n'était pas moi » — site UNIQUE d'émission et de
 * lecture (#10493).
 *
 * L'e-mail d'alerte « nouvelle connexion » porte un lien qui révoque toutes
 * les sessions du compte. Jusqu'à #10493, son jeton était
 * `{ userId, action: 'revoke-all' }` signé avec `JWT_SECRET` : la clé même
 * avec laquelle le REST, la connexion socket, la porte TUS et `POST /refresh`
 * vérifient un jeton d'authentification. Qui lisait l'e-mail tenait donc, 24
 * heures durant, un jeton que ces portes vérifiaient avec succès — la socket
 * l'admettait, faute de `sid`.
 *
 * Le jeton est désormais signé avec une clé DÉRIVÉE de `JWT_SECRET` par HMAC,
 * étiquetée pour ce seul usage, et porte une audience propre. Aucune porte
 * d'authentification ne vérifie avec cette clé : elles le refusent toutes à
 * la signature, sans avoir à le reconnaître.
 *
 * Transition (#9223) : les e-mails déjà partis portent l'ANCIENNE forme. Le
 * lien l'accepte encore, et lui seul — elle échoit d'elle-même 24 heures après
 * sa signature, et plus aucun site ne l'émet. Les portes d'authentification la
 * refusent déjà (pas de `sid`, et `sessionAdmissionRefusal` refuse toute
 * charge qui porte `action`).
 */

import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'RevokeAllLinkToken' });

export const REVOKE_ALL_LINK_AUDIENCE = 'meeshy:revoke-all-sessions-link';

const REVOKE_ALL_ACTION = 'revoke-all';
const REVOKE_ALL_LINK_TTL: jwt.SignOptions['expiresIn'] = '24h';
const KEY_LABEL = 'meeshy/revoke-all-sessions-link/v1';

function revokeAllLinkKey(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret).update(KEY_LABEL).digest('hex');
}

export function signRevokeAllLinkToken(params: {
  readonly userId: string;
  readonly jwtSecret: string;
}): string {
  return jwt.sign({ userId: params.userId, action: REVOKE_ALL_ACTION }, revokeAllLinkKey(params.jwtSecret), {
    audience: REVOKE_ALL_LINK_AUDIENCE,
    expiresIn: REVOKE_ALL_LINK_TTL,
  });
}

type LinkClaims = {
  readonly userId?: unknown;
  readonly action?: unknown;
  readonly sid?: unknown;
  readonly aud?: unknown;
  readonly exp?: unknown;
};

function verifiedClaims(token: string, key: string, options: jwt.VerifyOptions): LinkClaims | null {
  try {
    const claims = jwt.verify(token, key, options);
    return typeof claims === 'object' && claims !== null ? (claims as LinkClaims) : null;
  } catch {
    return null;
  }
}

function linkSubject(claims: LinkClaims | null): { readonly userId: string } | null {
  if (!claims || claims.action !== REVOKE_ALL_ACTION) return null;
  if (typeof claims.userId !== 'string' || claims.userId.length === 0) return null;
  return { userId: claims.userId };
}

/**
 * Le compte que le lien révoque, ou `null` quand le jeton n'est pas un jeton
 * de lien valide et non échu. L'ancienne forme n'est admise que nue — ni
 * `sid` ni audience : un jeton de session authentique n'en devient jamais un —
 * et DATÉE : toutes ses émissions portaient une échéance de 24 heures, si bien
 * que la transition se ferme d'elle-même un jour après le déploiement. Chaque
 * usage est journalisé, pour retirer cette branche à zéro usage mesuré (#9223).
 */
export function verifyRevokeAllLinkToken(
  token: string,
  jwtSecret: string
): { readonly userId: string } | null {
  const current = linkSubject(
    verifiedClaims(token, revokeAllLinkKey(jwtSecret), { audience: REVOKE_ALL_LINK_AUDIENCE })
  );
  if (current) return current;

  const legacy = verifiedClaims(token, jwtSecret, {});
  if (!legacy || legacy.sid !== undefined || legacy.aud !== undefined || typeof legacy.exp !== 'number') return null;
  const subject = linkSubject(legacy);
  if (subject) logger.info('[revoke-all] lien de l’ancienne forme honoré (transition #10493)');
  return subject;
}
