/**
 * Les deux tests d'admission d'un post doivent rendre le MÊME verdict.
 *
 * Le dépôt en porte deux, pour deux formes de question :
 *
 * - `canUserConsumePost` (postVisibility.ts) — UN destinataire déjà engagé, deux
 *   requêtes pairwise bornées. Il garde le fil de commentaires et, depuis le
 *   cycle 30, les notifications unitaires (`comment_reply`, `comment_like`,
 *   `comment_reaction`).
 * - `filterPostConsumers` (postAudience.ts) — un LOT de candidats arbitraires
 *   (n'importe quel `@handle` du texte), intersection bornée en une requête. Il
 *   garde les lots de notification de mention.
 *
 * Deux implémentations parce que les formes diffèrent — pas parce que les
 * audiences diffèrent. Elles avaient pourtant divergé : le lot n'admettait que
 * les amis stricts, là où le verdict unitaire ET le filtre de feed admettent
 * amis ∪ contacts DM. Conséquence observable : un contact DM non-ami voyait le
 * post dans son feed, recevait une notification quand on répondait à son
 * commentaire — et RIEN quand on le nommait dans ce même post.
 *
 * Ce fichier verrouille l'accord. Toute divergence future casse ici, et pas en
 * production sur une notification silencieusement perdue.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { filterPostConsumers } from '../../../../services/posts/postAudience';
import {
  canUserConsumePost,
  canUserInteractWithPost,
  canUserViewPost,
} from '../../../../services/posts/postVisibility';

const AUTHOR = 'u-author';

const FRIEND = 'u-friend';
const DM_CONTACT = 'u-dm-contact';
const CO_MEMBER = 'u-co-member';
const STRANGER = 'u-stranger';

type Graph = {
  /** Amis acceptés de `AUTHOR`. */
  friends?: readonly string[];
  /** Contacts DM de `AUTHOR` — conversation directe active partagée. */
  dmContacts?: readonly string[];
  /** Co-membres de communauté de `AUTHOR`. */
  coMembers?: readonly string[];
};

/**
 * Un double unique qui répond aux DEUX formes de requête — `findMany` borné
 * (lot) et `findFirst` pairwise (unitaire) — à partir du même graphe.
 *
 * C'est ce qui rend le test de conformité honnête : si les deux fonctions
 * lisaient des fixtures distinctes, leur accord ne prouverait rien.
 */
function makeGraphPrisma(graph: Graph = {}) {
  const friends = new Set(graph.friends ?? []);
  const dmContacts = new Set(graph.dmContacts ?? []);
  const coMembers = new Set(graph.coMembers ?? []);

  /** Une conversation directe par contact DM de l'auteur. */
  const conversationOf = (userId: string) => `c-${userId}`;

  const idsFrom = (value: unknown): string[] =>
    Array.isArray(value) ? (value as string[]) : [];

  return {
    friendRequest: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        const candidates = new Set([
          ...idsFrom(where?.OR?.[0]?.receiverId?.in),
          ...idsFrom(where?.OR?.[1]?.senderId?.in),
        ]);
        return [...friends]
          .filter((id) => candidates.has(id))
          .map((id) => ({ senderId: AUTHOR, receiverId: id }));
      }),
      findFirst: jest.fn<any>(async ({ where }: any) => {
        const other = where?.OR?.[0]?.receiverId ?? where?.OR?.[1]?.senderId;
        return friends.has(other) ? { id: 'fr-1' } : null;
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where?.userId === AUTHOR) return [{ communityId: 'com-1' }];
        if (where?.communityId?.in) {
          return [...coMembers].map((id) => ({ userId: id, communityId: 'com-1' }));
        }
        return [];
      }),
      findFirst: jest.fn<any>(async ({ where }: any) =>
        coMembers.has(where?.userId) ? { id: 'cm-1' } : null
      ),
    },
    participant: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where?.userId === AUTHOR) {
          return [...dmContacts].map((id) => ({ conversationId: conversationOf(id) }));
        }
        if (where?.userId?.in) {
          const rooms = new Set(idsFrom(where?.conversationId?.in));
          return (where.userId.in as string[])
            .filter((id) => dmContacts.has(id) && rooms.has(conversationOf(id)))
            .map((id) => ({ userId: id }));
        }
        return [];
      }),
      findFirst: jest.fn<any>(async ({ where }: any) => {
        const rooms = new Set(idsFrom(where?.conversationId?.in));
        return dmContacts.has(where?.userId) && rooms.has(conversationOf(where.userId))
          ? { id: 'p-1' }
          : null;
      }),
    },
    post: { findFirst: jest.fn<any>(async () => null) },
    postComment: { findFirst: jest.fn<any>(async () => null) },
  } as any;
}

