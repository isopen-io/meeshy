import type { FastifyReply } from 'fastify';
import { RELATION_BLOOD_LOCKED_CODE } from '@meeshy/shared/types/relation-person-settings';
import { bloodLockedBetween, type BloodLockDb } from '../../services/relations/bloodLock';
import { sendConflict } from '../../utils/response';

/** Les champs que les réponses de réglages par personne servent EN PLUS (#20361). */
export const bloodLockResponseProperties = {
  lockedByLevel: { type: 'boolean' },
  bloodBundleAccepted: { type: 'boolean' },
} as const;

export const sendBloodLocked = (reply: FastifyReply): void =>
  sendConflict(reply, 'Entre Sangs, rien ne se coupe : pour restreindre, passe cette personne en Proche', {
    code: RELATION_BLOOD_LOCKED_CODE,
  });

/**
 * Refuse (409) une écriture qui COUPE (`cuts`) envers un Sang verrouillé. Rend `true` quand la
 * réponse est partie : l'appelant s'arrête là, rien n'est écrit.
 */
export async function refusedAsBloodLocked(
  prisma: BloodLockDb,
  reply: FastifyReply,
  params: { readonly ownerId: string; readonly otherId: string; readonly cuts: boolean },
): Promise<boolean> {
  if (!params.cuts || !(await bloodLockedBetween(prisma, params.ownerId, params.otherId))) return false;
  sendBloodLocked(reply);
  return true;
}
