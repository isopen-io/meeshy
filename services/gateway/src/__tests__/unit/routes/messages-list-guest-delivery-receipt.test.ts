/**
 * #17077 — `GET …/messages` doit poser l'accusé de LIVRAISON d'un invité de
 * lien comme il le fait pour un inscrit.
 *
 * Le gate était `!authContext.isAnonymous`, et il ne protégeait RIEN :
 * `currentParticipantId` est résolu correctement pour les deux identités vingt
 * lignes plus haut (`isAnonymousUser ? authContext.participantId :
 * currentParticipant?.id`), et `markMessagesAsReceived` prend un
 * `Participant.id`, pas un `User.id`. Le gate retirait donc la population des
 * invités de lien d'un des trois transports du même fait, sans une ligne pour
 * le justifier.
 *
 * C'est le cas de référence que le `CLAUDE.md` du gateway interdit nommément :
 * « Ne JAMAIS enterrer l'incomplétude sous un `if (!isAnonymous)` au site
 * d'appel : le gate donne l'omission pour une règle produit ». Cas réel cité
 * là-bas : `_emitUnreadCountsSnapshot` (cycle 61), qui a privé de pastille
 * exacte TOUTE cette population pendant des mois.
 *
 * ─── Pourquoi le témoin doit être ANONYME ────────────────────────────────────
 *
 * Écrit avec un JWT, il ne peut pas tomber : la branche inscrite passait déjà.
 * C'est la règle du rang (leçon 261) — un témoin se pose là où les deux formes
 * divergent, et ici elles ne divergent que sur l'identité sans compte.
 *
 * ─── Et l'accusé est DÉTACHÉ ─────────────────────────────────────────────────
 *
 * Le site est un `void (async () => …)().catch(…)`, délibérément
 * fire-and-forget (l'awaiter coûtait 50-130 ms sur l'endpoint le plus appelé).
 * Le témoin doit donc franchir la phase « check » de la boucle d'événements
 * après la réponse, sans quoi il mesure l'instant d'avant le dispatch — c'est
 * le patron que le `CLAUDE.md` du gateway donne pour les promesses détachées.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

// Typé avec SES paramètres : sans eux, `jest.fn(async () => 1)` se déclare à
// zéro argument et `toHaveBeenCalledWith(id, conv)` devient une erreur de
// typecheck — invisible sous ts-jest (qui transpile sans types) et visible au
// cliquet `tsc-never-loaded-tests-ratchet`, qui passe `tsconfig.test.json` sur
// TOUS les fichiers de test. Et le type est ce qui dit ce qu'on assert : la clé
// est un `Participant.id`, la seconde un `conversationId`.
const markMessagesAsReceived = jest.fn(
  async (_participantId: string, _conversationId: string): Promise<number> => 1,
);

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    markMessagesAsReceived = markMessagesAsReceived;
  },
}));

// La PORTE d'accès est doublée — son propre comportement a ses témoins
// ailleurs, et ce fichier mesure ce qui se passe APRÈS elle. C'est le patron
// que le dépôt emploie déjà (`conversation-participants-decor-10713.test.ts`).
jest.mock('../../../routes/conversations/utils/conversation-read-gate', () => ({
  ouvrirConversationLisible: async () => 'aaaaaaaaaaaaaaaaaaaaaaaa',
  REFUS_DE_LECTURE: {},
}));

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const GUEST_PARTICIPANT = 'cccccccccccccccccccccccc';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REGISTERED_USER = 'eeeeeeeeeeeeeeeeeeeeeeee';
const REGISTERED_PARTICIPANT = 'ffffffffffffffffffffffff';

/** Le drain de la phase « check » : le dispatch détaché a eu lieu après elle. */
const drainDetached = () => new Promise((resolve) => setImmediate(resolve));

