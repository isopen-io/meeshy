/**
 * Tests — `services/shareLinkHistoryFloor`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  historyFloorClause,
  historyFloorFor,
  loadShareLinkHistoryFloors,
  loadShareLinkHistoryFloorsOrFail,
  type ShareLinkParticipation,
} from '../../../services/shareLinkHistoryFloor';

const JOINED = new Date('2026-06-15T00:00:00Z');
const LATER = new Date('2026-07-01T00:00:00Z');

const prismaWith = (links: Array<{ id: string; allowViewHistory: boolean }>) =>
  ({
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue(links) },
  }) as never;

const participation = (over: Partial<ShareLinkParticipation> = {}): ShareLinkParticipation => ({
  conversationId: 'c1',
  joinedAt: JOINED,
  shareLinkId: 'sl-1',
  ...over,
});

describe('loadShareLinkHistoryFloors', () => {
  it('pose le plancher à `joinedAt` quand le lien ferme l’historique', async () => {
    const floors = await loadShareLinkHistoryFloors(
      prismaWith([{ id: 'sl-1', allowViewHistory: false }]),
      [participation()],
    );
    expect(floors.get('c1')).toEqual(JOINED);
  });

  it('ne pose rien quand le lien ouvre l’historique', async () => {
    const floors = await loadShareLinkHistoryFloors(
      prismaWith([{ id: 'sl-1', allowViewHistory: true }]),
      [participation()],
    );
    expect(floors.size).toBe(0);
  });

  it('n’émet AUCUNE requête pour des participations sans lien', async () => {
    const prisma = prismaWith([]);
    const floors = await loadShareLinkHistoryFloors(prisma, [
      participation({ shareLinkId: null }),
      participation({ conversationId: 'c2', shareLinkId: null }),
    ]);
    expect(floors.size).toBe(0);
    expect((prisma as any).conversationShareLink.findMany).not.toHaveBeenCalled();
  });

  it('dédoublonne les liens et garde le `joinedAt` PROPRE à chaque conversation', async () => {
    const prisma = prismaWith([{ id: 'sl-1', allowViewHistory: false }]);
    const floors = await loadShareLinkHistoryFloors(prisma, [
      participation({ conversationId: 'c1', joinedAt: JOINED }),
      participation({ conversationId: 'c2', joinedAt: LATER }),
    ]);

    expect((prisma as any).conversationShareLink.findMany).toHaveBeenCalledTimes(1);
    expect((prisma as any).conversationShareLink.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['sl-1'] },
    });
    // Deux conversations derrière le même lien : le plancher est celui de LA
    // jointure, pas celui du lien.
    expect(floors.get('c1')).toEqual(JOINED);
    expect(floors.get('c2')).toEqual(LATER);
  });

  it('ne borne pas sur un lien introuvable — même posture que GET messages', async () => {
    const floors = await loadShareLinkHistoryFloors(prismaWith([]), [participation()]);
    expect(floors.size).toBe(0);
  });
});

describe('historyFloorClause', () => {
  it('rend {} quand rien n’est borné — la requête de l’appelant reste intacte', () => {
    expect(historyFloorClause(['c1', 'c2'], new Map())).toEqual({});
  });

  it('rend le OR sous AND — le premier niveau appartient déjà au keyset', () => {
    const clause = historyFloorClause(['c1', 'c2'], new Map([['c2', JOINED]]));
    expect(clause).toEqual({
      AND: [
        {
          OR: [{ conversationId: 'c1' }, { conversationId: 'c2', createdAt: { gte: JOINED } }],
        },
      ],
    });
  });

  it('n’a pas de clé `OR` de premier niveau, qu’un keyset écraserait', () => {
    const clause = historyFloorClause(['c1'], new Map([['c1', JOINED]]));
    expect(Object.keys(clause)).toEqual(['AND']);
  });
});

describe('loadShareLinkHistoryFloorsOrFail', () => {
  it('retire les conversations liées quand le plancher est ILLISIBLE', async () => {
    const prisma = {
      conversationShareLink: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      },
    } as never;

    const result = await loadShareLinkHistoryFloorsOrFail(prisma, [
      participation({ conversationId: 'c-link' }),
      participation({ conversationId: 'c-plain', shareLinkId: null }),
    ]);

    // Un contrôle d'accès qu'on ne peut pas lire ne se dégrade pas en « aucun
    // contrôle » : seule la conversation NON liée reste servable.
    expect(result.unreadableConversationIds).toEqual(['c-link']);
    expect(result.floors.size).toBe(0);
  });

  it('ne retire rien quand la lecture aboutit', async () => {
    const result = await loadShareLinkHistoryFloorsOrFail(
      prismaWith([{ id: 'sl-1', allowViewHistory: false }]),
      [participation()],
    );
    expect(result.unreadableConversationIds).toEqual([]);
    expect(result.floors.get('c1')).toEqual(JOINED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `historyFloorFor` — la règle elle-même, sur UNE participation.
//
// Les deux formes de la règle (ensembliste pour `/sync`, unitaire pour les
// routes qui servent une seule conversation) doivent rendre le MÊME verdict.
// Les cas d'absence sont ce sur quoi deux lecteurs indépendants divergent en
// premier — ils sont donc énoncés ici et non laissés à l'intuition de chaque
// site d'appel.
// ─────────────────────────────────────────────────────────────────────────────

describe('historyFloorFor', () => {
  it('rend `joinedAt` quand le lien ferme l’historique', () => {
    expect(historyFloorFor(participation(), { allowViewHistory: false })).toEqual(JOINED);
  });

  it('ne rend RIEN quand le lien ouvre l’historique', () => {
    expect(historyFloorFor(participation(), { allowViewHistory: true })).toBeNull();
  });

  it('ne rend RIEN pour une participation sans lien (ajout direct)', () => {
    expect(historyFloorFor(participation({ shareLinkId: null }), null)).toBeNull();
  });

  it('ne borne RIEN quand le lien est INTROUVABLE — posture unique du dépôt', () => {
    // `messages.ts` sert l'historique dans ce cas (`if (shareLink) { … }`) et
    // `loadShareLinkHistoryFloors` aussi (aucune entrée dans la map). Un
    // troisième lecteur qui refuserait ici ferait diverger la même règle.
    expect(historyFloorFor(participation(), null)).toBeNull();
  });

  it('rend le MÊME verdict que la forme ensembliste', async () => {
    const floors = await loadShareLinkHistoryFloors(
      prismaWith([{ id: 'sl-1', allowViewHistory: false }]),
      [participation()],
    );
    expect(historyFloorFor(participation(), { allowViewHistory: false })).toEqual(floors.get('c1'));
  });
});

// ─── Le droit FIGÉ au join prime sur le lien ─────────────────────────────────
//
// On entre sous les conditions du MOMENT. Un hôte qui décoche `allowViewHistory`
// après coup ne referme pas l'historique à qui est déjà là — son levier sur les
// personnes déjà entrées est la surcharge par participant, pas le lien.
//
// Le repli n'est pas une précaution de style : toute participation créée avant
// ce champ l'a ABSENT, et sur le connecteur MongoDB un champ absent ne matche ni
// `null` ni `NOT null`. L'absence doit donc se lire « non figé », jamais
// « faux » — sinon la migration fermerait l'historique à toute la population
// existante d'un coup, sans qu'aucune requête ne le signale.

describe('historyFloorFor — le droit figé prime, le lien est le repli', () => {
  it('ouvre l’historique quand le droit figé l’accorde, MÊME si le lien le ferme', () => {
    const floor = historyFloorFor(
      { joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: true } },
      { allowViewHistory: false },
    );

    expect(floor).toBeNull();
  });

  it('ferme l’historique quand le droit figé le refuse, MÊME si le lien l’ouvre', () => {
    const floor = historyFloorFor(
      { joinedAt: JOINED, shareLinkId: 'sl-1', permissions: { canViewHistory: false } },
      { allowViewHistory: true },
    );

    expect(floor).toEqual(JOINED);
  });

  it('retombe sur le lien quand le droit figé est ABSENT — participation d’avant le champ', () => {
    const floor = historyFloorFor(
      { joinedAt: JOINED, shareLinkId: 'sl-1', permissions: {} },
      { allowViewHistory: false },
    );

    expect(floor).toEqual(JOINED);
  });

  it('retombe sur le lien quand `permissions` manque entièrement', () => {
    const floor = historyFloorFor(
      { joinedAt: JOINED, shareLinkId: 'sl-1' },
      { allowViewHistory: true },
    );

    expect(floor).toBeNull();
  });

  it('laisse la SURCHARGE de l’hôte primer sur le droit figé', () => {
    const floor = historyFloorFor(
      {
        joinedAt: JOINED,
        shareLinkId: 'sl-1',
        permissions: { canViewHistory: true },
        anonymousSession: { rights: { canViewHistory: false } },
      },
      { allowViewHistory: true },
    );

    expect(floor).toEqual(JOINED);
  });

  it('ignore une surcharge qui ne nomme PAS l’historique', () => {
    const floor = historyFloorFor(
      {
        joinedAt: JOINED,
        shareLinkId: 'sl-1',
        permissions: { canViewHistory: false },
        anonymousSession: { rights: { canSendFiles: true } },
      },
      { allowViewHistory: true },
    );

    expect(floor).toEqual(JOINED);
  });

  it('ne borne toujours RIEN sans lien, quoi que dise le droit figé', () => {
    const floor = historyFloorFor(
      { joinedAt: JOINED, shareLinkId: null, permissions: { canViewHistory: false } },
      null,
    );

    expect(floor).toBeNull();
  });
});
