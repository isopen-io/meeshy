import * as invitationsEndpoints from '@meeshy/shared/api/endpoints/invitations';
import * as linksEndpoints from '@meeshy/shared/api/endpoints/links';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import type { ApiFailure, ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import type { EmailGateReason } from './email-gate';

/**
 * **UN REFUS `EMAIL_NOT_VERIFIED` MÈNE À LA VALIDATION, PUIS L'ACTION REPART**
 * (#8365). La garde serveur de #6437 reste en place
 * (`EMAIL_VERIFICATION_GATED_ROUTES`, `services/gateway/src/middleware/auth.ts`) :
 * publier, inviter par e-mail et créer un lien exigent une adresse prouvée.
 *
 * Le transport est le SEUL site par lequel ces cinq routes passent : c'est donc
 * ici — une fois, pour tous les écrans — que le refus ouvre la validation de
 * l'e-mail, puis REJOUE la requête refusée. Même corps : le brouillon (texte,
 * médias déjà téléversés, réglages du lien) n'est jamais perdu, et l'écran qui
 * attendait sa réponse reçoit celle de la requête rejouée.
 *
 * Prévenir plutôt que guérir : quand la session SAIT l'adresse non prouvée
 * (`SessionUser.emailUnproven`), la validation s'ouvre AVANT tout envoi ; si le
 * lecteur la ferme, le refus est rendu sans aller-retour. Une STORY n'est
 * jamais retenue d'avance : la première est permise sans adresse prouvée
 * (#7907, `email-verification-first-story.ts`) — seul le serveur sait si c'est
 * la première, donc seul son refus ouvre la validation.
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

const isStory = (request: HttpRequest): boolean =>
  typeof request.body === 'object' && request.body !== null && Reflect.get(request.body, 'type') === 'STORY';

const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

const refusedLocally: ApiFailure = { ok: false, status: 403, error: 'Email verification required', code: EMAIL_NOT_VERIFIED };

export type EmailGatePort = {
  readonly ask: (reason: EmailGateReason) => Promise<boolean>;
  readonly emailUnproven: () => boolean;
};

export function withEmailGate(inner: HttpTransport, gate: EmailGatePort): HttpTransport {
  async function request<T>(sent: HttpRequest): Promise<ApiResult<T>> {
    const reason = emailGateReasonOf(sent);
    if (reason === null) return inner.request<T>(sent);
    if (!isStory(sent) && gate.emailUnproven() && !(await gate.ask(reason))) return refusedLocally;
    const first = await inner.request<T>(sent);
    if (first.ok || first.code !== EMAIL_NOT_VERIFIED) return first;
    if (!(await gate.ask(reason))) return first;
    return inner.request<T>(sent);
  }
  return Object.assign((sent: HttpRequest) => request(sent), { request }) as HttpTransport;
}