function makePrisma() {
  const participantRow = {
    id: GUEST_PARTICIPANT,
    userId: null,
    conversationId: CONV,
    isActive: true,
    role: 'member',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: { rights: null },
    user: null,
  };
  const messageRow = {
    id: MSG,
    conversationId: CONV,
    senderId: 'dddddddddddddddddddddddd',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    isEdited: false,
    deletedAt: null,
    translations: {},
    attachments: [],
    sender: { id: 'dddddddddddddddddddddddd', userId: null, displayName: 'Hôte', avatar: null, role: 'creator' },
  };
  return {
    conversation: {
      findFirst: jest.fn(async () => ({ id: CONV, isActive: true, type: 'group' })),
      findUnique: jest.fn(async () => ({ id: CONV, isActive: true, type: 'group' })),
    },
    participant: {
      findFirst: jest.fn(async () => participantRow),
      findMany: jest.fn(async () => [participantRow]),
    },
    conversationShareLink: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    message: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [messageRow]),
      count: jest.fn(async () => 1),
    },
    user: { findFirst: jest.fn(async () => null) },
    conversationPreference: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
  };
}

async function buildApp(
  prisma: ReturnType<typeof makePrisma>,
  identity: 'guest' | 'registered' = 'guest',
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // `optionalAuth` est le hook que la route reçoit : on y pose l'identité SANS
  // COMPTE exactement comme le middleware unifié le fait pour un invité de lien
  // (`authContext.userId` porte alors un `Participant.id`).
  const optionalAuth = async (request: Record<string, unknown>) => {
    request.authContext = identity === 'guest'
      ? {
          type: 'anonymous',
          isAnonymous: true,
          participantId: GUEST_PARTICIPANT,
          userId: GUEST_PARTICIPANT,
          hasFullAccess: false,
        }
      : {
          type: 'registered',
          isAnonymous: false,
          userId: REGISTERED_USER,
          registeredUser: { id: REGISTERED_USER },
          hasFullAccess: true,
        };
  };
  const { registerMessagesListRoute } = await import('../../../routes/conversations/messages-list');
  registerMessagesListRoute(app as never, prisma as never, optionalAuth);
  await app.ready();
  return app;
}

describe('#17077 — l’accusé de livraison d’un invité de lien sur `GET …/messages`', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    markMessagesAsReceived.mockImplementation(async () => 1);
    prisma = makePrisma();
  });

  it('pose l’accusé pour le `Participant.id` de l’invité', async () => {
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV}/messages`,
      headers: { 'x-session-token': 'tok-invite' },
    });

    expect(res.statusCode).toBe(200);
    await drainDetached();

    // La clé est un `Participant.id` — jamais un `User.id`, que cet invité n'a
    // pas. C'est précisément ce que le gate retiré rendait inatteignable.
    expect(markMessagesAsReceived).toHaveBeenCalledWith(GUEST_PARTICIPANT, CONV);

    await app.close();
  });

  /**
   * NON-RÉGRESSION, et elle n'est pas décorative : sans elle, le témoin
   * ci-dessus ne distingue pas « les invités sont servis » de « l'accusé part
   * pour n'importe qui ». C'est la branche qui marchait DÉJÀ, et le lot ne doit
   * pas l'avoir déplacée.
   */
  it('sert toujours l’inscrit, sous son propre `Participant.id`', async () => {
    (prisma.participant.findFirst as jest.Mock<any>).mockImplementation(async () => ({
      id: REGISTERED_PARTICIPANT,
      userId: REGISTERED_USER,
      conversationId: CONV,
      isActive: true,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      shareLinkId: null,
      historyVisibleFrom: null,
      permissions: null,
      anonymousSession: null,
      user: { role: 'USER' },
    }));
    const app = await buildApp(prisma, 'registered');

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV}/messages`,
      headers: { authorization: 'Bearer jeton' },
    });

    expect(res.statusCode).toBe(200);
    await drainDetached();

    // Sous le `Participant.id` de l'inscrit, pas son `User.id` : les deux
    // espaces d'ids ne se croisent jamais, et c'est la ligne `Participant` que
    // l'accusé référence.
    expect(markMessagesAsReceived).toHaveBeenCalledWith(REGISTERED_PARTICIPANT, CONV);

    await app.close();
  });

  it('n’enfile aucun accusé quand la page est VIDE', async () => {
    (prisma.message.findMany as jest.Mock<any>).mockImplementation(async () => []);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV}/messages`,
      headers: { 'x-session-token': 'tok-invite' },
    });

    expect(res.statusCode).toBe(200);
    await drainDetached();

    // `messages.length > 0` est la seule condition qui reste, et elle doit
    // rester : un accusé sur une page vide n'accuse rien.
    expect(markMessagesAsReceived).not.toHaveBeenCalled();

    await app.close();
  });
});