type Fixture = {
  label: string;
  visibility: string;
  visibilityUserIds?: readonly string[];
  graph: Graph;
  candidate: string;
  admitted: boolean;
};

const FIXTURES: readonly Fixture[] = [
  {
    label: 'PUBLIC — un inconnu lit un post public',
    visibility: 'PUBLIC',
    graph: {},
    candidate: STRANGER,
    admitted: true,
  },
  {
    label: 'PRIVATE — même un ami est refusé',
    visibility: 'PRIVATE',
    graph: { friends: [FRIEND] },
    candidate: FRIEND,
    admitted: false,
  },
  {
    label: 'PRIVATE — l’auteur reste admis sur son propre post',
    visibility: 'PRIVATE',
    graph: {},
    candidate: AUTHOR,
    admitted: true,
  },
  {
    label: 'ONLY — nommé sur la liste blanche',
    visibility: 'ONLY',
    visibilityUserIds: [STRANGER],
    graph: {},
    candidate: STRANGER,
    admitted: true,
  },
  {
    label: 'ONLY — ami absent de la liste blanche',
    visibility: 'ONLY',
    visibilityUserIds: [STRANGER],
    graph: { friends: [FRIEND] },
    candidate: FRIEND,
    admitted: false,
  },
  {
    label: 'FRIENDS — un ami',
    visibility: 'FRIENDS',
    graph: { friends: [FRIEND] },
    candidate: FRIEND,
    admitted: true,
  },
  {
    label: 'FRIENDS — un contact DM non-ami (le feed le lui montre)',
    visibility: 'FRIENDS',
    graph: { dmContacts: [DM_CONTACT] },
    candidate: DM_CONTACT,
    admitted: true,
  },
  {
    label: 'FRIENDS — un inconnu sans lien',
    visibility: 'FRIENDS',
    graph: { friends: [FRIEND], dmContacts: [DM_CONTACT] },
    candidate: STRANGER,
    admitted: false,
  },
  {
    label: 'EXCEPT — un ami hors liste noire',
    visibility: 'EXCEPT',
    visibilityUserIds: [STRANGER],
    graph: { friends: [FRIEND] },
    candidate: FRIEND,
    admitted: true,
  },
  {
    label: 'EXCEPT — un ami nommément exclu',
    visibility: 'EXCEPT',
    visibilityUserIds: [FRIEND],
    graph: { friends: [FRIEND] },
    candidate: FRIEND,
    admitted: false,
  },
  {
    label: 'EXCEPT — un contact DM nommément exclu',
    visibility: 'EXCEPT',
    visibilityUserIds: [DM_CONTACT],
    graph: { dmContacts: [DM_CONTACT] },
    candidate: DM_CONTACT,
    admitted: false,
  },
  {
    label: 'EXCEPT — un contact DM hors liste noire',
    visibility: 'EXCEPT',
    visibilityUserIds: [STRANGER],
    graph: { dmContacts: [DM_CONTACT] },
    candidate: DM_CONTACT,
    admitted: true,
  },
  {
    label: 'COMMUNITY — un co-membre',
    visibility: 'COMMUNITY',
    graph: { coMembers: [CO_MEMBER] },
    candidate: CO_MEMBER,
    admitted: true,
  },
  {
    label: 'COMMUNITY — un ami qui ne partage aucune communauté',
    visibility: 'COMMUNITY',
    graph: { friends: [FRIEND], coMembers: [CO_MEMBER] },
    candidate: FRIEND,
    admitted: false,
  },
];

describe('les deux tests d’admission d’un post s’accordent, cas par cas', () => {
  it.each(FIXTURES)('$label', async (fixture) => {
    const batchVerdict = await filterPostConsumers({
      prisma: makeGraphPrisma(fixture.graph),
      authorId: AUTHOR,
      visibility: fixture.visibility,
      visibilityUserIds: fixture.visibilityUserIds,
      candidateUserIds: [fixture.candidate],
    });

    const unitVerdict = await canUserConsumePost(
      makeGraphPrisma(fixture.graph),
      {
        authorId: AUTHOR,
        visibility: fixture.visibility as never,
        visibilityUserIds: [...(fixture.visibilityUserIds ?? [])],
      },
      fixture.candidate
    );

    expect(batchVerdict.includes(fixture.candidate)).toBe(fixture.admitted);
    expect(unitVerdict).toBe(fixture.admitted);
  });
});

