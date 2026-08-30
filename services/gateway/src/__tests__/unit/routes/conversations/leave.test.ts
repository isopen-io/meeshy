/**
 * Unit tests for conversations leave route (leave.ts)
 * Tests POST /conversations/:id/leave.
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
    CONVERSATION_PARTICIPANT_LEFT: 'conversation:participant-left',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLeaveRoutes } from '../../../../routes/conversations/leave';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const mockParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  userId: USER_ID,
  role: 'member',
  displayName: 'Alice',
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

// `resolveConversationId` est doublé : la route travaille sur l'id RÉSOLU,
// et c'est lui qui nomme la room comme il remplit le payload.
const RESOLVED_CONV_ID = 'conv-resolved-id';
const REMAINING_USER_ID = '507f1f77bcf86cd799439044';
const REMAINING_ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439055';

/** Les membres encore actifs APRÈS le départ — sans le partant, donc. */
const remainingParticipants = [
  { id: 'p-remaining', userId: REMAINING_USER_ID },
  // Participant sans compte (entré par lien de partage) : sa room personnelle
  // est nommée d'après son `Participant.id`, cf. `emitToConversationParticipants`.
  { id: REMAINING_ANON_PARTICIPANT_ID, userId: null },
];

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParticipant),
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue(remainingParticipants),
      update: jest.fn<any>().mockResolvedValue({ ...mockParticipant, isActive: false }),
    },
    notification: {
      // La trace des promotions, lue par la succession du créateur (#4058).
      // Vide : la règle replie alors sur `joinedAt`, et reste totale.
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
      // La loi de succession écarte d'abord le DM JAMAIS UTILISÉ, qui se ferme
      // au lieu de se transmettre — 0 ici : ces scénarios ne sont pas ce DM.
      count: jest.fn<any>().mockResolvedValue(0),
    },
    // La clôture et le départ committent ensemble (cycle 69).
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
    ...overrides,
  };
}

type EmittedEvent = { rooms: string[]; event: string; payload: any };

/**
 * Double du `BroadcastOperator` de Socket.IO qui enregistre la CHAÎNE de rooms
 * ayant porté chaque emit, et non un ensemble plat : la propriété testée est
 * « au plus une copie par socket », que seul le chaînage garantit. Un double
 * qui n'enregistrerait que les rooms ne distinguerait pas un
 * `io.to(a).to(b).emit()` de deux `emit` séparés — soit précisément le défaut
 * que le chaînage évite.
 */
function makeRecordingIO(emitted: EmittedEvent[]) {
  const chain = (rooms: string[]) => ({
    to(room: string) {
      return chain([...rooms, room]);
    },
    emit(event: string, payload: any) {
      emitted.push({ rooms, event, payload });
    },
  });
  return {
    to: (room: string) => chain([room]),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  withSocket?: boolean;
  emitted?: EmittedEvent[];
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), withSocket = false, emitted = [] } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withSocket) {
    const mockIO = makeRecordingIO(emitted);
    app.decorate('socketIOHandler', {
      getManager: jest.fn(() => ({
        getIO: jest.fn(() => mockIO),
        invalidateParticipantCache: jest.fn(),
      })),
    });
  } else {
    app.decorate('socketIOHandler', null as any);
  }

  registerLeaveRoutes(app, prisma as any, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /conversations/:id/leave ───────────────────────────────────────────

describe('POST /conversations/:id/leave — not a participant', () => {
  it('returns 404 when user is not in the conversation', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        count: jest.fn<any>().mockResolvedValue(0),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /conversations/:id/leave — success as member', () => {
  it('returns 200 when member leaves successfully', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBeDefined();
    await app.close();
  });
});

describe('POST /conversations/:id/leave — creator with other members', () => {
  it("part en transférant le fil, au lieu de rendre 400 (#4058)", async () => {
    const HERITIER = 'p-heritier';
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'creator' }),
        findMany: jest.fn<any>().mockResolvedValue([
          { id: HERITIER, userId: REMAINING_USER_ID, role: 'admin', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: HERITIER }, data: { role: 'creator' } })
    );
    await app.close();
  });
});

