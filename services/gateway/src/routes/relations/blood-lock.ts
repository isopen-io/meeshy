import type { FastifyReply } from 'fastify';
import { RELATION_BLOOD_LOCKED_CODE } from '@meeshy/shared/types/relation-person-settings';
import { bloodLockStateBetween, type BloodLockDb } from '../../services/relations/bloodLock';
import { sendConflict } from '../../utils/response';

/** Les champs que les réponses de réglages par personne servent EN PLUS (#20361). */
export const bloodLockResponseProperties = {
  lockedByLevel: { type: 'boolean' },
  bloodBundleAccepted: { type: 'boolean' },
  ritualSharesLocked: { type: 'boolean' },
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
  params: { readonly ownerId: string; readonly otherId: string; readonly cuts: boolean; readonly minorExempt?: boolean },
): Promise<boolean> {
  if (!params.cuts) return false;
  const lock = await bloodLockStateBetween(prisma, params.ownerId, params.otherId);
  // `minorExempt` : la coupure porte sur la position ou le titre, que le mineur déclaré garde (C7).
  if (!lock.locked || (params.minorExempt === true && lock.minorProtected)) return false;
  sendBloodLocked(reply);
  return true;
}

/** `lockedByLevel` et `bloodBundleAccepted`, à joindre à un GET ou PUT de réglages par personne. */
export async function bloodLockFieldsOf(
  prisma: BloodLockDb,
  ownerId: string,
  otherId: string,
): Promise<{ readonly lockedByLevel: boolean; readonly bloodBundleAccepted: boolean }> {
  const state = await bloodLockStateBetween(prisma, ownerId, otherId);
  return { lockedByLevel: state.locked, bloodBundleAccepted: state.bloodBundleAccepted };
}
