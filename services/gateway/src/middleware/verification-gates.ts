import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendUnauthorized, sendForbidden } from '../utils/response';
import { mayPublish } from '../services/auth/account-activation';
import {
  UNVERIFIED_ACTIVE_SHARE_LINK_CAP,
  shareLinkGraceAllows,
  shareLinkGraceVerdict,
  takeShareLinkTurn,
  type ShareLinkGraceVerdict,
} from '../services/auth/share-link-grace';
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
 * Le refus de la loi des liens de partage (#9713).
 *
 * À la CRÉATION, il garde le code `EMAIL_NOT_VERIFIED` : c'est celui que le
 * web (`apps/web/src/lib/activation/email-gated-transport.ts`) et iOS
 * (`EmailVerificationGate`) savent mener à la validation de l'adresse PUIS
 * rejouer — et une fois l'adresse prouvée, la création rejouée passe. Seul le
 * texte `error` distingue le plafond.
 *
 * À la RÉOUVERTURE, la loi est celle du CRÉATEUR du lien, qui n'est pas
 * toujours l'appelant (un co-administrateur peut rouvrir le lien d'un autre) :
 * `SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED`, qui ne prétend rien de l'adresse de
 * l'appelant. Les clients ne mènent à la validation que sur un `POST` : ce
 * code ne change rien à ce qu'ils font aujourd'hui.
 */
export function sendShareLinkGraceRefusal(
  reply: FastifyReply,
  verdict: ShareLinkGraceVerdict,
  gesture: 'create' | 'reopen' = 'create',
): void {
  if (gesture === 'reopen') {
    sendForbidden(reply, 'Share link creator must verify their e-mail', {
      code: 'SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED',
      message: verdict === 'cap-reached'
        ? `The creator of this link has not verified their e-mail and already has ${UNVERIFIED_ACTIVE_SHARE_LINK_CAP} active share links.`
        : 'The creator of this link must verify their e-mail before it can be reopened.',
    });
    return;
  }
  if (verdict === 'cap-reached') {
    sendForbidden(reply, 'Email verification required to create more share links', {
      code: 'EMAIL_NOT_VERIFIED',
      message: `An unverified address can keep at most ${UNVERIFIED_ACTIVE_SHARE_LINK_CAP} active share links: verify your e-mail to create more.`,
    });
    return;
  }
  sendForbidden(reply, 'Email verification required', { code: 'EMAIL_NOT_VERIFIED' });
}

/**
 * La garde de `POST /links` et `POST /conversations/:id/new-link` (#9713) —
 * la loi vit dans `services/auth/share-link-grace.ts` :
 *
 * | appelant                                         | verdict                         |
 * |--------------------------------------------------|---------------------------------|
 * | adresse prouvée (`emailVerifiedAt`)               | passe, sans compter ni attendre |
 * | non prouvée, délai en cours (`mayPublish`)        | passe sous 5 liens actifs       |
 * | non prouvée, 5 liens actifs ou plus               | 403 `EMAIL_NOT_VERIFIED`        |
 * | délai échu (`blocked`) ou activation absente      | 403 `EMAIL_NOT_VERIFIED`        |
 *
 * Course : la garde prend le TOUR du compte (`takeShareLinkTurn`) avant de
 * compter, et ne le rend qu'à la fermeture de la réponse — comptage ET
 * insertion sont couverts, la création suivante compte une fois la
 * précédente écrite. Une réponse déjà close (client parti pendant le
 * comptage) rend le tour sur-le-champ. Reste hors d'atteinte d'un verrou en
 * mémoire : plusieurs instances de passerelle (il n'y en a qu'une) — au plus
 * un lien de trop par instance supplémentaire.
 */
export async function requireShareLinkGrace(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    return;
  }

  const { id: userId, emailVerifiedAt, activation } = authContext.registeredUser;
  if (emailVerifiedAt) return;
  if (!mayPublish(activation)) {
    sendShareLinkGraceRefusal(reply, 'grace-over');
    return;
  }

  const release = await takeShareLinkTurn(userId);
  try {
    const verdict = await shareLinkGraceVerdict({
      prisma: request.server.prisma,
      userId,
      emailVerifiedAt,
      activation,
      now: new Date(),
    });
    if (!shareLinkGraceAllows(verdict)) {
      release();
      sendShareLinkGraceRefusal(reply, verdict);
      return;
    }
  } catch (error) {
    release();
    throw error;
  }

  if (reply.raw.destroyed || reply.raw.writableFinished) {
    release();
    return;
  }
  reply.raw.once('close', release);
}

/**
 * Routes qui exigent un e-mail CONFIRMÉ (#6437) — une constante, pas une
 * prose, comme l'exige le critère de fin de l'issue. Décision : ce qui écrit
 * à une ADRESSE TIERCE — inviter par e-mail. Publier n'y figure plus depuis
 * #8476 (`requirePublishingGrace`), ni créer un lien de partage depuis #9713
 * (`requireShareLinkGrace`).
 */
export const EMAIL_VERIFICATION_GATED_ROUTES = [
  'POST /invitations/email',
] as const;

export { UNVERIFIED_ACTIVE_SHARE_LINK_CAP, activeShareLinksWhere } from '../services/auth/share-link-grace';

/** Les routes de `requireShareLinkGrace` (#9713). */
export const SHARE_LINK_GRACE_GATED_ROUTES = [
  'POST /links',
  'POST /conversations/:id/new-link',
] as const;

export const PUBLISHING_GRACE_GATED_ROUTES = [
  'POST /posts',
  'POST /posts/from-attachment',
] as const;

