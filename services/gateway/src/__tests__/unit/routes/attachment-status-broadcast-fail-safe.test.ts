/**
 * `POST /attachments/:attachmentId/status` — une lecture de préférences en
 * échec ne fait plus DISPARAÎTRE l'événement (#4530).
 *
 * ## Ce que ces témoins mesurent
 *
 * Le `try` qui entoure la diffusion n'entourait au départ que l'émission ;
 * `85494dee00` y a fait entrer une LECTURE DE BASE — la réciprocité
 * `showReadReceipts`, qui choisit la room. Le `catch` couvrait donc un appel
 * qui tombe pour des raisons ORDINAIRES (base indisponible, coupe-circuit,
 * timeout), et la route rendait `200` sans que RIEN ne parte : ni aux autres
 * participants, ni aux propres appareils de celui qui venait d'écouter.
 *
 * D'où la forme des assertions : le statut HTTP n'est JAMAIS la preuve. Chaque
 * témoin assère le TRIPLET — le nom de l'événement, la room visée, et la charge
 * — parce qu'une adresse juste ne dit rien de ce qui y arrive, et qu'un 200 ne
 * dit rien de ce qui est parti.
 *
 * ## Pourquoi l'échec est injecté DANS le prisma, et nulle part ailleurs
 *
 * `prisma.userPreferences.findMany` est la PREMIÈRE requête de
 * `loadStoredPrivacyPreferences`, sous `loadPrivacyPreferencesCached`. La faire
 * lever reproduit exactement l'incident visé, sans doubler aucun module et sans
 * rien casser d'autre : un double qui lèverait sur TOUT ne prouverait que la
 * survie à un harnais mort. Le cache de module étant partagé, chaque témoin le
 * vide d'abord — sinon une entrée chaude sauterait la requête qu'on veut voir
 * tomber.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ── Le journal : les DEUX causes doivent rester distinguables ────────────────
const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../../utils/logger-enhanced') as Record<string, unknown>;
  const spy: Record<string, unknown> = {};
  Object.assign(spy, {
    error: (...args: unknown[]) => mockLogError(...args),
    warn: (...args: unknown[]) => mockLogWarn(...args),
    info: jest.fn(),
    debug: jest.fn(),
    child: () => spy,
  });
  return { ...actual, enhancedLogger: spy };
});

// L'ÉCRITURE réussit — c'est toute la question : l'événement disparaissait
// derrière un marquage réellement enregistré. Le module est PROLONGÉ, jamais
// remplacé par une liste écrite à la main.
const mockMarkAudioAsListened = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
jest.mock('../../../services/MessageReadStatusService', () => {
  const actual = jest.requireActual('../../../services/MessageReadStatusService') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    MessageReadStatusService: jest.fn().mockImplementation(() => ({
      markAudioAsListened: (...args: unknown[]) => mockMarkAudioAsListened(...args),
    })),
  };
});

import { registerMessagesWriteRoutes } from '../../../routes/messages-writes';
import type { MessagesRouteDeps } from '../../../routes/messages-shared';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const USER_ID = '507f1f77bcf86cd799439001';
const PARTICIPANT_ID = '507f1f77bcf86cd799439002';
const CONVERSATION_ID = '507f1f77bcf86cd799439003';
const MESSAGE_ID = '507f1f77bcf86cd799439004';
const ATTACHMENT_ID = '507f1f77bcf86cd799439005';

const attachmentRow = {
  id: ATTACHMENT_ID,
  messageId: MESSAGE_ID,
  message: {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    conversation: { participants: [{ id: PARTICIPANT_ID, userId: USER_ID }] },
  },
};

type PreferenceRead = () => Promise<ReadonlyArray<{ userId: string; privacy: unknown }>>;

function makeSocketDouble() {
  const emit = jest.fn();
  const to = jest.fn((_room: string) => ({ emit }));
  return {
    emit,
    to,
    manager: { getIO: () => ({ to }) },
  };
}

async function buildApp(options: {
  readonly readPreferences: PreferenceRead;
  readonly socket?: ReturnType<typeof makeSocketDouble>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const prisma = {
    messageAttachment: {
      findFirst: jest.fn<() => Promise<typeof attachmentRow>>().mockResolvedValue(attachmentRow),
    },
    userPreferences: { findMany: jest.fn(options.readPreferences) },
    // Second temps du résolveur, pour les utilisateurs sans document.
    userPreference: { findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]) },
  };

  // Les deux collaborateurs que la surface ÉCRITURE construit pour ses AUTRES
  // routes (édition, suppression) : `POST /attachments/:id/status` n'en touche
  // aucun, d'où des doubles vides plutôt qu'un montage de tout le plugin.
  const deps = {
    prisma,
    requiredAuth: async (request: { authContext?: unknown }) => {
      request.authContext = {
        type: 'registered',
        userId: USER_ID,
        isAuthenticated: true,
        hasFullAccess: true,
      };
    },
    attachmentService: {},
    translationService: undefined,
    socketIOHandler: { getManager: () => options.socket?.manager ?? null },
    trackingLinkService: {},
  } as unknown as MessagesRouteDeps;

  registerMessagesWriteRoutes(app, deps);
  await app.ready();
  return app;
}

const marquerEcoute = (app: FastifyInstance) =>
  app.inject({
    method: 'POST',
    url: `/attachments/${ATTACHMENT_ID}/status`,
    payload: { action: 'listened', playPositionMs: 30_000, durationMs: 60_000, complete: false },
  });

const chargeAttendue = {
  attachmentId: ATTACHMENT_ID,
  messageId: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  action: 'listened',
  playPositionMs: 30_000,
  durationMs: 60_000,
  percentage: 50,
};

describe('POST /attachments/:attachmentId/status — la diffusion survit à une lecture de préférences en échec (#4530)', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    clearPrivacyPreferencesCache();
  });

  it('préférences ILLISIBLES ⇒ la room RESTRICTIVE reçoit quand même l\'événement, avec sa charge', async () => {
    const socket = makeSocketDouble();
    app = await buildApp({
      readPreferences: () => Promise.reject(new Error('base indisponible')),
      socket,
    });

    const res = await marquerEcoute(app);

    // Le marquage a bien eu lieu : c'est l'événement qui manquait derrière.
    expect(mockMarkAudioAsListened).toHaveBeenCalledTimes(1);
    // (b) la room — la personnelle, jamais celle de la conversation : un
    // incident n'élargit pas une audience.
    expect(socket.to).toHaveBeenCalledWith(ROOMS.user(USER_ID));
    expect(socket.to).not.toHaveBeenCalledWith(ROOMS.conversation(CONVERSATION_ID));
    // (a) le nom de l'événement et (c) la charge — une adresse juste ne dit
    // rien de ce qui y arrive.
    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED,
      expect.objectContaining(chargeAttendue)
    );
    expect(res.statusCode).toBe(200);
  });

  it('sépare les causes : la trace nomme la LECTURE, pas le transport', async () => {
    const socket = makeSocketDouble();
    app = await buildApp({
      readPreferences: () => Promise.reject(new Error('base indisponible')),
      socket,
    });

    await marquerEcoute(app);

    const traces = [...mockLogError.mock.calls, ...mockLogWarn.mock.calls].map(
      ([message]) => String(message)
    );
    expect(traces.some((m) => /préférences/i.test(m) && /repli/i.test(m))).toBe(true);
    expect(traces.some((m) => /transport/i.test(m))).toBe(false);
  });

  it('transport en échec ⇒ la trace nomme le TRANSPORT, et la route rend quand même 200', async () => {
    const socket = makeSocketDouble();
    socket.emit.mockImplementation(() => {
      throw new Error('socket mort');
    });
    app = await buildApp({
      readPreferences: () => Promise.resolve([]),
      socket,
    });

    const res = await marquerEcoute(app);

    expect(res.statusCode).toBe(200);
    const traces = mockLogError.mock.calls.map(([message]) => String(message));
    expect(traces.some((m) => /transport/i.test(m))).toBe(true);
    expect(traces.some((m) => /repli/i.test(m))).toBe(false);
  });

  it('non-régression — préférences LUES et permissives ⇒ toute la conversation', async () => {
    const socket = makeSocketDouble();
    app = await buildApp({ readPreferences: () => Promise.resolve([]), socket });

    await marquerEcoute(app);

    expect(socket.to).toHaveBeenCalledWith(ROOMS.conversation(CONVERSATION_ID));
    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED,
      expect.objectContaining(chargeAttendue)
    );
  });

  it('non-régression — opt-out LU ⇒ la room personnelle, comme le repli mais pour une autre raison', async () => {
    const socket = makeSocketDouble();
    app = await buildApp({
      readPreferences: () =>
        Promise.resolve([{ userId: USER_ID, privacy: { showReadReceipts: false } }]),
      socket,
    });

    await marquerEcoute(app);

    expect(socket.to).toHaveBeenCalledWith(ROOMS.user(USER_ID));
    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED,
      expect.objectContaining(chargeAttendue)
    );
    // Une préférence LUE n'est pas un repli : aucune trace de dégradation.
    const traces = mockLogWarn.mock.calls.concat(mockLogError.mock.calls).map(([m]) => String(m));
    expect(traces.some((m) => /repli/i.test(m))).toBe(false);
  });
});
