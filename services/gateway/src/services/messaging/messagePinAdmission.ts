/**
 * ÉPINGLER OU DÉSÉPINGLER UN MESSAGE (#11219) — la porte UNIQUE des deux sens
 * du geste (`PUT` et `DELETE /conversations/:id/messages/:messageId/pin`).
 *
 * Une épingle se voit de TOUS les membres (`message:pinned`, bannière en tête
 * du fil) : c'est un acte DÉRIVÉ d'un message, et les règles qui disent qui
 * écrit ici s'y appliquent — `admitDerivedConversationWrite` : la conversation
 * close refuse sans dispense (410), un canal d'annonces exige `admin`, un
 * plancher `defaultWriteRole` s'impose, le staff de plateforme (MODERATOR,
 * ADMIN, BIGBOSS, comparés exactement) passe. Un invité doit en plus porter la
 * permission d'envoi de sa ligne (`resolveParticipantRights`). Avant ce lot,
 * la route ne lisait que l'accès : un simple abonné d'un canal d'annonces
 * épinglait pour tous.
 *
 * Le mineur de Global reste refusé par `refusesMinorInConversationOfType`, posé
 * à côté par la route ; les débits ne s'appliquent pas (un acte dérivé n'écrit
 * aucun message, cf. l'en-tête de `conversationWriteAdmission`).
 *
 * Rien n'est lu sur le chemin nominal : la ligne de l'appelant n'est relue que
 * si la conversation restreint l'écriture par le RANG, ou si l'appelant est un
 * invité, dont seule la ligne porte la permission d'envoi.
 *
 * Miroir client : `pinVerdict` de `packages/shared/utils/message-action-policy.ts`,
 * qui n'offre jamais ce que cette porte refuse (`action-policy-parity.test.ts`).
 */

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { callerParticipantWhere, type CallerParticipantIdentity } from '../../routes/conversations/utils/access-control';
import { resolveParticipantRights, type ParticipantRightsOverride } from '../participantRights';
import {
  admitDerivedConversationWrite,
  describeConversationWriteRefusal,
  isConversationWriteRefused,
  writeRefusalHttpResponse,
  type ConversationWriteStateRow,
} from './conversationWriteAdmission';

/** Ce que la porte lit de la conversation — chargé AVEC le message par la route. */
export const PIN_CONVERSATION_SELECT = {
  type: true,
  isActive: true,
  closedAt: true,
  isAnnouncementChannel: true,
  defaultWriteRole: true,
} as const;

const PINNER_SELECT = {
  role: true,
  permissions: true,
  anonymousSession: true,
  user: { select: { role: true } },
} as const;

export type MessagePinnerRow = {
  readonly role?: string | null;
  readonly permissions?: ParticipantPermissions | null;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
  readonly user?: { readonly role?: string | null } | null;
};

export interface MessagePinReader {
  participant: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: typeof PINNER_SELECT;
    }): Promise<MessagePinnerRow | null>;
  };
}

export type MessagePinCaller = CallerParticipantIdentity & { readonly isAnonymous: boolean };

export type MessagePinAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly status: 403 | 410; readonly message: string; readonly code?: string };

export type MessagePinRefused = Extract<MessagePinAdmission, { admitted: false }>;

/** Le gateway compile en `strict: false` : le discriminant booléen ne rétrécit pas sans prédicat. */
export const isMessagePinRefused = (admission: MessagePinAdmission): admission is MessagePinRefused =>
  admission.admitted === false;

const ADMITTED: MessagePinAdmission = { admitted: true };

const WRITE_NOT_PERMITTED: MessagePinAdmission = {
  admitted: false,
  status: 403,
  message: 'Writing in this conversation is not permitted',
  code: 'WRITE_NOT_PERMITTED',
};

function fromWriteAdmission(
  conversation: ConversationWriteStateRow | null | undefined,
  pinner: MessagePinnerRow | null,
  now: Date
): MessagePinAdmission {
  const admission = admitDerivedConversationWrite({ conversation, sender: pinner, now });
  if (!isConversationWriteRefused(admission)) return ADMITTED;
  const refusal = writeRefusalHttpResponse(admission);
  const status = refusal.status === 410 ? 410 : 403;
  return {
    admitted: false,
    status,
    message: describeConversationWriteRefusal(admission),
    ...('code' in refusal ? { code: refusal.code } : {}),
  };
}

const pinnerMaySend = (pinner: MessagePinnerRow | null): boolean => {
  if (!pinner?.permissions) return true;
  return resolveParticipantRights({ permissions: pinner.permissions, anonymousSession: pinner.anonymousSession }).canSendMessages !== false;
};

export async function admitMessagePin(
  prisma: MessagePinReader,
  params: {
    readonly conversation: ConversationWriteStateRow | null | undefined;
    readonly conversationId: string;
    readonly caller: MessagePinCaller;
    readonly now: Date;
  }
): Promise<MessagePinAdmission> {
  const { conversation, conversationId, caller, now } = params;
  const openToAnyone = fromWriteAdmission(conversation, null, now);
  if (isMessagePinRefused(openToAnyone) && openToAnyone.status === 410) return openToAnyone;
  if (!isMessagePinRefused(openToAnyone) && !caller.isAnonymous) return ADMITTED;

  const pinner = await prisma.participant.findFirst({
    where: { conversationId, ...callerParticipantWhere(caller) },
    select: PINNER_SELECT,
  });
  const byRank = fromWriteAdmission(conversation, pinner, now);
  if (isMessagePinRefused(byRank)) return byRank;
  return pinnerMaySend(pinner) ? ADMITTED : WRITE_NOT_PERMITTED;
}
