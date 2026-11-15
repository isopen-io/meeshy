/**
 * #14490 (audit, M1) — un tête-à-tête qui NAÎT `e2ee` fait passer la PAIRE en bout
 * en bout pour la porte du talkie (`pairHasE2eeDirectConversation`) : la voix en
 * clair déjà ouverte entre les deux s'arrête à l'instant, comme à l'activation
 * par `POST /conversations/:id/encryption`. Un tête-à-tête né lisible, ou un
 * groupe, ne coupe rien.
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

jest.mock('../../../../utils/response', () => ({
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

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';

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

const cutKey = (from: string, to: string) => `talkie:cut:${from}:${to}`;

beforeEach(() => {
  jest.clearAllMocks();
  cutStore.clear();
});

describe('#14490 — un tête-à-tête né `e2ee` coupe le talkie en clair de la paire', () => {
  it('pose la coupure partagée dans les deux sens', async () => {
    const prisma = await creer({ type: 'direct', participantIds: [AUTRE], encryptionMode: 'e2ee' });

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect([...cutStore.keys()].sort()).toEqual([cutKey(MOI, AUTRE), cutKey(AUTRE, MOI)].sort());
  });

  it.each(['server', 'hybrid'] as const)('un tête-à-tête né %s ne coupe rien', async (encryptionMode) => {
    const prisma = await creer({ type: 'direct', participantIds: [AUTRE], encryptionMode });

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(cutStore.size).toBe(0);
  });

  it('un groupe ne coupe rien', async () => {
    const prisma = await creer({ type: 'group', title: 'Équipe', participantIds: [AUTRE] });

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(cutStore.size).toBe(0);
  });
});
