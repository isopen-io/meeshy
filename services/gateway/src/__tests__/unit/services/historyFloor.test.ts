/**
 * Tests — `services/historyFloor`.
 *
 * La règle, dans l'ordre où elle se lit :
 *   (i)   admin / creator de la conversation ⇒ tout l'historique ;
 *   (ii)  octroi par DATE (`historyVisibleFrom`) ⇒ depuis cette date ;
 *   (iii) droit figé booléen explicite ⇒ tout, ou depuis l'arrivée ;
 *   (iv)  lien de partage qui ferme l'historique ⇒ depuis l'arrivée ;
 *   (v)   sinon (legacy, ABSENT) ⇒ tout — aucune régression sur l'existant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  applyHistoryFloor,
  historyFloorClause,
  historyFloorFor,
  historyReaderFromAuthContext,
  loadHistoryFloor,
  loadHistoryFloors,
  loadHistoryFloorsFor,
  loadHistoryFloorsOrFail,
  loadReaderHistoryFloor,
  type HistoryFloorParticipation,
} from '../../../services/historyFloor';

const JOINED = new Date('2026-06-15T00:00:00Z');
const LATER = new Date('2026-07-01T00:00:00Z');
const GRANTED_FROM = new Date('2026-01-01T00:00:00Z');

const prismaWith = (links: Array<{ id: string; allowViewHistory: boolean }>) =>
  ({
    conversationShareLink: {
      findMany: jest.fn<any>().mockResolvedValue(links),
      findUnique: jest.fn<any>(async ({ where }: any) => links.find((l) => l.id === where.id) ?? null),
    },
  }) as never;

const participation = (over: Partial<HistoryFloorParticipation> = {}): HistoryFloorParticipation => ({
  conversationId: 'c1',
  joinedAt: JOINED,
  shareLinkId: 'sl-1',
  ...over,
});

// ─── historyFloorFor — la règle, énoncée UNE fois ────────────────────────────

describe('historyFloorFor — (i) un administrateur voit tout', () => {
  it('ouvre tout à un admin, même avec un droit figé fermé ET un lien fermé', () => {
    expect(
      historyFloorFor(
        { role: 'admin', joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } },
        { allowViewHistory: false },
      ),
    ).toBeNull();
  });

  it('ouvre tout à un creator', () => {
    expect(
      historyFloorFor({ role: 'creator', joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: false } }, null),
    ).toBeNull();
  });

  it('replie la casse du rôle — `ADMIN` est un admin', () => {
    expect(
      historyFloorFor({ role: 'ADMIN', joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: false } }, null),
    ).toBeNull();
  });

  it('ne fait PAS d’un modérateur un admin', () => {
    expect(
      historyFloorFor({ role: 'moderator', joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: false } }, null),
    ).toEqual(JOINED);
  });

  it('le rang prime sur un octroi par date — un admin n’est pas borné par sa propre date', () => {
    expect(
      historyFloorFor({ role: 'admin', joinedAt: JOINED, shareLinkId: null, historyVisibleFrom: GRANTED_FROM }, null),
    ).toBeNull();
  });
});

describe('historyFloorFor — (ii) l’octroi par DATE d’un administrateur', () => {
  it('rend la date octroyée, même quand le droit figé refuse l’historique', () => {
    expect(
      historyFloorFor(
        { role: 'member', joinedAt: JOINED, shareLinkId: null, historyVisibleFrom: GRANTED_FROM, permissions: { canViewHistory: false } },
        null,
      ),
    ).toEqual(GRANTED_FROM);
  });

  it('rend la date octroyée, même quand le lien ferme l’historique', () => {
    expect(
      historyFloorFor(
        { role: 'member', joinedAt: JOINED, shareLinkId: 'sl-1', historyVisibleFrom: GRANTED_FROM },
        { allowViewHistory: false },
      ),
    ).toEqual(GRANTED_FROM);
  });

  it('prime sur la surcharge de l’hôte — la date est le levier le plus récent', () => {
    expect(
      historyFloorFor(
        {
          joinedAt: JOINED,
          shareLinkId: 'sl-1',
          historyVisibleFrom: GRANTED_FROM,
          permissions: { canViewHistory: true },
          anonymousSession: { rights: { canViewHistory: false } },
        },
        { allowViewHistory: true },
      ),
    ).toEqual(GRANTED_FROM);
  });

  it('`null` n’est pas un octroi — la règle ordinaire s’applique', () => {
    expect(
      historyFloorFor({ joinedAt: JOINED, shareLinkId: null, historyVisibleFrom: null, permissions: { canViewHistory: false } }, null),
    ).toEqual(JOINED);
  });
});

describe('historyFloorFor — (iii) le droit figé au join, SANS lien', () => {
  it('borne à l’arrivée un membre ajouté après coup (droit figé `false`, aucun lien)', () => {
    expect(historyFloorFor({ joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: false } }, null)).toEqual(JOINED);
  });

  it('ouvre tout à un membre dont le droit figé l’accorde', () => {
    expect(historyFloorFor({ joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: true } }, null)).toBeNull();
  });

  it('laisse la SURCHARGE de l’hôte primer sur le droit figé', () => {
    expect(
      historyFloorFor(
        {
          joinedAt: JOINED,
          shareLinkId: 'sl-1',
          permissions: { canViewHistory: true },
          anonymousSession: { rights: { canViewHistory: false } },
        },
        { allowViewHistory: true },
      ),
    ).toEqual(JOINED);
  });

  it('ignore une surcharge qui ne nomme PAS l’historique', () => {
    expect(
      historyFloorFor(
        {
          joinedAt: JOINED,
          shareLinkId: 'sl-1',
          permissions: { canViewHistory: false },
          anonymousSession: { rights: { canSendFiles: true } },
        },
        { allowViewHistory: true },
      ),
    ).toEqual(JOINED);
  });
});

describe('historyFloorFor — (iv) le lien de partage, quand rien n’est figé', () => {
  it('rend `joinedAt` quand le lien ferme l’historique', () => {
    expect(historyFloorFor(participation(), { allowViewHistory: false })).toEqual(JOINED);
  });

  it('ne rend RIEN quand le lien ouvre l’historique', () => {
    expect(historyFloorFor(participation(), { allowViewHistory: true })).toBeNull();
  });

  it('ouvre l’historique quand le droit figé l’accorde, MÊME si le lien le ferme', () => {
    expect(
      historyFloorFor({ joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: true } }, { allowViewHistory: false }),
    ).toBeNull();
  });

  it('ferme l’historique quand le droit figé le refuse, MÊME si le lien l’ouvre', () => {
    expect(
      historyFloorFor({ joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } }, { allowViewHistory: true }),
    ).toEqual(JOINED);
  });

  it('retombe sur le lien quand le droit figé est ABSENT — participation d’avant le champ', () => {
    expect(historyFloorFor({ joinedAt: JOINED, shareLinkId: 'sl-1', permissions: {} }, { allowViewHistory: false })).toEqual(JOINED);
  });

  it('ne borne RIEN quand le lien est INTROUVABLE — posture unique du dépôt', () => {
    expect(historyFloorFor(participation(), null)).toBeNull();
  });
});

describe('historyFloorFor — (v) legacy : ABSENT n’est pas « faux »', () => {
  it('ne borne RIEN pour une participation sans lien ni droit figé (ajout direct d’avant le champ)', () => {
    expect(historyFloorFor(participation({ shareLinkId: null }), null)).toBeNull();
  });

  it('ne borne RIEN quand `permissions` manque entièrement et que le lien ouvre', () => {
    expect(historyFloorFor({ joinedAt: JOINED, shareLinkId: 'sl-1' }, { allowViewHistory: true })).toBeNull();
  });

  it('ne borne RIEN quand `role` manque — un appelant qui ne le charge pas n’ouvre rien de plus', () => {
    expect(historyFloorFor({ joinedAt: JOINED, shareLinkId: null }, null)).toBeNull();
  });
});

// ─── Les chargeurs ───────────────────────────────────────────────────────────

describe('loadHistoryFloor — forme unitaire', () => {
  it('ne lit AUCUN lien quand le verdict est acquis avant lui (admin)', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: false }]);
    const floor = await loadHistoryFloor(prisma, { role: 'admin', joinedAt: JOINED, shareLinkId: 'sl-1' });
    expect(floor).toBeNull();
    expect((prisma as any).conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('ne lit AUCUN lien pour un membre au droit figé fermé — le lien ne décide plus', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: true }]);
    const floor = await loadHistoryFloor(prisma, { joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } });
    expect(floor).toEqual(JOINED);
    expect((prisma as any).conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('lit le lien quand rien n’est figé', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: false }]);
    expect(await loadHistoryFloor(prisma, participation())).toEqual(JOINED);
  });

  it('réutilise le lien que l’appelant tient déjà, s’il est celui de la participation', async () => {
    const prisma = prismaWith([]);
    const floor = await loadHistoryFloor(prisma, participation(), { link: { id: 'sl-1', allowViewHistory: false } });
    expect(floor).toEqual(JOINED);
    expect((prisma as any).conversationShareLink.findUnique).not.toHaveBeenCalled();
  });

  it('n’emprunte PAS un lien qui n’est pas celui de la participation', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: true }]);
    const floor = await loadHistoryFloor(prisma, participation(), { link: { id: 'sl-other', allowViewHistory: false } });
    expect(floor).toBeNull();
    expect((prisma as any).conversationShareLink.findUnique).toHaveBeenCalledTimes(1);
  });

  it('propage l’échec de lecture — un contrôle d’accès illisible ne sert rien', async () => {
    const prisma = {
      conversationShareLink: { findUnique: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as never;
    await expect(loadHistoryFloor(prisma, participation())).rejects.toThrow('mongo down');
  });
});

describe('loadHistoryFloorsFor — forme ALIGNÉE (un plancher par ligne)', () => {
  it('rend un verdict par participation, dans l’ordre', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: false }]);
    const floors = await loadHistoryFloorsFor(prisma, [
      { role: 'admin', joinedAt: JOINED, shareLinkId: 'sl-1' },
      { joinedAt: LATER, shareLinkId: 'sl-1' },
      { joinedAt: JOINED, shareLinkId: null, historyVisibleFrom: GRANTED_FROM },
    ]);
    expect(floors).toEqual([null, LATER, GRANTED_FROM]);
  });

  it('n’interroge que les liens dont le verdict dépend', async () => {
    const prisma = prismaWith([{ id: 'sl-2', allowViewHistory: false }]);
    await loadHistoryFloorsFor(prisma, [
      { role: 'admin', joinedAt: JOINED, shareLinkId: 'sl-1' },
      { joinedAt: JOINED, shareLinkId: 'sl-2' },
    ]);
    expect((prisma as any).conversationShareLink.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['sl-2'] } });
  });

  it('n’émet AUCUNE requête quand tout se décide avant le lien', async () => {
    const prisma = prismaWith([]);
    const floors = await loadHistoryFloorsFor(prisma, [
      { joinedAt: JOINED, shareLinkId: null },
      { joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } },
    ]);
    expect(floors).toEqual([null, JOINED]);
    expect((prisma as any).conversationShareLink.findMany).not.toHaveBeenCalled();
  });
});

describe('loadHistoryFloors — forme ENSEMBLISTE (par conversation)', () => {
  it('pose le plancher à `joinedAt` quand le lien ferme l’historique', async () => {
    const floors = await loadHistoryFloors(prismaWith([{ id: 'sl-1', allowViewHistory: false }]), [participation()]);
    expect(floors.get('c1')).toEqual(JOINED);
  });

  it('ne pose rien quand le lien ouvre l’historique', async () => {
    const floors = await loadHistoryFloors(prismaWith([{ id: 'sl-1', allowViewHistory: true }]), [participation()]);
    expect(floors.size).toBe(0);
  });

  it('pose un plancher SANS lien pour un membre ajouté après coup', async () => {
    const prisma = prismaWith([]);
    const floors = await loadHistoryFloors(prisma, [
      participation({ shareLinkId: null, permissions: { canViewHistory: false } }),
    ]);
    expect(floors.get('c1')).toEqual(JOINED);
    expect((prisma as any).conversationShareLink.findMany).not.toHaveBeenCalled();
  });

  it('n’émet AUCUNE requête pour des participations sans lien', async () => {
    const prisma = prismaWith([]);
    const floors = await loadHistoryFloors(prisma, [
      participation({ shareLinkId: null }),
      participation({ conversationId: 'c2', shareLinkId: null }),
    ]);
    expect(floors.size).toBe(0);
    expect((prisma as any).conversationShareLink.findMany).not.toHaveBeenCalled();
  });

  it('dédoublonne les liens et garde le `joinedAt` PROPRE à chaque conversation', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: false }]);
    const floors = await loadHistoryFloors(prisma, [
      participation({ conversationId: 'c1', joinedAt: JOINED }),
      participation({ conversationId: 'c2', joinedAt: LATER }),
    ]);
    expect((prisma as any).conversationShareLink.findMany).toHaveBeenCalledTimes(1);
    expect((prisma as any).conversationShareLink.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['sl-1'] } });
    expect(floors.get('c1')).toEqual(JOINED);
    expect(floors.get('c2')).toEqual(LATER);
  });

  it('ne borne pas sur un lien introuvable — même posture que GET messages', async () => {
    const floors = await loadHistoryFloors(prismaWith([]), [participation()]);
    expect(floors.size).toBe(0);
  });

  it('rend le MÊME verdict que la forme unitaire', async () => {
    const floors = await loadHistoryFloors(prismaWith([{ id: 'sl-1', allowViewHistory: false }]), [participation()]);
    expect(historyFloorFor(participation(), { allowViewHistory: false })).toEqual(floors.get('c1'));
  });
});

describe('historyFloorClause', () => {
  it('rend {} quand rien n’est borné — la requête de l’appelant reste intacte', () => {
    expect(historyFloorClause(['c1', 'c2'], new Map())).toEqual({});
  });

  it('rend le OR sous AND — le premier niveau appartient déjà au keyset', () => {
    const clause = historyFloorClause(['c1', 'c2'], new Map([['c2', JOINED]]));
    expect(clause).toEqual({
      AND: [{ OR: [{ conversationId: 'c1' }, { conversationId: 'c2', createdAt: { gte: JOINED } }] }],
    });
  });

  it('n’a pas de clé `OR` de premier niveau, qu’un keyset écraserait', () => {
    expect(Object.keys(historyFloorClause(['c1'], new Map([['c1', JOINED]])))).toEqual(['AND']);
  });
});

describe('applyHistoryFloor', () => {
  it('laisse la clause intacte sans plancher', () => {
    const where = { conversationId: 'c1', deletedAt: null };
    expect(applyHistoryFloor(where, null)).toBe(where);
  });

  it('pose `createdAt.gte` sans toucher au reste', () => {
    expect(applyHistoryFloor({ conversationId: 'c1', deletedAt: null }, JOINED)).toEqual({
      conversationId: 'c1',
      deletedAt: null,
      createdAt: { gte: JOINED },
    });
  });

  it('se COMBINE à une borne `lt` déjà posée (curseur, mode around)', () => {
    expect(applyHistoryFloor({ conversationId: 'c1', createdAt: { lt: LATER } }, JOINED)).toEqual({
      conversationId: 'c1',
      createdAt: { lt: LATER, gte: JOINED },
    });
  });

  it('garde la borne `gte` la plus STRICTE quand l’appelant en avait déjà une', () => {
    expect(applyHistoryFloor({ createdAt: { gte: LATER } }, JOINED)).toEqual({ createdAt: { gte: LATER } });
    expect(applyHistoryFloor({ createdAt: { gte: JOINED } }, LATER)).toEqual({ createdAt: { gte: LATER } });
  });

  // #3893 point 3 : `where.createdAt` peut arriver sous deux formes que le
  // code d'origine ne reconnaissait pas — une Date LITTÉRALE (égalité, pas une
  // borne) et un `gte` en chaîne ISO (le connecteur Mongo les accepte). Dans
  // les deux cas, l'ancien code perdait la contrainte de l'appelant et la
  // remplaçait par le plancher SEUL — un ÉLARGISSEMENT, jamais une restriction.
  it('une Date LITTÉRALE déjà >= au plancher reste intacte — l’égalité est déjà plus stricte', () => {
    expect(applyHistoryFloor({ conversationId: 'c1', createdAt: LATER }, JOINED)).toEqual({
      conversationId: 'c1',
      createdAt: LATER,
    });
  });

  it('une Date LITTÉRALE antérieure au plancher devient un intervalle IMPOSSIBLE, jamais le plancher seul', () => {
    const result = applyHistoryFloor({ conversationId: 'c1', createdAt: JOINED }, LATER) as unknown as {
      createdAt: { gte: Date; lt: Date };
    };
    // Ne DOIT jamais dégénérer en `{ gte: LATER }` seul, qui rouvrirait tout
    // ce qui suit le plancher — la ligne demandée par l'égalité, elle,
    // n'existe pas dans cette fenêtre.
    expect(result.createdAt.gte).toEqual(result.createdAt.lt);
    expect(result.createdAt.gte >= LATER).toBe(true);
  });

  it('un `gte` en CHAÎNE ISO plus strict que le plancher est conservé — comparé, pas ignoré', () => {
    expect(applyHistoryFloor({ createdAt: { gte: LATER.toISOString() } }, JOINED)).toEqual({
      createdAt: { gte: LATER },
    });
  });

  it('un `gte` en CHAÎNE ISO moins strict que le plancher cède au plancher', () => {
    expect(applyHistoryFloor({ createdAt: { gte: JOINED.toISOString() } }, LATER)).toEqual({
      createdAt: { gte: LATER },
    });
  });
});

describe('loadHistoryFloorsOrFail', () => {
  it('retire les conversations dont le verdict DÉPEND d’un lien illisible, et elles seules', async () => {
    const prisma = {
      conversationShareLink: { findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as never;

    const result = await loadHistoryFloorsOrFail(prisma, [
      participation({ conversationId: 'c-link' }),
      participation({ conversationId: 'c-plain', shareLinkId: null }),
      participation({ conversationId: 'c-admin', role: 'admin' }),
      participation({ conversationId: 'c-frozen', permissions: { canViewHistory: false } }),
    ]);

    // Un contrôle d'accès qu'on ne peut pas lire ne se dégrade pas en « aucun
    // contrôle » : seule la conversation dont le lien décide sort du service.
    expect(result.unreadableConversationIds).toEqual(['c-link']);
    // `c-frozen` se règle au rang (iii), SANS lien : la panne de la requête
    // liens ne peut rien lui retirer, et son plancher reste applicable.
    expect(result.floors.get('c-frozen')).toEqual(JOINED);
    // `c-plain` et `c-admin` ne sont bornées par rien : absentes de la carte.
    expect(result.floors.size).toBe(1);
  });

  /**
   * Le défaut que ce témoin ferme : le `catch` vidait TOUTE la carte, alors
   * qu'il ne pouvait rien apprendre sur les conversations dont le verdict était
   * déjà rendu SANS lien (rangs i à iii). Sur une page MIXTE, une panne de la
   * requête liens faisait donc perdre le plancher des conversations réglées, et
   * elles redevenaient lisibles INTÉGRALEMENT — l'appelant n'apprenait ni leur
   * plancher (`floors`) ni leur illisibilité (`unreadableConversationIds`).
   */
  it('GARDE le plancher d’une conversation réglée sans lien quand la requête liens ÉCHOUE', async () => {
    const prisma = {
      conversationShareLink: { findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    } as never;

    const result = await loadHistoryFloorsOrFail(prisma, [
      participation({ conversationId: 'c-link' }),
      participation({ conversationId: 'c-frozen', permissions: { canViewHistory: false } }),
      participation({ conversationId: 'c-granted', historyVisibleFrom: GRANTED_FROM }),
    ]);

    expect(result.floors.get('c-frozen')).toEqual(JOINED);
    expect(result.floors.get('c-granted')).toEqual(GRANTED_FROM);
    expect(result.unreadableConversationIds).toEqual(['c-link']);
    expect(result.unreadableConversationIds).not.toContain('c-frozen');
    expect(result.unreadableConversationIds).not.toContain('c-granted');
  });

  it('ne lit AUCUN lien — donc ne peut pas échouer — quand tout se règle avant le lien', async () => {
    const findMany = jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const result = await loadHistoryFloorsOrFail({ conversationShareLink: { findMany } } as never, [
      participation({ conversationId: 'c-frozen', shareLinkId: null, permissions: { canViewHistory: false } }),
    ]);

    expect(findMany).not.toHaveBeenCalled();
    expect(result.floors.get('c-frozen')).toEqual(JOINED);
    expect(result.unreadableConversationIds).toEqual([]);
  });

  it('ne retire rien quand la lecture aboutit', async () => {
    const result = await loadHistoryFloorsOrFail(prismaWith([{ id: 'sl-1', allowViewHistory: false }]), [participation()]);
    expect(result.unreadableConversationIds).toEqual([]);
    expect(result.floors.get('c1')).toEqual(JOINED);
  });
});

