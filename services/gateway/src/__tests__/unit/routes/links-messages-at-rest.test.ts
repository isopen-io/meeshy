/**
 * `POST /links/:identifier/messages` — un invité anonyme qui écrit dans une
 * conversation `server` / `hybrid` y est chiffré AU REPOS comme tout le monde
 * (#11381). Ce transport contourne `MessageProcessor.saveMessage` : sans sa
 * propre écriture scellée, le lien de partage rangeait le texte EN CLAIR
 * dans une conversation que ses membres croient chiffrée sur le serveur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach, beforeEach, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks — hissés au sommet de CE module, donc déclarés ici ────────────────

jest.mock('../../../utils/logger', () => require('./links-messages.harness').loggerModule());
jest.mock('../../../utils/session-token', () => require('./links-messages.harness').sessionTokenModule());
jest.mock('../../../services/TrackingLinkService', () =>
  require('./links-messages.harness').trackingLinkServiceModule()
);
jest.mock('../../../middleware/auth', () => require('./links-messages.harness').authModule());
jest.mock('@meeshy/shared/types/api-schemas', () => require('./links-messages.harness').apiSchemasModule());
jest.mock('@meeshy/shared/types/socketio-events', () =>
  require('./links-messages.harness').socketioEventsModule()
);
jest.mock('../../../services/ConversationStatsService', () =>
  require('./links-messages.harness').conversationStatsModule()
);
jest.mock('../../../routes/links/types', () =>
  require('./links-messages.harness').linkTypesModule(
    jest.requireActual('../../../routes/links/types') as Record<string, unknown>
  )
);

jest.mock('../../../services/EncryptionService', () => {
  const actual = jest.requireActual('../../../services/EncryptionService') as typeof import('../../../services/EncryptionService');
  return { ...actual, getEncryptionService: jest.fn(async (prisma: PrismaClient) => new actual.EncryptionService(prisma)) };
});

// ─── Import après les mocks ──────────────────────────────────────────────────

import {
  MSHY_ID,
  mockShareLink,
  mockParticipantShareLink,
  makePrisma,
  buildApp,
  VALID_BODY,
  ANON_HEADERS,
} from './links-messages.harness';
import { EncryptionService } from '../../../services/EncryptionService';
import { revealAtRest, SERVER_AT_REST_UNAVAILABLE } from '../../../services/messaging/serverAtRest';

const SECRET = 'Rendez-vous porte B, code 4471';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 13).toString('base64');
});

const projectConversation = (args: any, conversation: Record<string, unknown>) => {
  const select = args?.include?.conversation?.select ?? args?.select?.conversation?.select;
  if (!select) return undefined;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, conversation[k]]));
};

const ALIVE = { type: 'group', isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: null };

const appIn = async (regime: Record<string, unknown>) => {
  const prisma = makePrisma();
  const keys = new Map<string, Record<string, unknown>>();
  Object.assign(prisma, {
    serverEncryptionKey: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { keys.set(String(data.id), data); return data; }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null),
      findMany: jest.fn(async () => [...keys.values()]),
      update: jest.fn(async () => ({})),
    },
  });
  prisma.conversationShareLink.findUnique = jest.fn<any>()
    .mockImplementationOnce(async () => mockShareLink)
    .mockImplementationOnce(async (args: any) => ({
      ...mockParticipantShareLink,
      conversation: projectConversation(args, { ...ALIVE, ...regime }),
    }));
  return { prisma, app: await buildApp({ prisma }) };
};

const send = (app: FastifyInstance) => app.inject({
  method: 'POST', url: `/links/${MSHY_ID}/messages`,
  headers: ANON_HEADERS, payload: { ...VALID_BODY, content: SECRET },
});

describe.each(['server', 'hybrid'])('POST /links/:id/messages — conversation %s', (mode) => {
  const regime = { encryptionMode: mode, encryptionEnabledAt: new Date(), serverEncryptionKeyId: null };
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it('la base ne reçoit que le chiffré, et un membre le relit en clair', async () => {
    const built = await appIn(regime);
    app = built.app;
    const res = await send(app);

    expect(res.statusCode).toBe(201);
    const data = (built.prisma.message.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data).toMatchObject({ content: '', isEncrypted: true, encryptionMode: mode });
    expect(JSON.stringify(data)).not.toContain('4471');
    const reader = new EncryptionService(built.prisma as unknown as PrismaClient);
    const reread = await revealAtRest({ id: 'm', conversationId: data.conversationId, ...data }, reader);
    expect(reread.content).toBe(SECRET);
  });

  it('l’invité reçoit son texte en clair, comme un message non chiffré', async () => {
    const built = await appIn(regime);
    app = built.app;
    const res = await send(app);
    expect(res.json().data.message).toMatchObject({ content: SECRET });
  });

  it('sans clé maîtresse, l’envoi est refusé (503) et rien n’est écrit', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    const built = await appIn(regime);
    app = built.app;
    const res = await send(app);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ success: false, code: SERVER_AT_REST_UNAVAILABLE });
    expect(built.prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — conversation non chiffrée', () => {
  it('le texte s’écrit tel quel', async () => {
    const built = await appIn({ encryptionMode: null, encryptionEnabledAt: null });
    const res = await send(built.app);
    await built.app.close();
    expect(res.statusCode).toBe(201);
    expect((built.prisma.message.create as jest.Mock<any>).mock.calls[0][0].data.content).toBe(SECRET);
  });
});
