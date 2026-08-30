/**
 * Unit tests for conversations delete-for-me route (delete-for-me.ts)
 * Tests DELETE /conversations/:id/delete-for-me.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockInvalidateParticipantLookup = jest.fn();

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: (...args: any[]) => mockInvalidateParticipantLookup(...args),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
    CONVERSATION_DELETED: 'conversation:deleted',
    CONVERSATION_CLOSED: 'conversation:closed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerDeleteForMeRoutes } from '../../../../routes/conversations/delete-for-me';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const SUCCESSOR_ID = '507f1f77bcf86cd799439044';

const mockParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  userId: USER_ID,
  role: 'member',
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParticipant),
      update: jest.fn<any>().mockResolvedValue({ ...mockParticipant, isActive: false }),
      // Membres encore actifs APRÈS la désactivation de l'appelant — l'audience
      // de `conversation:closed`. Vide par défaut : les scénarios qui ne
      // ferment rien ne doivent nommer personne.
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
      // Default: not a genuinely-empty direct DM (matches the default 'group'
      // scenarios in this file — the `count` query filters `type: 'direct'`
      // itself, so a non-direct conversation would also resolve to 0 here).
      count: jest.fn<any>().mockResolvedValue(0),
    },
    // La clôture (ou la promotion du successeur) et le masquage de l'appelant
    // committent ensemble (cycle 69).
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
    ...overrides,
  };
}

// Double Socket.IO chaînable : `to()` se rend lui-même, donc
// `io.to(a).to(b).emit(e, p)` enregistre les DEUX rooms dans `to.mock.calls` et
// l'émission unique dans `emit.mock.calls` — la forme exacte
// qu'`emitToConversationParticipants` produit.
function makeMockIO() {
  return {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([{ leave: jest.fn() }]),
  };
}

/** Les rooms nommées pour un événement donné, dans l'ordre du chaînage. */
function roomsFor(io: ReturnType<typeof makeMockIO>, event: string): string[] {
  return io.emit.mock.calls.some(([e]: any[]) => e === event)
    ? io.to.mock.calls.map(([room]: any[]) => room as string)
    : [];
}

/** La charge utile émise pour un événement, ou `undefined` s'il n'a pas été émis. */
function payloadFor(io: ReturnType<typeof makeMockIO>, event: string): any {
  return io.emit.mock.calls.find(([e]: any[]) => e === event)?.[1];
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  withSocket?: boolean;
  io?: ReturnType<typeof makeMockIO>;
  endLiveLocations?: jest.Mock;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), withSocket = false } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withSocket || opts.io) {
    const mockIO = opts.io ?? makeMockIO();
    const endLiveLocations = opts.endLiveLocations ?? jest.fn();
    app.decorate('socketIOHandler', {
      getManager: jest.fn(() => ({
        getIO: jest.fn(() => mockIO),
        invalidateParticipantCache: jest.fn(),
        endLiveLocationsForClosedConversation: endLiveLocations,
      })),
    });
  } else {
    app.decorate('socketIOHandler', null as any);
  }

  registerDeleteForMeRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

// ─── DELETE /conversations/:id/delete-for-me ──────────────────────────────────

