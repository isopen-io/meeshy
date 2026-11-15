/**
 * `POST /links/:identifier/messages` — un invité anonyme n'écrit JAMAIS de
 * clair dans une conversation chiffrée de bout en bout (#9224, #11216).
 *
 * Ce transport CONTOURNE `MessagingService.handleMessage` (et donc la garde de
 * `MessageProcessor.saveMessage`) : il écrit `prisma.message.create` lui-même.
 * Sans sa propre lecture du régime, le lien de partage restait la porte par
 * laquelle un texte lisible entrait dans une conversation chiffrée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';

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
import { E2EE_PLAINTEXT_REFUSED } from '../../../services/messaging/e2eePlaintextAdmission';

/** Le double PROJETTE : une colonne non réclamée par le `select` n'existe pas. */
const projectConversation = (args: any, conversation: Record<string, unknown>) => {
  const select = args?.include?.conversation?.select ?? args?.select?.conversation?.select;
  if (!select) return undefined;
  return Object.fromEntries(
    Object.keys(select).filter((k) => select[k]).map((k) => [k, conversation[k]])
  );
};

const ALIVE = { type: 'group', isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: null };

const appIn = async (regime: Record<string, unknown>) => {
  const prisma = makePrisma();
  prisma.conversationShareLink.findUnique = jest.fn<any>()
    .mockImplementationOnce(async () => mockShareLink)
    .mockImplementationOnce(async (args: any) => ({
      ...mockParticipantShareLink,
      conversation: projectConversation(args, { ...ALIVE, ...regime }),
    }));
  return { prisma, app: await buildApp({ prisma }) };
};

describe('POST /links/:id/messages — anonymous: conversation chiffrée de bout en bout', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it('refuse le clair avec 400 E2EE_PLAINTEXT_REFUSED et n’écrit rien', async () => {
    const built = await appIn({ encryptionMode: 'e2ee' });
    app = built.app;
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: E2EE_PLAINTEXT_REFUSED });
    expect(built.prisma.message.create).not.toHaveBeenCalled();
  });

  it('une conversation en clair reste ouverte à l’invité', async () => {
    const built = await appIn({ encryptionMode: null });
    app = built.app;
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(built.prisma.message.create).toHaveBeenCalledTimes(1);
  });
});