describe('filterPostConsumers — le contact DM entre dans l’audience de consommation', () => {
  it('admet un contact DM non-ami nommé dans un post FRIENDS', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND], dmContacts: [DM_CONTACT] });

    const admitted = await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [FRIEND, DM_CONTACT, STRANGER],
    });

    expect(admitted).toEqual([FRIEND, DM_CONTACT]);
  });

  it('préserve l’ordre des candidats d’origine', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND], dmContacts: [DM_CONTACT] });

    const admitted = await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [DM_CONTACT, AUTHOR, FRIEND],
    });

    expect(admitted).toEqual([DM_CONTACT, AUTHOR, FRIEND]);
  });

  it('n’interroge PAS les conversations quand tous les candidats sont déjà amis', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND] });

    await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [FRIEND],
    });

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('n’interroge PAS les conversations pour un candidat déjà exclu par la liste noire', async () => {
    const prisma = makeGraphPrisma({ dmContacts: [DM_CONTACT] });

    const admitted = await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'EXCEPT',
      visibilityUserIds: [DM_CONTACT],
      candidateUserIds: [DM_CONTACT],
    });

    expect(admitted).toEqual([]);
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('borne la requête aux seuls candidats NON-amis — jamais au carnet entier', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND], dmContacts: [DM_CONTACT] });

    await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [FRIEND, DM_CONTACT, STRANGER],
    });

    const boundedCall = prisma.participant.findMany.mock.calls
      .map(([arg]: [any]) => arg)
      .find((arg: any) => arg?.where?.userId?.in);

    expect(boundedCall?.where.userId.in).toEqual([DM_CONTACT, STRANGER]);
  });
});

describe('filterPostConsumers — une panne du graphe DM ne détruit pas ce qui est établi', () => {
  it('garde les amis établis et refuse le résidu non résolu', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND], dmContacts: [DM_CONTACT] });
    prisma.participant.findMany = jest.fn<any>(async () => {
      throw new Error('mongo down');
    });

    const admitted = await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [FRIEND, DM_CONTACT],
    });

    expect(admitted).toEqual([FRIEND]);
  });

  it('refuse tout le monde quand c’est le graphe AMI qui est illisible', async () => {
    const prisma = makeGraphPrisma({ friends: [FRIEND], dmContacts: [DM_CONTACT] });
    prisma.friendRequest.findMany = jest.fn<any>(async () => {
      throw new Error('mongo down');
    });

    const admitted = await filterPostConsumers({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [FRIEND, DM_CONTACT],
    });

    expect(admitted).toEqual([]);
  });
});

/**
 * Être NOMMÉ dans un contenu l'ouvre — décision produit 2026-08-19.
 *
 * La branche traverse toutes les visibilités : un référencé passe une story
 * FRIENDS sans être ami. Mais elle n'ouvre que la CONSOMMATION, et l'asymétrie
 * « voir ⊇ interagir » (2026-07-08) tient : les deux verdicts ne diffèrent que
 * par leurs options, et une branche non gardée donnerait à tout référencé le
 * droit de réagir et de commenter.
 */
