import { createHash } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type { UnifiedAuthContext } from '../../../middleware/auth';

/**
 * Le VISITEUR d'un lien, tel que le crédit `social.link_visit` le compte
 * (#8959) : son compte quand il est connecté, sinon une empreinte stable de
 * son adresse et de son navigateur.
 *
 * Tout vient de la REQUÊTE, jamais du corps : `request.ip` porte l'adresse de
 * l'appelant depuis que `trustProxy` est posé (#4137), et l'agent utilisateur
 * est l'en-tête reçu. Un visiteur qui choisirait sa clé choisirait combien de
 * fois il compte.
 */
export type LinkVisitor = {
  readonly key: string;
  readonly userId: string | null;
};

export type LinkVisitorRequest = {
  readonly ip: string;
  readonly headers: IncomingHttpHeaders;
  readonly authContext?: UnifiedAuthContext;
};

const registeredUserId = (authContext: UnifiedAuthContext | undefined): string | null => {
  if (!authContext || authContext.type !== 'user' || authContext.isAnonymous) return null;
  return authContext.userId ?? authContext.registeredUser?.id ?? null;
};

const userAgentOf = (headers: IncomingHttpHeaders): string => {
  const value = headers['user-agent'];
  return Array.isArray(value) ? value.join(' ') : value ?? '';
};

export function linkVisitorFromRequest(request: LinkVisitorRequest): LinkVisitor {
  const userId = registeredUserId(request.authContext);
  if (userId) return { key: `user:${userId}`, userId };
  const fingerprint = createHash('sha256').update(`${request.ip}|${userAgentOf(request.headers)}`).digest('hex');
  return { key: `anon:${fingerprint}`, userId: null };
}

/** Ce qu'un site de visite demande au moteur d'engagement — un double en test. */
export type LinkVisitRecorder = {
  recordLinkVisit(visit: {
    readonly creatorId: string;
    readonly linkKey: string;
    readonly visitorKey: string;
    readonly visitorUserId?: string | null;
  }): Promise<number>;
};