describe('POST /conversations/:id/leave — creator alone in conversation', () => {
  it('returns 200 and deactivates conversation when creator is last member', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'creator' }),
        findMany: jest.fn<any>().mockResolvedValue([]), // no other members
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /conversations/:id/leave — audience du départ', () => {
  it('atteint les rooms PERSONNELLES des membres restants, pas seulement le fil', async () => {
    // L'effectif de la conversation est rendu sur l'écran de LISTE, dont les
    // lecteurs ont quitté la room de conversation. Adressé à la seule room, le
    // départ ne les atteignait pas : leur compteur restait faux jusqu'à un
    // rechargement complet, et le cache disque en gardait la trace.
    const emitted: EmittedEvent[] = [];
    const app = await buildApp({ withSocket: true, emitted });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(res.statusCode).toBe(200);

    const left = emitted.filter(e => e.event === 'conversation:participant-left');
    expect(left).toHaveLength(1);
    expect(left[0].rooms).toEqual([
      // La room de conversation reste en TÊTE de chaîne.
      `conversation:${RESOLVED_CONV_ID}`,
      `user:${REMAINING_USER_ID}`,
      // Le participant sans compte est nommé par son `Participant.id` : l'omettre
      // sauterait une room qui EXISTE, pas une qui n'existe pas.
      `user:${REMAINING_ANON_PARTICIPANT_ID}`,
      // Et le PARTANT ferme la chaîne. Cette room a longtemps manqué, sur
      // l'argument que « la room de conversation porte le partant lui-même,
      // encore dedans à cet instant ». Vrai de l'appareil qui a le FIL ouvert,
      // faux de tous les autres — lesquels sont précisément sur l'écran de
      // liste, donc HORS de cette room. C'est l'argument même qui a fait
      // ajouter les rooms personnelles des restants deux lignes plus haut ; il
      // n'avait été appliqué qu'à ceux dont le COMPTEUR bouge, jamais à celui
      // dont l'APPARTENANCE s'arrête.
      `user:${USER_ID}`,
    ]);
    expect(left[0].payload).toMatchObject({ conversationId: RESOLVED_CONV_ID, userId: USER_ID, displayName: 'Alice' });
    await app.close();
  });

  // Le payload porte l'effectif RESTANT, absolu. C'est ce qui rend le compteur
  // convergent : un client qui soustrait 1 ne se rattrape jamais d'un événement
  // manqué, et les deux le PERSISTENT (cache disque iOS, `staleTime: Infinity`
  // web). Ici deux membres restent — un avec compte, un sans.
  it('porte l\'effectif ABSOLU restant, pas un delta', async () => {
    const emitted: EmittedEvent[] = [];
    const app = await buildApp({ withSocket: true, emitted });
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    const left = emitted.find(e => e.event === 'conversation:participant-left');
    expect(left?.payload).toMatchObject({ memberCount: remainingParticipants.length });
    await app.close();
  });

  it('n\'adresse que les membres ACTIFS restants', async () => {
    const emitted: EmittedEvent[] = [];
    const prisma = makePrisma();
    const app = await buildApp({ withSocket: true, emitted, prisma });
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
    await app.close();
  });
});

describe('POST /conversations/:id/leave — participant lookup cache invalidation', () => {
  it('invalidates the cached participant lookup for the leaving member', async () => {
    mockInvalidateParticipantLookup.mockClear();
    const app = await buildApp();
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    expect(mockInvalidateParticipantLookup).toHaveBeenCalledWith(PART_ID, 'conv-resolved-id');
    await app.close();
  });
});

/**
 * **Le rang du créateur se lit quelle que soit sa casse** (issue #4008).
 *
 * `Participant.role` s'écrit en minuscules depuis #3875, mais la migration des
 * lignes historiques (`normalize-participant-role-casing.ts`) n'a pas encore
 * été passée en production. Les seules lignes privilégiées écrites en
 * MAJUSCULES sont celles des comptes `meeshy`/`admin` du salon global, que
 * l'ancien `InitService` posait en `CREATOR`/`ADMIN`.
 *
 * #4008 range ces lecteurs parmi les défauts « fail-closed » — un droit refusé,
 * jamais accordé à tort. **Ce site-ci est l'inverse** : la comparaison ne sert
 * pas à ACCORDER un pouvoir, elle décide d'une CONSÉQUENCE. Sur une ligne
 * `CREATOR`, l'égalité stricte ne tire pas, et le créateur du salon global
 * quitte en y laissant tous ses membres — sans transfert d'ownership ni
 * clôture.
 *
 * > Une comparaison de rôle qui échoue « fermé » quand elle autorise échoue
 * > « ouvert » quand elle interdit. Le sens de la garde décide du sens de la
 * > panne : ranger une famille entière d'un seul côté rate exactement les sites
 * > où elle est dangereuse.
 *
 * Depuis #4058, la conséquence n'est plus un refus mais un TRANSFERT — et la
 * propriété testée est la même : sur une ligne écrite `CREATOR`, la
 * conversation ne reste jamais sans créateur.
 */
describe('POST /conversations/:id/leave — le créateur reste protégé quelle que soit la casse (#4008)', () => {
  it("transmet le fil quand la ligne est écrite CREATOR, au lieu de le laisser sans créateur", async () => {
    const HERITIER = 'p-heritier-casse';
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'CREATOR' }),
        findMany: jest.fn<any>().mockResolvedValue([
          { id: HERITIER, userId: REMAINING_USER_ID, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: HERITIER }, data: { role: 'creator' } })
    );
    await app.close();
  });

  it('laisse partir un créateur écrit CREATOR resté seul, en fermant le fil', async () => {
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParticipant, role: 'CREATOR' }),
        findMany: jest.fn<any>().mockResolvedValue([]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
    const app = await buildApp({ prisma });

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
