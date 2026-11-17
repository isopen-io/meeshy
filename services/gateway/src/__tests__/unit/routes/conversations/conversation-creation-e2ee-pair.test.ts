/**
 * Audit de #19080, E1 (#16188) — le recensement PAR EFFET des écritures qui
 * rendent un membre actif a trouvé une porte que le recensement par appel ne
 * voyait pas : la CRÉATION. `POST /conversations` faisait naître un
 * tête-à-tête `e2ee` avec autant d'invités qu'on lui en donnait — trois
 * membres actifs, ou le créateur seul. La règle de la paire (#12966) vaut à la
 * naissance comme à l'activation : un tête-à-tête ne naît chiffré de bout en
 * bout qu'entre son créateur et UN invité, sinon `409 E2EE_DIRECT_NOT_A_PAIR`,
 * rien d'écrit. Les modes que le serveur lit gardent leur comportement.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const cutStore = new Map<string, string>();

jest.mock('../../../../services/talkie/talkieCut', () => ({
  ...jest.requireActual<object>('../../../../services/talkie/talkieCut'),
  talkieCutDepsOf: () => ({
    cache: {
      get: async (key: string) => cutStore.get(key) ?? null,
      set: async (key: string, value: string) => { cutStore.set(key, value); return true; },
    },
    relay: null,
    now: () => Date.parse('2026-11-13T10:00:00Z'),
  }),
}));

// #14107 — la boîte de demandes a ses propres témoins (`messageRequests.test.ts`) : ici, tout membre entre directement.
jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

// Directive porteur du 2026-11-01 : une conversation naît chiffrée au repos,
// sous une clé obtenue avant sa création.
jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

const sent: { status?: number; body?: Record<string, unknown> } = {};

jest.mock('../../../../utils/response', () => ({
  sendError: jest.fn<any>((reply: any, status: number, message: string, extra: Record<string, unknown>) => {
    sent.status = status;
    sent.body = { success: false, error: message, ...extra };
    return reply;
  }),
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({
    recordEvent: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';
const TIERS = '507f1f77bcf86cd799439044';

function prismaDouble() {
  return {
    community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'Équipe', createdAt: new Date(), participants: [],
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      // Rend ce que le `select` DEMANDE (#9711) : un double qui rendrait les
      // colonnes du Prisme d'office passerait au vert sur une requête qui ne
      // les ramène pas.
      findMany: jest.fn<any>(async (args: any) =>
        [
          { id: MOI, displayName: 'Moi', username: 'moi', avatar: null, systemLanguage: 'de', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
          { id: AUTRE, displayName: 'Alice', username: 'alice', avatar: null, systemLanguage: '', regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: null },
        ].map((ligne: Record<string, unknown>) =>
          args?.select
            ? Object.fromEntries(Object.keys(args.select).filter((k) => args.select[k]).map((k) => [k, ligne[k]]))
            : ligne
        )
      ),
    },
  };
}

function replyDouble() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    header: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

async function creer(body: Record<string, unknown>, role = 'ANALYST') {
  const prisma = { ...prismaDouble() } as ReturnType<typeof prismaDouble> & { user: Record<string, unknown> };
  prisma.user = { ...prisma.user, findFirst: jest.fn<any>().mockResolvedValue(null) };
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());
  await handler(
    {
      body, params: {}, query: {}, headers: {},
      authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI, role } },
      user: { userId: MOI },
    },
    replyDouble(),
  );
  return prisma;
}

beforeEach(() => {
  jest.clearAllMocks();
  cutStore.clear();
  delete sent.status;
  delete sent.body;
});

describe('un tête-à-tête ne NAÎT chiffré de bout en bout qu’entre deux membres (#12966, audit #19080 E1)', () => {
  it('deux invités : 409 E2EE_DIRECT_NOT_A_PAIR, aucune conversation créée', async () => {
    const prisma = await creer({ type: 'direct', participantIds: [AUTRE, TIERS], encryptionMode: 'e2ee' });

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ code: E2EE_ERROR_CODES.DIRECT_NOT_A_PAIR });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('aucun invité : 409 E2EE_DIRECT_NOT_A_PAIR, aucune conversation créée', async () => {
    const prisma = await creer({ type: 'direct', participantIds: [], encryptionMode: 'e2ee' });

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ code: E2EE_ERROR_CODES.DIRECT_NOT_A_PAIR });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('un invité en double compte pour un : la paire naît (contrôle)', async () => {
    const prisma = await creer({ type: 'direct', participantIds: [AUTRE, AUTRE], encryptionMode: 'e2ee' });

    expect(sent.status).toBeUndefined();
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it.each(['server', 'hybrid'] as const)('un tête-à-tête %s à deux invités naît comme avant (contrôle)', async (encryptionMode) => {
    const prisma = await creer({ type: 'direct', participantIds: [AUTRE, TIERS], encryptionMode });

    expect(sent.status).toBeUndefined();
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});