describe('canUserViewPost — branche référence', () => {
  function makeReferencePrisma(reference: unknown) {
    return {
      friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      postMention: { findUnique: jest.fn<any>().mockResolvedValue(reference) },
    } as any;
  }

  const REFERENCED_POST = {
    id: 'p1', authorId: AUTHOR, visibility: 'FRIENDS' as const, visibilityUserIds: [],
    expiresAt: null,
  };

  it('ouvre un post FRIENDS à un non-ami qui y est référencé', async () => {
    const prisma = makeReferencePrisma({ id: 'm1' });

    const allowed = await canUserViewPost(
      prisma,
      REFERENCED_POST,
      STRANGER,
      { includeDirectContacts: true, includeReferenced: true }
    );

    expect(allowed).toBe(true);
  });

  it('laisse un non-ami NON référencé dehors', async () => {
    const prisma = makeReferencePrisma(null);

    const allowed = await canUserViewPost(
      prisma,
      REFERENCED_POST,
      STRANGER,
      { includeDirectContacts: true, includeReferenced: true }
    );

    expect(allowed).toBe(false);
  });

  it('n’interroge PAS la table des références sans l’option', async () => {
    const prisma = makeReferencePrisma({ id: 'm1' });

    const allowed = await canUserViewPost(prisma, REFERENCED_POST, STRANGER, {});

    expect(allowed).toBe(false);
    expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
  });

  it('laisse un référencé CONSOMMER mais pas INTERAGIR', async () => {
    const prisma = makeReferencePrisma({ id: 'm1' });

    expect(await canUserConsumePost(prisma, REFERENCED_POST, STRANGER)).toBe(true);
    expect(await canUserInteractWithPost(prisma, REFERENCED_POST, STRANGER)).toBe(false);
  });

  /**
   * PRIVATE l'emporte sur la référence.
   *
   * La branche traverse FRIENDS, EXCEPT, ONLY et COMMUNITY — c'est ce que le
   * produit a décidé : l'auteur vient précisément de nommer cette personne.
   * PRIVATE dit autre chose, et le dit APRÈS : « moi seul ». Basculer un
   * contenu en archive personnelle doit le refermer sur TOUT LE MONDE, y
   * compris sur les personnes qu'il nomme encore.
   */
  it('refuse un référencé sur un post PRIVATE — « moi seul » l’emporte', async () => {
    const prisma = makeReferencePrisma({ id: 'm1' });

    const allowed = await canUserConsumePost(
      prisma,
      { ...REFERENCED_POST, visibility: 'PRIVATE' as const },
      STRANGER
    );

    expect(allowed).toBe(false);
  });

  it('n’interroge même pas la table des références sur un post PRIVATE', async () => {
    const prisma = makeReferencePrisma({ id: 'm1' });

    await canUserConsumePost(prisma, { ...REFERENCED_POST, visibility: 'PRIVATE' as const }, STRANGER);

    expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
  });

  /**
   * Un droit CONSOMMÉ ne doit plus rien ouvrir.
   *
   * `expiredViewAt` n'efface pas la ligne — la détruire fausserait l'inbox et
   * les compteurs. Tester son EXISTENCE laissait donc grand ouvert tout ce que
   * `canUserConsumePost` garde : le fil de commentaires, les réponses, la room
   * socket, les notifications. `GET /posts/:id` rendait bien `consumed`, et le
   * fil du même post servait textes, médias et identités.
   */
  describe('le droit s’éteint avec sa fenêtre', () => {
    const EXPIRED_POST = {
      ...REFERENCED_POST,
      expiresAt: new Date(Date.now() - 48 * 3600_000),
    };

    it('admet un référencé sur un contenu expiré tant qu’il n’a rien dépensé', async () => {
      const prisma = makeReferencePrisma({ id: 'm1', expiredViewAt: null });

      expect(await canUserConsumePost(prisma, EXPIRED_POST, STRANGER)).toBe(true);
    });

    it('admet un référencé pendant sa fenêtre de 24 h', async () => {
      const prisma = makeReferencePrisma({
        id: 'm1', expiredViewAt: new Date(Date.now() - 3600_000),
      });

      expect(await canUserConsumePost(prisma, EXPIRED_POST, STRANGER)).toBe(true);
    });

    it('REFUSE un référencé dont la fenêtre est close', async () => {
      const prisma = makeReferencePrisma({
        id: 'm1', expiredViewAt: new Date(Date.now() - 30 * 3600_000),
      });

      expect(await canUserConsumePost(prisma, EXPIRED_POST, STRANGER)).toBe(false);
    });

    it('ne ferme rien tant que le contenu VIT, quelle que soit la ligne', async () => {
      const prisma = makeReferencePrisma({
        id: 'm1', expiredViewAt: new Date(Date.now() - 30 * 3600_000),
      });

      expect(await canUserConsumePost(prisma, REFERENCED_POST, STRANGER)).toBe(true);
    });
  });

  /**
   * L'audience ORDINAIRE tranche la première.
   *
   * La branche référence est une VOIE DE SECOURS : la consulter d'abord faisait
   * payer une requête `postMention` à chaque lecteur légitime de chaque fil —
   * y compris sur un post PUBLIC, où aucune référence ne peut rien changer au
   * verdict.
   */
  describe('la référence n’est consultée qu’après un refus d’audience', () => {
    it('n’interroge pas les références pour un post PUBLIC', async () => {
      const prisma = makeReferencePrisma({ id: 'm1' });

      const allowed = await canUserConsumePost(
        prisma,
        { ...REFERENCED_POST, visibility: 'PUBLIC' as const },
        STRANGER
      );

      expect(allowed).toBe(true);
      expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
    });

    it('n’interroge pas les références pour un ami sur un post FRIENDS', async () => {
      const prisma = makeReferencePrisma({ id: 'm1' });
      prisma.friendRequest.findFirst.mockResolvedValue({ id: 'fr-1' });

      const allowed = await canUserConsumePost(prisma, REFERENCED_POST, FRIEND);

      expect(allowed).toBe(true);
      expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
    });

    it('n’interroge pas les références pour l’AUTEUR de son propre post expiré', async () => {
      const prisma = makeReferencePrisma(null);

      const allowed = await canUserConsumePost(
        prisma,
        { ...REFERENCED_POST, expiresAt: new Date(Date.now() - 48 * 3600_000) },
        AUTHOR
      );

      expect(allowed).toBe(true);
      expect(prisma.postMention.findUnique).not.toHaveBeenCalled();
    });
  });
});
