import { createHmac, randomBytes } from 'crypto';
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

/**
 * LA CLÉ du visiteur non inscrit (conformité H-6, RGPD art. 4(5) et 5(1)(e)) : une
 * empreinte HMAC à clé SECRÈTE ET TOURNANTE, jamais un `sha256(ip|ua)` sans clé — un
 * condensé d'une adresse IP se retrouve en quelques secondes en essayant les
 * adresses, donc n'est pas une anonymisation. La clé de la période est dérivée du
 * secret du serveur (`LINK_VISITOR_HMAC_SECRET`, à défaut un secret tiré au
 * démarrage du processus — il ne sort jamais) et de la SEMAINE : passé la
 * rotation, deux visites du même visiteur ne se relient plus. Les seaux
 * `visit:*` qui portent ces empreintes sont purgés à la fin de la fenêtre
 * (`EngagementQuotas.purgeVisitBuckets`).
 */
const PROCESS_SECRET = randomBytes(32).toString('hex');
const ROTATION_MS = 7 * 24 * 60 * 60 * 1000;

const visitorSecret = (): string => process.env.LINK_VISITOR_HMAC_SECRET || PROCESS_SECRET;

/** Le numéro de la période de rotation : change toutes les semaines. */
export const visitorKeyPeriod = (now: number = Date.now()): number => Math.floor(now / ROTATION_MS);

export function anonymousVisitorFingerprint(params: { readonly ip: string; readonly userAgent: string; readonly now?: number }): string {
  const periodKey = createHmac('sha256', visitorSecret()).update(`period:${visitorKeyPeriod(params.now)}`).digest();
  return createHmac('sha256', periodKey).update(`${params.ip}|${params.userAgent}`).digest('hex');
}

export function linkVisitorFromRequest(request: LinkVisitorRequest): LinkVisitor {
  const userId = registeredUserId(request.authContext);
  if (userId) return { key: `user:${userId}`, userId };
  return { key: `anon:${anonymousVisitorFingerprint({ ip: request.ip, userAgent: userAgentOf(request.headers) })}`, userId: null };
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
