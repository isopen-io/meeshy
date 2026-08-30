/**
 * Unit tests for conversations/leave.ts
 * Tests POST /conversations/:id/leave
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { makeChainableIO } from '../../helpers/chainable-io';

// ─── Mocks (must be hoisted before imports) ──────────────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>().mockResolvedValue(null),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
    PARTICIPANT_ROLE_UPDATED: 'participant:role-updated',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLeaveRoutes } from '../../../routes/conversations/leave';
import { resolveConversationId } from '../../../utils/conversation-id-cache';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const WITNESS_ID = '507f1f77bcf86cd799439044';
/** Participant entré par lien de partage : aucune ligne `User` derrière lui. */
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSocketIO() {
  const mockIo = makeChainableIO();
  const mockEmit = mockIo._emit;
  const mockLeave = mockIo._leave;
  const mockFetchSockets = mockIo._fetchSockets;
  const mockManager = {
    getIO: jest.fn<any>().mockReturnValue(mockIo),
    invalidateParticipantCache: jest.fn<any>(),
    endLiveLocationForDepartedMember: jest.fn<any>(),
  };
  return { mockIo, mockManager, mockFetchSockets, mockEmit, mockLeave };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>(),
      // Les membres restants à qui adresser le départ : l'événement va
      // désormais aussi vers leurs rooms PERSONNELLES, où se lit l'écran de
      // liste qui rend l'effectif.
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
      ...(overrides.participant ?? {}),
    },
    notification: {
      // La trace des promotions, que la succession du créateur (#4058) lit
      // pour dater le rang d'administrateur. Vide par défaut : la règle
      // replie alors sur `joinedAt`, et reste totale.
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...(overrides.notification ?? {}),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      // La loi de succession écarte d'abord le DM JAMAIS UTILISÉ, qui se ferme
      // au lieu de se transmettre — 0 ici : ces scénarios ne sont pas ce DM.
      count: jest.fn<any>().mockResolvedValue(0),
      ...(overrides.conversation ?? {}),
    },
    // La clôture et le départ committent ensemble (cycle 69) : le double rend
    // les résultats dans l'ordre, ce dont la route se sert pour lire l'audience
    // ramenée par l'écriture de clôture.
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
    ...(overrides.$transaction ? { $transaction: overrides.$transaction } : {}),
  };
}

async function buildApp({
  prismaOverrides = {} as Record<string, any>,
  socketIOHandler = null as any,
} = {}): Promise<{
  app: FastifyInstance;
  prisma: ReturnType<typeof makePrisma>;
  socket: ReturnType<typeof makeSocketIO>;
}> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma(prismaOverrides);
  const socket = makeSocketIO();

  app.decorate('socketIOHandler', socketIOHandler !== null
    ? socketIOHandler
    : { getManager: () => socket.mockManager });

  const requiredAuth = async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerLeaveRoutes(app, prisma as any, null, requiredAuth);
  await app.ready();
  return { app, prisma, socket };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /conversations/:id/leave — participant not found', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 404 when user is not a participant', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /conversations/:id/leave — creator with other active members', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  const ADMIN_ID = '507f1f77bcf86cd799439077';
  const ADMIN_USER_ID = '507f1f77bcf86cd799439088';

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'creator',
            isActive: true,
            displayName: 'Alice',
          }),
          findMany: jest.fn<any>().mockResolvedValue([
            {
              id: 'p-ancien',
              userId: 'u-ancien',
              role: 'member',
              joinedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            {
              id: ADMIN_ID,
              userId: ADMIN_USER_ID,
              role: 'admin',
              joinedAt: new Date('2026-06-01T00:00:00.000Z'),
            },
          ]),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('laisse le créateur PARTIR — le fil trouve son héritier (#4058)', async () => {
    // Cette porte répondait `400` « transférez l'ownership ou supprimez la
    // conversation » pendant que sa jumelle `delete-for-me.ts` transférait
    // en silence : un même geste, deux contrats.
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("donne la conversation à l'administrateur, pas au plus ancien membre", async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADMIN_ID }, data: { role: 'creator' } })
    );
  });

  it('ne ferme PAS un fil qui a trouvé son héritier', async () => {
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});

describe('POST /conversations/:id/leave — creator alone (count=0)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'creator',
            isActive: true,
            displayName: 'Alice',
          }),
          count: jest.fn<any>().mockResolvedValue(0),
          update: jest.fn<any>().mockResolvedValue({}),
        },
        conversation: {
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 when creator is last member', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('deactivates the conversation, and ENREGISTRE la clôture', async () => {
    // Le second témoin de la même phrase — celui-ci passe par `app.inject`,
    // l'autre appelle le handler à nu (`conversation-leave-ban-delete-stats`).
    // Les deux épinglaient `data: { isActive: false }` à l'exclusion du reste,
    // et donc le défaut : `loadConversationTombstones` interroge `closedAt >
    // since` et rien d'autre.
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONV_ID },
        data: { isActive: false, closedAt: expect.any(Date), closedBy: USER_ID },
      })
    );
  });
});

describe('POST /conversations/:id/leave — regular member', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'member',
            isActive: true,
            displayName: 'Alice',
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 for a regular member', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls participant.update with isActive=false and leftAt', async () => {
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false }),
      })
    );
  });
});

describe('POST /conversations/:id/leave — DB error on findFirst', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockRejectedValue(new Error('DB connection error')),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 500 when DB throws on findFirst', async () => {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
    expect(res.statusCode).toBe(500);
  });
});

