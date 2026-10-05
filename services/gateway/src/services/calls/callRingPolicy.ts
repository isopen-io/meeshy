/**
 * « Appels hors contacts » (`acceptCallsFromNonContacts`, #8073) — qui a le
 * droit de faire SONNER qui.
 *
 * Un destinataire qui a coupé le réglage ne sonne que pour ses amis acceptés.
 * La doctrine d'échec est l'INVERSE de `socketio/call-recipients.ts` : ici on
 * garde une porte, donc une lecture qui échoue ne fait sonner personne de ceux
 * qu'elle devait garder — fail-closed.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../config/user-preferences-defaults';
import { logger } from '../../utils/logger';
import { amisAcceptesParmi } from '../friendship';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';

export type CallRingPartition = {
  readonly ringable: ReadonlyArray<string>;
  readonly refused: ReadonlyArray<string>;
};

const opensToEveryone = (stored: { acceptCallsFromNonContacts?: boolean } | undefined): boolean =>
  stored?.acceptCallsFromNonContacts ?? PRIVACY_PREFERENCES_DEFAULTS.acceptCallsFromNonContacts;

export async function partitionRingableCallees(
  prisma: PrismaClient,
  input: { readonly callerUserId: string; readonly calleeUserIds: ReadonlyArray<string> }
): Promise<CallRingPartition> {
  const callees = [...new Set(input.calleeUserIds)].filter((id) => id && id !== input.callerUserId);
  if (callees.length === 0) return { ringable: [], refused: [] };

  try {
    const stored = await loadPrivacyPreferencesCached(prisma, callees);
    const guarded = callees.filter((id) => !opensToEveryone(stored.get(id)));
    const friends = await amisAcceptesParmi(prisma, input.callerUserId, guarded);
    const refused = guarded.filter((id) => !friends.has(id));
    return { ringable: callees.filter((id) => !refused.includes(id)), refused };
  } catch (error) {
    logger.error('Call ring policy resolution failed — refusing every callee (fail-closed)', {
      callerUserId: input.callerUserId,
      error,
    });
    return { ringable: [], refused: callees };
  }
}

export async function ringableCallees(
  prisma: PrismaClient,
  input: { readonly callerUserId: string; readonly calleeUserIds: ReadonlyArray<string> }
): Promise<string[]> {
  const { ringable } = await partitionRingableCallees(prisma, input);
  return [...ringable];
}

export async function assertDirectCalleeReachable(
  prisma: PrismaClient,
  input: { readonly conversationId: string; readonly callerUserId: string }
): Promise<void> {
  const members = await prisma.participant.findMany({
    where: { conversationId: input.conversationId, isActive: true, userId: { not: null } },
    select: { userId: true },
  });
  const calleeUserIds = members.flatMap((m) => (m.userId ? [m.userId] : []));
  const { refused } = await partitionRingableCallees(prisma, {
    callerUserId: input.callerUserId,
    calleeUserIds,
  });
  if (refused.length > 0) {
    throw new Error(
      `${CALL_ERROR_CODES.CALLEE_REFUSES_NON_CONTACTS}: This person only accepts calls from their contacts`
    );
  }
}