describe('DELETE /conversations/:id/delete-for-me — not a participant', () => {
  it('returns 404 when user is not in the conversation', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — success as regular member', () => {
  it('returns 200 when member soft-deletes the conversation', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBeDefined();
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with a successor', () => {
  it('returns 200 and transfers ownership to the elected successor', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const successor = { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([
          { ...successor, joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator, empty direct DM', () => {
  it('returns 200 and closes the conversation instead of transferring ownership', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
        // Present-and-null (a genuinely empty post-migration DM) — the `count`
        // guard matches this state, unlike an absent field (see regression
        // test below).
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { id: 'conv-resolved-id', type: 'direct', firstMessageSentAt: null },
    });
    // La clôture s'ENREGISTRE comme telle : `isActive: false` seul laissait la
    // fermeture hors de portée du stream de tombstones (`closedAt > since`).
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
    expect(prisma.participant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'creator' } })
    );
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator, legacy direct DM with firstMessageSentAt ABSENT', () => {
  // Regression — Prisma-Mongo absent-vs-null (corrigé en revue pré-merge,
  // 2026-08-10). The Prisma JS client returns `null` for `firstMessageSentAt`
  // both when the field is present-and-null AND when it is ABSENT (every
  // pre-migration `direct` conversation, never backfilled) — the two states
  // are indistinguishable once passed through a `select` + JS negation. The
  // fix queries the DB directly for the present-and-null state via `count`,
  // which — on a real Mongo connector — never matches an absent field. We
  // simulate that real behaviour here by resolving `count` to 0: a legacy DM
  // MUST take the ownership-transfer path, never the close-conversation path.
  it('treats an absent (legacy, pre-migration) firstMessageSentAt as NOT empty and transfers ownership', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const successor = { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([
          { ...successor, joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({}),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    expect(prisma.conversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — creator with no other members', () => {
  it('returns 200 and deactivates the conversation', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — success with socket events', () => {
  it('returns 200 and emits socket events for deletion', async () => {
    const app = await buildApp({ withSocket: true });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Clôture GLOBALE : le fait est durable, l'annonce doit l'être aussi ───────
//
// Cycle 29 — la sonde « moment de la diffusion vs durabilité du fait ». Deux
// branches de cette route ferment la conversation POUR TOUT LE MONDE
// (`Conversation.isActive = false`), et la seule chose qu'elles émettaient est
// `conversation:deleted` vers la room de l'APPELANT — l'événement dont le
// contrat dit mot pour mot « the conversation stays active for every other
// participant ». L'annonce contredisait le fait.
//
// Le jumeau CORRECT est `DELETE /conversations/:id` (`core.ts`) : il écrit
// `closedAt`/`closedBy` et diffuse `conversation:closed` par
// `emitToConversationParticipants`. Ces témoins mesurent la seule propriété que
// la suite ne mesurait pas : ce qu'apprend le participant qui RESTE.

const OTHER_PARTICIPANT = { id: '507f1f77bcf86cd799439055', userId: 'other-user' };

function makeClosingPrisma(overrides: Record<string, any> = {}) {
  const creatorParticipant = { ...mockParticipant, role: 'creator' };
  return makePrisma({
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      // L'audience sort de l'ÉCRITURE (`include`), comme chez le jumeau
      // `core.ts` : pas de seconde requête à retomber sur un état déjà modifié,
      // et pas un mode d'échec de plus après des écritures committées.
      // L'appelant y figure encore — il n'est désactivé qu'ensuite — et c'est
      // sans conséquence : les deux annonces sont des événements DISTINCTS
      // (`conversation:deleted` le concerne, `conversation:closed` décrit la
      // clôture globale), une copie chacun.
      update: jest.fn<any>().mockResolvedValue({
        id: CONV_ID,
        isActive: false,
        participants: [
          { id: PART_ID, userId: USER_ID, isActive: true },
          { ...OTHER_PARTICIPANT, isActive: true },
        ],
      }),
      count: jest.fn<any>().mockResolvedValue(1), // DM vide → branche de clôture
    },
    ...overrides,
  });
}

describe('DELETE /conversations/:id/delete-for-me — DM vide fermé alors qu\'un membre reste actif', () => {
  it('annonce la clôture au membre restant sur sa room PERSONNELLE', async () => {
    // Le cas que le commentaire de la route nomme lui-même : « fermer plutôt
    // que transférer, MÊME S'IL RESTE UN AUTRE PARTICIPANT ACTIF ». Ce
    // participant n'apprenait rien, par aucun canal.
    const io = makeMockIO();
    const prisma = makeClosingPrisma();
    const app = await buildApp({ prisma, io });

    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(res.statusCode).toBe(200);
    // La room personnelle, pas seulement la room de conversation : un client
    // posé sur la LISTE a quitté `conversation:<id>` et n'est joignable que là
    // — c'est la raison d'être d'`emitToConversationParticipants`.
    expect(roomsFor(io, 'conversation:closed')).toContain('user:other-user');
    await app.close();
  });

  it('éteint les partages de position en cours du fil fermé', async () => {
    const endLiveLocations = jest.fn();
    const app = await buildApp({ prisma: makeClosingPrisma(), io: makeMockIO(), endLiveLocations });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(endLiveLocations).toHaveBeenCalledWith('conv-resolved-id');
    await app.close();
  });

  it('porte closedBy et closedAt dans la charge utile', async () => {
    const io = makeMockIO();
    const app = await buildApp({ prisma: makeClosingPrisma(), io });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(payloadFor(io, 'conversation:closed')).toEqual({
      conversationId: 'conv-resolved-id',
      closedBy: USER_ID,
      closedAt: expect.any(String),
    });
    await app.close();
  });

  it('écrit closedAt/closedBy, sans quoi AUCUN delta ne portera jamais la clôture', async () => {
    // `loadConversationTombstones` (delta-tombstones.ts) interroge
    // `conversation.findMany({ where: { closedAt: { gt: since } } })`. Une
    // clôture qui n'écrit que `isActive: false` est invisible pour ce stream :
    // le membre restant garde la ligne dans son cache persistant (disque iOS,
    // `staleTime: Infinity` web) delta après delta, jusqu'à une réconciliation
    // COMPLÈTE. Le champ n'est pas décoratif — il EST le canal de rattrapage.
    const prisma = makeClosingPrisma();
    const app = await buildApp({ prisma, withSocket: true });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-resolved-id' },
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — clôture faute de successeur', () => {
  it('écrit closedAt/closedBy comme la branche jumelle', async () => {
    // Aucun AUTRE membre actif ne subsiste ici — mais la clôture doit rester
    // ENREGISTRÉE comme telle. Une ligne `isActive: false`
    // sans `closedAt` est une conversation fermée dont la base ne sait pas
    // qu'elle l'a été, et les deux branches produisaient exactement ça.
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({
          id: CONV_ID,
          isActive: false,
          participants: [{ id: PART_ID, userId: USER_ID, isActive: true }],
        }),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    });
    const app = await buildApp({ prisma, withSocket: true });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-resolved-id' },
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — ce qui ne ferme rien n\'annonce rien', () => {
  it('un membre ordinaire ne déclenche ni clôture ni conversation:closed', async () => {
    // Le pendant indispensable des témoins ci-dessus : une garde qui émet
    // TOUJOURS passerait les trois premiers et serait pourtant une régression
    // bien pire — la conversation reste ouverte pour tout le monde.
    const io = makeMockIO();
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(mockParticipant), // role: 'member'
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma, io });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(payloadFor(io, 'conversation:closed')).toBeUndefined();
    await app.close();
  });

  it('un transfert d\'ownership n\'annonce pas une clôture qui n\'a pas eu lieu', async () => {
    const io = makeMockIO();
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([
          { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma, io });

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(payloadFor(io, 'conversation:closed')).toBeUndefined();
    // Le canal qui DOIT rester : la promotion du successeur.
    expect(payloadFor(io, 'participant:role-updated')).toBeDefined();
    await app.close();
  });
});

describe('DELETE /conversations/:id/delete-for-me — participant lookup cache invalidation', () => {
  it('invalidates the cached participant lookup for the deleting user', async () => {
    mockInvalidateParticipantLookup.mockClear();
    const app = await buildApp();
    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(PART_ID, 'conv-resolved-id');
    await app.close();
  });
});

/**
 * **Le transfert d'ownership se déclenche quelle que soit la casse du rang**
 * (issue #4008).
 *
 * `participant.role === 'creator'` gouverne ici une CONSÉQUENCE, pas une
 * permission : c'est la branche qui promeut un successeur avant que le créateur
 * ne se retire. Sur une ligne écrite `CREATOR`, l'égalité stricte ne tire pas,
 * la branche est sautée — et la conversation se retrouve **sans créateur**,
 * silencieusement : aucune erreur, un 200, et plus personne pour la gouverner.
 *
 * > Une comparaison de rôle ne garde pas toujours une porte. Celle-ci ne
 * > refuse rien : elle DOIT quelque chose. Sa panne ne se voit ni dans un code
 * > d'erreur ni dans un log — seulement dans l'état laissé derrière.
 */
describe('DELETE /conversations/:id/delete-for-me — le créateur écrit CREATOR transmet quand même (#4008)', () => {
  it('promeut un successeur au lieu de laisser la conversation sans créateur', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'CREATOR' };
    const successor = { id: SUCCESSOR_ID, userId: 'other-user', role: 'moderator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        findMany: jest.fn<any>().mockResolvedValue([
          { ...successor, joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });

    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });

    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    await app.close();
  });
});
