/**
 * `pairAccessAmong` — l'orchestrateur lit ce que la LOI exige (#14107) : le
 * niveau au site unique, le blocage, et, quand la feature le demande, l'âge
 * déclaré et la communauté. Un bouclier des mineurs qu'on jugerait sans lire
 * l'âge serait ouvert.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { pairAccess, pairAccessAmong } from '../../../../services/relations/pairAccess';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld } from '../../../helpers/messaging-circle-world';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADULTE = '6100000000000000000000a1';
const MINEUR = '6100000000000000000000a2';
const CONNAISSANCE = '6100000000000000000000a3';
const BLOQUEUR = '6100000000000000000000a4';
const CO_MEMBRE = '6100000000000000000000a5';
const COMMUNAUTE = '6100000000000000000000c1';

const monde = () =>
  messagingWorld({
    links: [
      [ADULTE, CONNAISSANCE, 'ACQUAINTANCE'],
      [ADULTE, BLOQUEUR, 'FRIEND'],
    ],
    users: [
      { id: ADULTE, birthDate: ADULT_BIRTH },
      { id: MINEUR, birthDate: MINOR_BIRTH },
      { id: CONNAISSANCE, birthDate: ADULT_BIRTH },
      { id: BLOQUEUR, birthDate: ADULT_BIRTH, blockedUserIds: [ADULTE] },
      { id: CO_MEMBRE, birthDate: MINOR_BIRTH },
    ],
    communityMembers: [
      { userId: ADULTE, communityId: COMMUNAUTE, isActive: true },
      { userId: CO_MEMBRE, communityId: COMMUNAUTE, isActive: true },
    ],
  });

const db = (world: ReturnType<typeof monde>) => world.prisma as unknown as PrismaClient;

describe('pairAccessAmong — la loi jugée sur les lectures vraies', () => {
  it('la frappe d\'un membre n\'atteint que ceux qui sont au moins Connaissance, et jamais un bloqueur', async () => {
    const verdicts = await pairAccessAmong(db(monde()), {
      feature: 'dm.typing',
      subjectId: ADULTE,
      otherIds: [CONNAISSANCE, MINEUR, BLOQUEUR],
      subjectIs: 'target',
    });
    expect(verdicts.get(CONNAISSANCE)?.allowed).toBe(true);
    expect(verdicts.get(MINEUR)?.allowed).toBe(false);
    expect(verdicts.get(BLOQUEUR)).toMatchObject({ allowed: false, reason: 'blocked' });
  });

  it('lit l\'âge déclaré pour le bouclier : le Public ne peut pas adresser de demande à un mineur', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: MINEUR });
    expect(verdict).toMatchObject({ allowed: false, reason: 'level' });
  });

  it('lit la communauté quand elle ouvre : un co-membre mineur reçoit la demande d\'un majeur', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: CO_MEMBRE });
    expect(verdict).toMatchObject({ allowed: true, effectiveLevel: 'COMMUNITY' });
  });

  it('écarte soi-même et les doublons de l\'éventail', async () => {
    const verdicts = await pairAccessAmong(db(monde()), {
      feature: 'dm.typing',
      subjectId: ADULTE,
      otherIds: [ADULTE, CONNAISSANCE, CONNAISSANCE],
      subjectIs: 'target',
    });
    expect([...verdicts.keys()]).toEqual([CONNAISSANCE]);
  });

  it('une demande à soi-même est refusée par la loi', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: ADULTE });
    expect(verdict).toMatchObject({ allowed: false, reason: 'self' });
  });
});
