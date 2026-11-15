import * as invitationsEndpoints from '@meeshy/shared/api/endpoints/invitations';
import * as linksEndpoints from '@meeshy/shared/api/endpoints/links';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import type { ApiFailure, ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import type { EmailGateReason } from './email-gate';

/**
 * **UN REFUS `EMAIL_NOT_VERIFIED` MÈNE À LA VALIDATION, PUIS L'ACTION REPART**
 * (#8365). La passerelle garde inviter par e-mail derrière une adresse prouvée
 * (`EMAIL_VERIFICATION_GATED_ROUTES`), publier derrière le délai de grâce de
 * l'adresse (`requirePublishingGrace`, #8476) et créer un lien derrière ce
 * même délai, au plus cinq liens actifs (`requireShareLinkGrace`, #9713) —
 * `services/gateway/src/middleware/verification-gates.ts`.
 *
 * Le transport est le SEUL site par lequel ces cinq routes passent : c'est donc
 * ici — une fois, pour tous les écrans — que le refus ouvre la validation de
 * l'e-mail, puis REJOUE la requête refusée. Même corps : le brouillon (texte,
 * médias déjà téléversés, réglages du lien) n'est jamais perdu, et l'écran qui
 * attendait sa réponse reçoit celle de la requête rejouée.
 *
 * Prévenir plutôt que guérir — pour INVITER seulement : quand la session SAIT
 * l'adresse non prouvée (`SessionUser.emailUnproven`), la validation s'ouvre
 * AVANT tout envoi ; si le lecteur la ferme, le refus est rendu sans
 * aller-retour. PUBLIER et CRÉER UN LIEN ne sont jamais retenus d'avance : la
 * passerelle les permet tant que le délai de grâce court (#8476), au plus cinq
 * liens actifs (#9713) — seul son refus ouvre la validation (#9715). Le refus
 * au plafond se reconnaît à son texte `error` : la vue dit alors qu'au-delà de
 * cinq liens actifs, l'adresse doit être prouvée. Une passerelle d'avant #9713,
 * qui refuse tout lien, rend le texte générique : la vue dit « pour créer un
 * lien », comme avant.
 */

const NEW_LINK = /^\/api\/v1\/conversations\/[^/]+\/new-link$/;

const pathOf = (request: HttpRequest): string => request.path.split('?')[0] ?? request.path;

export function emailGateReasonOf(request: HttpRequest): EmailGateReason | null {
  if (request.method !== 'POST') return null;
  const path = pathOf(request);
  if (path === postsEndpoints.root || path === postsEndpoints.fromAttachment) return 'publish';
  if (path === invitationsEndpoints.email) return 'invite';
  if (path === linksEndpoints.root || NEW_LINK.test(path)) return 'link';
  return null;
}

const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

const refusedLocally: ApiFailure = { ok: false, status: 403, error: 'Email verification required', code: EMAIL_NOT_VERIFIED };

/** Le texte du refus au plafond de liens actifs (`sendShareLinkGraceRefusal`,
 * `services/gateway/src/middleware/verification-gates.ts`). */
export const SHARE_LINK_CAP_REFUSAL = 'Email verification required to create more share links';

const HELD_BACK: ReadonlySet<EmailGateReason> = new Set(['invite']);

const reasonOfRefusal = (reason: EmailGateReason, refusal: ApiFailure): EmailGateReason =>
  reason === 'link' && refusal.error === SHARE_LINK_CAP_REFUSAL ? 'moreLinks' : reason;

export type EmailGatePort = {
  readonly ask: (reason: EmailGateReason) => Promise<boolean>;
  readonly emailUnproven: () => boolean;
};

export function withEmailGate(inner: HttpTransport, gate: EmailGatePort): HttpTransport {
  async function request<T>(sent: HttpRequest): Promise<ApiResult<T>> {
    const reason = emailGateReasonOf(sent);
    if (reason === null) return inner.request<T>(sent);
    if (HELD_BACK.has(reason) && gate.emailUnproven() && !(await gate.ask(reason))) return refusedLocally;
    const first = await inner.request<T>(sent);
    if (first.ok || first.code !== EMAIL_NOT_VERIFIED) return first;
    if (!(await gate.ask(reasonOfRefusal(reason, first)))) return first;
    return inner.request<T>(sent);
  }
  return Object.assign((sent: HttpRequest) => request(sent), { request }) as HttpTransport;
}
