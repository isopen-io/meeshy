/**
 * #13929 — le miroir temps réel des éventails d'entourage.
 *
 * `getVisibilityFilteredRecipients` ne PRÉVIENT personne : il synchronise les
 * fils de ceux qui ont le droit de VOIR la publication (création, likes,
 * commentaires, traductions). Il lit le graphe par le MÊME site que les
 * notifications (`friendship.ts`, la loi des niveaux) et applique le même
 * blocage ; ce qu'il sert reste l'audience de VISIBILITÉ — un Ami voit un post
 * FRIENDS, donc son fil se met à jour, même si l'entourage réglé ne le PRÉVIENT
 * plus. Restreindre ce miroir au cran de notification désynchroniserait le
 * compteur de likes du fil d'un Ami qui voit le post (ADR du lot).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
}));

import { SocialEventsHandler } from '../SocialEventsHandler';
import { relationStore } from '../../../__tests__/helpers/user-relation-store';

const AUTEUR = '7000000000000000000000a1';
const PROCHE_SANS_DEMANDE = '7000000000000000000000b1';
const AMI = '7000000000000000000000b2';
const CONNAISSANCE = '7000000000000000000000b3';
const SANG_BLOQUE = '7000000000000000000000b4';
const POST_ID = '507f191e810c19729de860ea';

const lien = (other: string, level: RelationLevel, index: number) => ({
  id: `aa${String(index).padStart(22, '0')}`,
  ...relationPairKey(AUTEUR, other),
  grantedByLow: level,
  grantedByHigh: level,
  transitions: [],
  updatedAt: new Date(2026, 9, 1, 0, index),
});

function harness() {
  const store = relationStore({
    relations: [
      lien(PROCHE_SANS_DEMANDE, 'CLOSE', 1),
      lien(AMI, 'FRIEND', 2),
      lien(CONNAISSANCE, 'ACQUAINTANCE', 3),
      lien(SANG_BLOQUE, 'BLOOD', 4),
    ],
  });
  const prisma = {
    ...store.prisma,
    user: {
      findUnique: async () => ({ blockedUserIds: [SANG_BLOQUE] }),
      findMany: async () => [],
    },
  } as unknown as PrismaClient;
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit, except: () => ({ emit }) }));
  const handler = new SocialEventsHandler({ io: { to } as never, prisma });
  const rooms = (): string[] =>
    (to.mock.calls as unknown as Array<[string | string[]]>).flatMap(([room]) => (Array.isArray(room) ? room : [room]));
  return { handler, rooms };
}

const post = { id: POST_ID, authorId: AUTEUR, visibility: 'FRIENDS', visibilityUserIds: [] } as never;

describe('#13929 — le miroir temps réel sert l’audience de VISIBILITÉ, lue au même site que les notifications', () => {
  it('post:created atteint Proche (ligne de niveau seule, sans demande) et Ami, jamais une Connaissance ni un bloqué', async () => {
    const { handler, rooms } = harness();

    await handler.broadcastPostCreated(post, AUTEUR);

    expect(rooms()).toEqual(expect.arrayContaining([`feed:${PROCHE_SANS_DEMANDE}`, `feed:${AMI}`, `feed:${AUTEUR}`]));
    expect(rooms()).not.toContain(`feed:${CONNAISSANCE}`);
    expect(rooms()).not.toContain(`feed:${SANG_BLOQUE}`);
  });

  it('comment:added suit la même audience', async () => {
    const { handler, rooms } = harness();

    await handler.broadcastCommentAdded({ postId: POST_ID } as never, AUTEUR, 'FRIENDS', []);

    expect(rooms()).toEqual(expect.arrayContaining([`feed:${PROCHE_SANS_DEMANDE}`, `feed:${AMI}`]));
    expect(rooms()).not.toContain(`feed:${CONNAISSANCE}`);
    expect(rooms()).not.toContain(`feed:${SANG_BLOQUE}`);
  });
});
