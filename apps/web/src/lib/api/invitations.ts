import * as z from 'zod/mini';

import type { FriendRequestsDeps } from './friend-requests';
import type { ApiResult } from './http';

/**
 * **INVITER PAR E-MAIL** (#6363) — miroir `FriendService.sendEmailInvitation`
 * (iOS) : `POST /api/v1/invitations/email {email}`
 * (`services/gateway/src/routes/invitations.ts`). La passerelle refuse une
 * adresse déjà inscrite (409 `USER_ALREADY_EXISTS`) et borne le débit.
 *
 * L'adresse est validée ICI, avec la même règle que la passerelle
 * (`z.email()`), avant qu'un octet ne parte : un refus se lit sous le champ,
 * sans aller-retour. Pas de mise à jour optimiste : un envoi n'a pas d'état
 * local à poser, le bouton passe « Envoi… » au geste.
 */

export type EmailInvitationOutcome = 'sent' | 'invalid' | 'conflict' | 'offline' | 'error';

const EmailSchema = z.email();

export const isInvitableEmail = (email: string): boolean => EmailSchema.safeParse(email.trim()).success;

async function postEmailInvitation(deps: FriendRequestsDeps, email: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureSendEmailInvitation } = await import('./fixtures-friends');
    return fixtureSendEmailInvitation(email);
  }
  return deps.transport.request<unknown>({ method: 'POST', path: '/api/v1/invitations/email', body: { email } });
}

export async function performEmailInvitation({
  email,
  deps,
}: {
  readonly email: string;
  readonly deps: FriendRequestsDeps & { readonly isOnline: () => boolean };
}): Promise<EmailInvitationOutcome> {
  const trimmed = email.trim();
  if (!isInvitableEmail(trimmed)) return 'invalid';
  if (!deps.isOnline()) return 'offline';
  const result = await postEmailInvitation(deps, trimmed);
  if (result.ok) return 'sent';
  return result.status === 409 ? 'conflict' : 'error';
}
