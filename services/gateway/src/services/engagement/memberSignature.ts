import { createHash } from 'node:crypto';

/**
 * L'empreinte d'un ENSEMBLE de personnes (#8906) : identifiants dédoublonnés,
 * triés, puis sha256. Deux conversations avec les mêmes personnes ont la même
 * empreinte, quel que soit l'ordre ; une personne de plus la change.
 */
export function memberSignature(userIds: readonly string[]): string {
  const members = [...new Set(userIds)].sort();
  return createHash('sha256').update(members.join(',')).digest('hex');
}
