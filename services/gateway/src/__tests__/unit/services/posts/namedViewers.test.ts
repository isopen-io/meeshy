/**
 * #14108 (POS-07) — la liste « Vu par » ne NOMME que la Communauté et au-dessus ;
 * les vues du Public sont comptées (`publicViewCount`), jamais nommées. Un
 * blocage retire le nom. La loi est jugée pour l'AUTEUR.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { namedViewsScope } from '../../../../services/posts/namedViewers';
import { ADULT_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';

const AUTEUR = '6800000000000000000000a1';
const AMIE = '6800000000000000000000a2';
const CO_MEMBRE = '6800000000000000000000a3';
const INCONNU = '6800000000000000000000a4';
const AMI_BLOQUEUR = '6800000000000000000000a5';
const POST = '6800000000000000000000f1';
const COMMU = '6800000000000000000000c1';

function monde() {
  const world = messagingWorld({
    links: [
      [AUTEUR, AMIE, 'FRIEND'],
      [AUTEUR, AMI_BLOQUEUR, 'FRIEND'],
    ],
    users: [AUTEUR, AMIE, CO_MEMBRE, INCONNU, AMI_BLOQUEUR].map((id) => ({ id, birthDate: ADULT_BIRTH, blockedUserIds: id === AMI_BLOQUEUR ? [AUTEUR] : [] })),
    communityMembers: [
      { userId: AUTEUR, communityId: COMMU, isActive: true },
      { userId: CO_MEMBRE, communityId: COMMU, isActive: true },
    ],
  });
  const postView = table([AMIE, CO_MEMBRE, INCONNU, AMI_BLOQUEUR].map((userId, i) => ({ id: `v${i}`, postId: POST, userId, viewedAt: new Date(2026, 10, 1, i) })));
  return { ...world.prisma, postView } as unknown as PrismaClient;
}

describe('namedViewsScope', () => {
  it('nomme l\'amie et le co-membre, compte l\'inconnu et le bloqueur', async () => {
    const scope = await namedViewsScope(monde(), { authorId: AUTEUR }, { postId: POST });
    expect([...scope.where.userId.in].sort()).toEqual([AMIE, CO_MEMBRE].sort());
    expect(scope.publicViewCount).toBe(2);
    expect(scope.where.postId).toBe(POST);
  });

  it('garde la borne de divulgation reçue', async () => {
    const since = new Date('2026-10-09T00:00:00.000Z');
    const scope = await namedViewsScope(monde(), { authorId: AUTEUR }, { postId: POST, viewedAt: { gte: since } });
    expect(scope.where.viewedAt).toEqual({ gte: since });
  });
});
