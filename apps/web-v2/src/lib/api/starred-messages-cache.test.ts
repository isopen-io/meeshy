import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import {
  STARRED_LIST_QUERY_KEY,
  STARRED_MEMBERSHIP_QUERY_KEY,
  applyStarredEvent,
  starredRowSlotOf,
  starredStateOf,
  withStar,
  withStarredRow,
  withoutStar,
  withoutStarredRow,
  type StarredListData,
  type StarredMembership,
} from './starred-messages-cache';

/**
 * **L'ÉTAT « EN FAVORI » D'UN MESSAGE EST UNE APPARTENANCE, ET IL PEUT ÊTRE
 * INCONNU** (#7378). Le fil (`GET /conversations/:id/messages`) ne sert aucun
 * indicateur d'étoile : l'état vient de l'ensemble des ids que sert la liste
 * `/me/starred-messages`, tenu à jour par le geste et par `message:starred`
 * (le contrat de #7377, et ce que #7379 prescrit à iOS, point 4).
 *
 * Tant que cet ensemble n'est pas chargé, l'état est INCONNU — jamais « pas en
 * favori ». Un geste qui ne sait pas dans quel état il est ment : le témoin
 * garde la différence entre `undefined` et `false`.
 */

const item = (messageId: string, starredAt = '2026-09-21T10:00:00.000Z'): StarredMessageItem => ({
  id: `star-${messageId}`,
  starredAt,
  message: {
    id: messageId,
    conversationId: 'c-1',
    messageType: 'text',
    createdAt: '2026-09-20T10:00:00.000Z',
    editedAt: null,
    isProtected: false,
    content: `texte ${messageId}`,
    originalLanguage: 'fr',
    translations: [],
    attachments: [],
  },
  sender: { id: 'p-1', userId: 'u-1', displayName: 'Amina', avatar: null, username: 'amina' },
  conversation: { id: 'c-1', identifier: 'equipe', type: 'group', name: 'Équipe', avatar: null },
});

const list = (...pages: (readonly StarredMessageItem[])[]): StarredListData => ({
  pages: pages.map((items, i) => ({
    items,
    pagination: { limit: 20, hasMore: i < pages.length - 1, nextCursor: i < pages.length - 1 ? `k${i + 1}` : null },
  })),
  pageParams: pages.map((_, i) => (i === 0 ? undefined : `k${i}`)),
});

const idsOf = (data: StarredListData | undefined): readonly string[] =>
  (data?.pages ?? []).flatMap((page) => page.items.map((row) => row.message.id));

describe('starredStateOf — connu ou inconnu, jamais deviné', () => {
  test('un ensemble ABSENT rend `undefined` : l’état est inconnu, pas « pas en favori »', () => {
    expect(starredStateOf(undefined, 'm1')).toBeUndefined();
  });

  test('un ensemble chargé dit vrai pour un id présent, faux pour un id absent', () => {
    const membership: StarredMembership = { m1: '2026-09-21T10:00:00.000Z' };
    expect(starredStateOf(membership, 'm1')).toBe(true);
    expect(starredStateOf(membership, 'm2')).toBe(false);
  });

  test('un ensemble VIDE mais chargé dit faux — c’est un état connu', () => {
    expect(starredStateOf({}, 'm1')).toBe(false);
  });
});

describe('withStar / withoutStar — l’appartenance change, l’absence ne se fabrique pas', () => {
  test('poser une étoile sur un ensemble inconnu ne FABRIQUE pas un ensemble partiel', () => {
    expect(withStar(undefined, 'm1', '2026-09-21T10:00:00.000Z')).toBeUndefined();
  });

  test('poser puis retirer', () => {
    const posee = withStar({}, 'm1', '2026-09-21T10:00:00.000Z');
    expect(starredStateOf(posee, 'm1')).toBe(true);
    expect(starredStateOf(withoutStar(posee, 'm1'), 'm1')).toBe(false);
  });

  test('rien à changer ⇒ la MÊME référence (aucune réécriture de cache)', () => {
    const membership: StarredMembership = { m1: '2026-09-21T10:00:00.000Z' };
    expect(withStar(membership, 'm1', '2026-09-21T10:00:00.000Z')).toBe(membership);
    expect(withoutStar(membership, 'm2')).toBe(membership);
  });
});