/**
 * Le partant n'était adressé QUE par la room de conversation — c'est-à-dire par
 * le seul canal que ses appareils quittent dès qu'ils affichent la LISTE.
 *
 * L'argument est déjà écrit dans cette route, mais il n'avait été appliqué qu'à
 * l'audience : on a élargi l'éventail vers les rooms personnelles des membres
 * RESTANTS parce que « l'effectif se lit sur l'écran de liste, dont les lecteurs
 * ont quitté la room ». Le même écran, chez le partant, ne porte pas un compteur
 * faux — il porte une ligne qui n'existe plus côté serveur : `GET /conversations`
 * exige `participants.some({ userId, isActive: true })`. Et les deux clients la
 * PERSISTENT (cache disque iOS, `staleTime: Infinity` web), donc elle survivait
 * jusqu'au prochain delta.
 */
describe('POST /conversations/:id/leave — les AUTRES appareils du partant', () => {
  let app: FastifyInstance;
  let socket: ReturnType<typeof makeSocketIO>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, socket } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'member',
            isActive: true,
            displayName: 'Alice',
          }),
          findMany: jest.fn<any>().mockResolvedValue([
            { id: 'p-witness', userId: WITNESS_ID },
            { id: ANON_PARTICIPANT_ID, userId: null },
          ]),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
  });

  afterAll(async () => { await app.close(); });

  it('chaîne la room PERSONNELLE du partant, après celles des restants', () => {
    expect(socket.mockIo._roomsFor('conversation:participant-left')).toEqual([
      `conversation:${CONV_ID}`,
      `user:${WITNESS_ID}`,
      `user:${ANON_PARTICIPANT_ID}`,
      `user:${USER_ID}`,
    ]);
  });

  it("n'émet qu'UNE fois — un appareil du partant resté dans la room ne double pas", () => {
    expect(socket.mockIo._sent.filter((s) => s.event === 'conversation:participant-left')).toHaveLength(1);
  });

  it('adresse le partant AVANT de le sortir de la room', () => {
    // `fetchSockets().leave(room)` s'exécute après l'emit dans la route. Si
    // l'ordre s'inversait, l'appareil qui a le fil ouvert perdrait le signal.
    expect(socket.mockIo._indexOf('conversation:participant-left')).toBe(0);
    expect(socket.mockLeave).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
  });

  it("éteint le partage de position du partant — le fil VIT, et il n'a plus le pouvoir de l'arrêter", () => {
    // `location:live-stop` commence par résoudre l'appartenance
    // (`isActive: true`) : partie, elle ne rend plus rien et le verbe tombe en
    // silence. Sans cette extinction, l'épingle reste plantée dans un groupe
    // dont le partant ne fait plus partie, jusqu'à huit heures.
    expect(socket.mockManager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID
    );
  });

  it("porte l'effectif des RESTANTS, partant exclu", () => {
    expect(socket.mockIo._payloadFor('conversation:participant-left')).toMatchObject({
      conversationId: CONV_ID,
      userId: USER_ID,
      memberCount: 2,
    });
  });
});

/**
 * Lot 1 — l'effectif ENTIER passe aussi par le canal socket.
 *
 * Le fanout ne portait qu'UNE présentation, la plafonnée : l'admin d'un groupe
 * de 250 personnes, qui venait de lire 250 par REST, voyait son compteur
 * retomber à « 199+ » au premier départ. Le canal partagé DÉGRADAIT ce que la
 * règle produit lui accorde, et les deux clients persistent la valeur reçue.
 */
describe('POST /conversations/:id/leave — l\'effectif ENTIER pour l\'admin du groupe', () => {
  let app: FastifyInstance;
  let socket: ReturnType<typeof makeSocketIO>;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, socket, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID,
            userId: USER_ID,
            conversationId: CONV_ID,
            role: 'member',
            isActive: true,
            displayName: 'Alice',
          }),
          findMany: jest.fn<any>().mockResolvedValue([
            { id: 'p-admin', userId: WITNESS_ID, role: 'admin', user: { role: 'USER' } },
            ...Array.from({ length: 249 }, (_, i) => ({
              id: `p-big-${i}`,
              userId: null,
              role: 'member',
              user: null,
            })),
          ]),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      },
    }));
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave` });
  });

  afterAll(async () => { await app.close(); });

  it('sert 250 à l\'admin du groupe et « 199+ » aux autres', () => {
    const sends = socket.mockIo._sendsFor('conversation:participant-left');
    expect(sends).toHaveLength(2);

    expect(sends[0].payload).toMatchObject({ memberCount: 199, memberCountCapped: true });
    // Sans l'exclusion, l'admin qui a le FIL ouvert recevrait AUSSI la copie
    // plafonnée, par la room de conversation.
    expect(sends[0].excepts).toEqual([`user:${WITNESS_ID}`]);

    expect(sends[1].rooms).toEqual([`user:${WITNESS_ID}`]);
    expect(sends[1].payload).toMatchObject({ memberCount: 250 });
    expect((sends[1].payload as any).memberCountCapped).toBeUndefined();
  });

  it('demande le rôle de conversation ET le rôle plateforme des restants', () => {
    const select = (prisma.participant.findMany as jest.MockedFunction<any>).mock.calls[0][0].select;
    expect(select).toMatchObject({
      id: true,
      userId: true,
      role: true,
      user: { select: { role: true } },
    });
  });
});
