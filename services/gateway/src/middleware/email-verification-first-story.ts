import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { requireEmailVerification, type UnifiedAuthRequest } from './auth';
import { sendForbidden } from '../utils/response';
import { hasAuthoredStory } from '../services/posts/firstStory';
import { enhancedLogger } from '../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'EmailVerificationFirstStory' });

const requestsAStory = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && Reflect.get(body, 'type') === 'STORY';

/**
 * **`requireEmailVerification`, SAUF pour la première story** (#7907) — la
 * garde de `POST /posts`.
 *
 * Tout ce que `requireEmailVerification` (#6437) refuse reste refusé, à une
 * exception près : un compte au courriel non vérifié qui n'a JAMAIS écrit de
 * story peut publier celle-ci (`services/posts/firstStory.ts`). Un post, un
 * reel, un statut, une seconde story, ou toute autre route de
 * `EMAIL_VERIFICATION_GATED_ROUTES` : 403 `EMAIL_NOT_VERIFIED`, inchangé.
 *
 * Le type se lit sur le CORPS brut (`preValidation` : déjà analysé, pas encore
 * validé) — un corps illisible n'est pas une story, donc la garde ordinaire
 * s'applique. Une lecture de la base qui échoue refuse : fail-closed.
 *
 * Deux premières stories envoyées dans la même milliseconde peuvent toutes
 * deux passer : la borne est d'UNE story en régime nominal, deux au pire sur
 * une course — un compte non vérifié ne gagne rien de plus.
 */
export function requireEmailVerificationUnlessFirstStory(prisma: Pick<PrismaClient, 'post'>) {
  return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as UnifiedAuthRequest).authContext?.registeredUser;
    if (!user || user.emailVerifiedAt || !requestsAStory(request.body)) {
      return requireEmailVerification(request, reply);
    }
    try {
      if (!(await hasAuthoredStory(prisma, user.id))) return;
    } catch (error) {
      log.warn('lecture des stories de l’auteur échouée — garde du courriel appliquée', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendForbidden(reply, 'Email verification required', { code: 'EMAIL_NOT_VERIFIED' });
  };
}