describe('la liste des favoris — retirer une ligne, la rendre À SA PLACE', () => {
  test('retirer ôte la ligne de toutes les pages', () => {
    const data = list([item('m1'), item('m2')], [item('m3')]);
    expect(idsOf(withoutStarredRow(data, 'm2'))).toEqual(['m1', 'm3']);
  });

  test('le retour arrière rend la ligne à son rang, dans sa page — jamais en tête', () => {
    const data = list([item('m1'), item('m2')], [item('m3'), item('m4')]);
    const slot = starredRowSlotOf(data, 'm4');
    expect(slot).not.toBeNull();
    const retiree = withoutStarredRow(data, 'm4');
    expect(idsOf(withStarredRow(retiree, slot!))).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  test('deux retraits concurrents : rendre l’un ne ressuscite pas l’autre (par ligne, jamais par instantané)', () => {
    const data = list([item('m1'), item('m2'), item('m3')]);
    const slotM1 = starredRowSlotOf(data, 'm1')!;
    const sansLesDeux = withoutStarredRow(withoutStarredRow(data, 'm1'), 'm3');
    expect(idsOf(withStarredRow(sansLesDeux, slotM1))).toEqual(['m1', 'm2']);
  });

  test('une liste absente reste absente', () => {
    expect(withoutStarredRow(undefined, 'm1')).toBeUndefined();
    expect(withStarredRow(undefined, { item: item('m1'), page: 0, index: 0 })).toBeUndefined();
  });
});

describe('applyStarredEvent — `message:starred` venu d’un AUTRE appareil', () => {
  const seeded = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY, { m1: '2026-09-21T10:00:00.000Z' });
    queryClient.setQueryData<StarredListData>(STARRED_LIST_QUERY_KEY, list([item('m1')]));
    return queryClient;
  };

  test('un retrait ailleurs éteint l’étoile ici ET ôte la ligne de l’écran', () => {
    const queryClient = seeded();
    applyStarredEvent(queryClient, { messageId: 'm1', conversationId: 'c-1', starred: false, starredAt: null });

    expect(starredStateOf(queryClient.getQueryData(STARRED_MEMBERSHIP_QUERY_KEY), 'm1')).toBe(false);
    expect(idsOf(queryClient.getQueryData(STARRED_LIST_QUERY_KEY))).toEqual([]);
  });

  test('une pose ailleurs allume l’étoile ici, et marque la liste périmée (la charge ne porte aucun contenu)', () => {
    const queryClient = seeded();
    applyStarredEvent(queryClient, {
      messageId: 'm9',
      conversationId: 'c-1',
      starred: true,
      starredAt: '2026-09-22T08:00:00.000Z',
    });

    expect(starredStateOf(queryClient.getQueryData(STARRED_MEMBERSHIP_QUERY_KEY), 'm9')).toBe(true);
    expect(idsOf(queryClient.getQueryData(STARRED_LIST_QUERY_KEY))).toEqual(['m1']);
    expect(queryClient.getQueryState(STARRED_LIST_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('un ensemble jamais chargé n’est pas FABRIQUÉ par l’écho', () => {
    const queryClient = new QueryClient();
    applyStarredEvent(queryClient, {
      messageId: 'm9',
      conversationId: 'c-1',
      starred: true,
      starredAt: '2026-09-22T08:00:00.000Z',
    });
    expect(queryClient.getQueryData(STARRED_MEMBERSHIP_QUERY_KEY)).toBeUndefined();
  });

  test('une charge mal formée est ignorée, jamais crue sur parole', () => {
    const queryClient = seeded();
    applyStarredEvent(queryClient, { messageId: 'm1', starred: 'non' });
    applyStarredEvent(queryClient, { messageId: 'm1', conversationId: 'c-1', starred: true, starredAt: null });
    applyStarredEvent(queryClient, null);
    expect(starredStateOf(queryClient.getQueryData(STARRED_MEMBERSHIP_QUERY_KEY), 'm1')).toBe(true);
    expect(idsOf(queryClient.getQueryData(STARRED_LIST_QUERY_KEY))).toEqual(['m1']);
  });

  test('un retrait d’une ligne ABSENTE ne réécrit pas la liste : une liste périmée le reste', async () => {
    const queryClient = seeded();
    await queryClient.invalidateQueries({ queryKey: STARRED_LIST_QUERY_KEY });
    applyStarredEvent(queryClient, { messageId: 'm7', conversationId: 'c-1', starred: false, starredAt: null });
    expect(queryClient.getQueryState(STARRED_LIST_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});
