import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendUnauthorized, sendForbidden } from '../utils/response';
import { mayPublish } from '../services/auth/account-activation';
import type { UnifiedAuthRequest } from './auth';

/**
 * LA MÊME DISTINCTION QUE `requireRole` ci-dessus (#4760). Pas de session ⇒
 * 401 `UNAUTHORIZED` ; session valide mais e-mail non vérifié ⇒ 403
 * `EMAIL_NOT_VERIFIED`. Le premier cas rendait ici `403 PERMISSION_DENIED`,
 * c'est-à-dire le code d'un refus de DROIT pour une absence d'IDENTITÉ.
 *
 * Montée depuis #6437 sur `EMAIL_VERIFICATION_GATED_ROUTES` ci-dessous — la
 * décision retenue (documentée sur l'issue) est la réponse intermédiaire que
 * l'issue proposait : ce qui SORT du compte vers d'autres personnes.
 */
export async function requireEmailVerification(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    return;
  }

  if (!authContext.registeredUser.emailVerifiedAt) {
    sendForbidden(reply, 'Email verification required', { code: 'EMAIL_NOT_VERIFIED' });
    return;
  }
}

/**
 * **PUBLIER SUIT LE DÉLAI DE GRÂCE DE L'ADRESSE** (#8476) — la garde de
 * `POST /posts` et `POST /posts/from-attachment`.
 *
 * Directive porteur 2026-09-28 : « tant qu'on n'a pas dépassé la limite dure
 * de validation de son compte on doit pouvoir publier ». La loi est celle de
 * #8238 (`services/auth/account-activation.ts`), servie sur
 * `registeredUser.activation` : une adresse non prouvée ne retient rien tant
 * que la phase n'est pas `blocked`. Elle REMPLACE, pour publier, la garde de
 * #6437 et son exception « première story » (#7907), désormais subsumée.
 *
 * Fail-closed : une adresse non prouvée SANS activation servie est refusée —
 * 403 `EMAIL_NOT_VERIFIED`, le refus que les clients savent mener à la
 * validation.
 */
export async function requirePublishingGrace(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    return;
  }

  const { emailVerifiedAt, activation } = authContext.registeredUser;
  if (emailVerifiedAt || mayPublish(activation)) return;

  sendForbidden(reply, 'Email verification required', { code: 'EMAIL_NOT_VERIFIED' });
}

/**
 * Routes qui exigent un e-mail CONFIRMÉ (#6437) — une constante, pas une
 * prose, comme l'exige le critère de fin de l'issue. Décision : ce qui SORT
 * du compte vers d'AUTRES ADRESSES — inviter par e-mail, créer un lien de
 * partage. Publier n'y figure plus depuis #8476 : il suit le délai de grâce
 * (`requirePublishingGrace` ci-dessus).
 */
export const EMAIL_VERIFICATION_GATED_ROUTES = [
  'POST /invitations/email',
  'POST /links',
  'POST /conversations/:id/new-link',
] as const;

export const PUBLISHING_GRACE_GATED_ROUTES = [
  'POST /posts',
  'POST /posts/from-attachment',
] as const;

