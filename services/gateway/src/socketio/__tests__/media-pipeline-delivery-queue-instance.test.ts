/**
 * #18616 — le pipeline MÉDIA enfile dans la file du PROCESSUS, pas dans la sienne.
 *
 * `server.ts` déclare, à l'endroit exact où l'on irait vérifier, que l'instance
 * qu'il construit et enregistre est « la seule dont la tranche MÉMOIRE porte
 * des entrées de message », et le registre le redit. L'affirmation était
 * fausse : `MeeshySocketIOHandler.startMediaPipelines` construisait une SECONDE
 * `RedisDeliveryQueue` et la remettait aux quatre déclencheurs de
 * `message:attachment-updated`.
 *
 * Ce que la seconde instance coûtait est invisible au code qui l'employait — la
 * tranche REDIS est partagée, donc le cas nominal marche. Ce témoin part donc
 * du cas qui ne marchait PAS : la tranche MÉMOIRE, celle qu'emprunte toute
 * entrée écrite pendant un hoquet Redis, et que ni le drain, ni la purge, ni le
 * balayage de TTL n'atteignaient sur cette instance-là.
 *
 * **Il part du déclencheur MÉDIA, jamais du transport d'envoi** : c'est le
 * chemin dont la tranche n'était pas purgée, et un témoin posé sur l'envoi
 * serait vert des deux côtés du correctif.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

// ─── Mocks (hoistés) ─────────────────────────────────────────────────────────

const managerStub = {
  initialize: jest.fn<any>().mockResolvedValue(undefined),
  getIO: jest.fn<any>().mockReturnValue({ to: () => ({ emit: () => true }) }),
  getReachability: jest.fn<any>().mockReturnValue(new Map()),
  getSocialEventsHandler: jest.fn<any>().mockReturnValue(null),
};

jest.mock('../MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn().mockImplementation(() => managerStub),
}));

jest.mock('../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  requireAdmin: jest.fn<any>(async () => undefined),
}));

/**
 * On CAPTURE les dépendances que `startMediaPipelines` compose, plutôt que de
 * les reconstruire : reconstruire le littéral dans le témoin, c'est tester une
 * copie — et aucune assertion portée par une copie ne peut rougir quand la
 * production change.
 */
const capturedMediaDeps: Array<Record<string, unknown>> = [];
jest.mock('../../services/attachments/media-processing/ready-listener', () => ({
  startMediaReadyListener: jest.fn<any>((deps: Record<string, unknown>) => {
    capturedMediaDeps.push(deps);
    return { close: async () => undefined };
  }),
  mediaReadyPorts: jest.fn<any>((deps: Record<string, unknown>) => {
    capturedMediaDeps.push(deps);
    return { loadMessageAttachment: async () => null, emitAttachmentUpdated: async () => undefined };
  }),
}));

jest.mock('../../services/attachments/MessageAttachmentAltTranslationService', () => ({
  MessageAttachmentAltTranslationService: { init: jest.fn() },
}));

// ─── Import après les mocks ──────────────────────────────────────────────────

import { MeeshySocketIOHandler } from '../MeeshySocketIOHandler';
import { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';
import {
  getSharedDeliveryQueue,
  setSharedDeliveryQueue,
} from '../../services/delivery-queue-registry';

/** Aucun Redis : tout atterrit dans la tranche MÉMOIRE, celle qui est par instance. */
const memoryOnlyCacheStore = { getNativeClient: () => null } as never;

const MESSAGE_ID = '507f1f77bcf86cd799439011';

function queuedTranscription() {
  return {
    messageId: MESSAGE_ID,
    conversationId: '507f1f77bcf86cd799439012',
    eventType: 'attachment-updated' as const,
    enqueuedAt: new Date().toISOString(),
    payload: {
      conversationId: '507f1f77bcf86cd799439012',
      messageId: MESSAGE_ID,
      attachment: { id: 'att-1', transcription: 'le secret dit à voix haute' },
    },
  } as never;
}

async function wireMediaPipelines(): Promise<Record<string, unknown>> {
  capturedMediaDeps.length = 0;

  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('authenticate', async (_req: FastifyRequest, _rep: FastifyReply) => undefined);

  const handler = new MeeshySocketIOHandler(
    {} as never,
    // Le client ZMQ non nul est la garde de `startMediaPipelines` : c'est l'état
    // de PRODUCTION dès que le translator est joignable.
    { getZmqClient: () => ({}) } as never,
  );
  await handler.setupSocketIO(app);
  await app.close();

  const deps = capturedMediaDeps[0];
  expect(deps).toBeDefined();
  return deps as Record<string, unknown>;
}

describe('#18616 — le pipeline média partage la file du processus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSharedDeliveryQueue(undefined);
  });

  it("une transcription enfilée par le pipeline média est PURGEABLE par le site de destruction", async () => {
    const processQueue = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(processQueue);

    const deps = await wireMediaPipelines();
    const mediaQueue = deps.deliveryQueue as { enqueue(userId: string, entry: never): Promise<void> };
    await mediaQueue.enqueue('reader-1', queuedTranscription());

    // Le site de destruction (`applyMessageRemovalEffects`, la purge de vue
    // unique) ne connaît que le REGISTRE : c'est sa seule façon d'atteindre la
    // file, et c'est exactement ce que la seconde instance lui cachait.
    const purger = getSharedDeliveryQueue();
    expect(purger).toBeDefined();
    await expect(purger!.purgeMessage(MESSAGE_ID)).resolves.toBeGreaterThan(0);
  });

  it("le pipeline média ne tient PAS une file à lui", async () => {
    const processQueue = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(processQueue);

    const deps = await wireMediaPipelines();

    expect(deps.deliveryQueue).toBe(processQueue);
  });

  /**
   * La résolution est PAR USAGE, pas une capture au câblage.
   *
   * En production l'enregistrement précède le câblage (constructeur de
   * `server.ts`, puis `start()` → `setupSocketIO`) — et c'est précisément
   * pourquoi une capture unique passerait tous les autres témoins de ce
   * fichier. Un ordre d'initialisation n'est pas une propriété qu'on puisse
   * relire depuis le pipeline média : capturer `undefined` une fois le
   * figerait hors de la file pour toute la vie du processus, en silence.
   */
  it('la file se résout à l’ENFILAGE, même enregistrée après le câblage', async () => {
    const deps = await wireMediaPipelines();
    expect(deps.deliveryQueue ?? null).toBeNull();

    const processQueue = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(processQueue);

    expect(deps.deliveryQueue).toBe(processQueue);
  });

  /**
   * Le registre VIDE est l'état d'un processus sans file (témoin, script,
   * outil). Le pipeline média doit s'y taire — jamais s'en fabriquer une, ce
   * qui recréerait la tranche orpheline sous un autre nom.
   */
  it('sans file enregistrée, le pipeline média n’en construit pas une', async () => {
    const deps = await wireMediaPipelines();

    expect(deps.deliveryQueue ?? null).toBeNull();
  });
});