// ─── Le lecteur, depuis son contexte d'auth ──────────────────────────────────

describe('historyReaderFromAuthContext', () => {
  it('nomme un anonyme par son `participantId`', () => {
    expect(historyReaderFromAuthContext({ type: 'anonymous', participantId: 'p-1', userId: 'p-1' })).toEqual({
      kind: 'anonymous',
      participantId: 'p-1',
    });
  });

  it('nomme un anonyme par `userId` quand seul ce champ porte son id — même colonne', () => {
    expect(historyReaderFromAuthContext({ type: 'anonymous', userId: 'p-1' })).toEqual({ kind: 'anonymous', participantId: 'p-1' });
  });

  it('nomme un inscrit par son `userId`', () => {
    expect(historyReaderFromAuthContext({ type: 'user', userId: 'u-1' })).toEqual({ kind: 'user', userId: 'u-1' });
  });

  it('ne nomme personne pour un visiteur nu', () => {
    expect(historyReaderFromAuthContext({ isAnonymous: true })).toBeNull();
    expect(historyReaderFromAuthContext(null)).toBeNull();
  });
});

describe('loadReaderHistoryFloor', () => {
  const prismaWithRow = (row: unknown) =>
    ({
      participant: { findFirst: jest.fn<any>().mockResolvedValue(row) },
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: false }) },
    }) as never;

  it('cherche un anonyme par `id` et borne à son arrivée', async () => {
    const prisma = prismaWithRow({ role: 'member', joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } });
    const floor = await loadReaderHistoryFloor(prisma, { conversationId: 'c1', reader: { kind: 'anonymous', participantId: 'p-1' } });
    expect(floor).toEqual(JOINED);
    expect((prisma as any).participant.findFirst.mock.calls[0][0]).toMatchObject({
      where: { id: 'p-1', conversationId: 'c1', isActive: true },
      select: HISTORY_FLOOR_PARTICIPANT_SELECT,
    });
  });

  it('cherche un inscrit par `userId`', async () => {
    const prisma = prismaWithRow({ role: 'admin', joinedAt: JOINED, shareLinkId: null });
    const floor = await loadReaderHistoryFloor(prisma, { conversationId: 'c1', reader: { kind: 'user', userId: 'u-1' } });
    expect(floor).toBeNull();
    expect((prisma as any).participant.findFirst.mock.calls[0][0].where).toEqual({ userId: 'u-1', conversationId: 'c1', isActive: true });
  });

  it('ne borne rien pour qui n’a pas de ligne — rien ne précède une arrivée qui n’a pas eu lieu', async () => {
    const prisma = prismaWithRow(null);
    expect(await loadReaderHistoryFloor(prisma, { conversationId: 'c1', reader: { kind: 'user', userId: 'u-1' } })).toBeNull();
  });

  it('ne borne rien et ne lit rien sans lecteur nommé', async () => {
    const prisma = prismaWithRow({ joinedAt: JOINED, shareLinkId: 'sl-1' });
    expect(await loadReaderHistoryFloor(prisma, { conversationId: 'c1', reader: null })).toBeNull();
    expect((prisma as any).participant.findFirst).not.toHaveBeenCalled();
  });

  it('propage l’échec — fail-closed, la route en fait un 500', async () => {
    const prisma = { participant: { findFirst: jest.fn<any>().mockRejectedValue(new Error('mongo down')) } } as never;
    await expect(
      loadReaderHistoryFloor(prisma, { conversationId: 'c1', reader: { kind: 'user', userId: 'u-1' } }),
    ).rejects.toThrow('mongo down');
  });
});
