/**
 * #14108 (CAL-01/02, colonne « Règle mineurs ») — un majeur qui n'est pas Ami ne
 * fait pas sonner un mineur déclaré, même quand le mineur accepte les appels hors
 * contacts ; un Ami, si. Le refus est celui d'un non-contact : l'âge ne se dit pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { partitionRingableCallees } from '../../../../services/calls/callRingPolicy';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';

jest.mock('../../../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const MAJEUR = '6700000000000000000000a1';
const MINEUR_CONNU = '6700000000000000000000a2';
const MINEUR_AMI = '6700000000000000000000a3';
const ADULTE_INCONNU = '6700000000000000000000a4';
const AUTRE_MINEUR = '6700000000000000000000a5';

function monde(): PrismaClient {
  clearPrivacyPreferencesCache();
  const world = messagingWorld({
    links: [
      [MAJEUR, MINEUR_CONNU, 'ACQUAINTANCE'],
      [MAJEUR, MINEUR_AMI, 'FRIEND'],
    ],
    users: [
      { id: MAJEUR, birthDate: ADULT_BIRTH },
      { id: MINEUR_CONNU, birthDate: MINOR_BIRTH },
      { id: MINEUR_AMI, birthDate: MINOR_BIRTH },
      { id: ADULTE_INCONNU, birthDate: ADULT_BIRTH },
      { id: AUTRE_MINEUR, birthDate: MINOR_BIRTH },
    ],
  });
  const userPreferences = table(
    [MINEUR_CONNU, MINEUR_AMI, ADULTE_INCONNU, AUTRE_MINEUR, MAJEUR].map((userId) => ({ userId, privacy: { acceptCallsFromNonContacts: true } })),
  );
  return { ...world.prisma, userPreferences } as unknown as PrismaClient;
}

describe('partitionRingableCallees — le bouclier des mineurs (#14108)', () => {
  it('un majeur Connaissance ne fait pas sonner un mineur ; un majeur Ami, si ; un adulte inconnu sonne comme avant', async () => {
    const partition = await partitionRingableCallees(monde(), { callerUserId: MAJEUR, calleeUserIds: [MINEUR_CONNU, MINEUR_AMI, ADULTE_INCONNU] });
    expect(partition.refused).toEqual([MINEUR_CONNU]);
    expect([...partition.ringable].sort()).toEqual([ADULTE_INCONNU, MINEUR_AMI].sort());
  });

  it('un mineur fait sonner un autre mineur', async () => {
    const partition = await partitionRingableCallees(monde(), { callerUserId: AUTRE_MINEUR, calleeUserIds: [MINEUR_CONNU] });
    expect(partition.refused).toEqual([]);
  });
});
