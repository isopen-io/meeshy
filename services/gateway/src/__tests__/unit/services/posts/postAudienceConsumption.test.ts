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
import { canUserConsumePost } from '../../../../services/posts/postVisibility';

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
