/**
 * #10726 — LA PASSERELLE NE TRANSCRIT NI NE TRADUIT UN VOCAL QU'ELLE NE LIT PAS.
 *
 * Le web et iOS n'offrent plus « Transcrire » pour un vocal d'une conversation
 * chiffrée de bout en bout (#10700) ; la route, elle, lançait Whisper sur le
 * fichier pour tout appelant qui la frappe directement. Même règle que la
 * traduction partagée (`sharedTranslationServerReadsMessage`) : mode de la
 * conversation ET du message, fail-closed sur une lecture qui ne conclut pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: async () => ({ canTranscribeAudio: true, canTranslateAudio: true, canUseVoiceCloning: true }),
  })),
}));

let mockVerdict: 'allow' | 'forbidden' = 'allow';
jest.mock('../../../../services/attachments/attachmentReadVerdict', () => ({
  ...jest.requireActual<object>('../../../../services/attachments/attachmentReadVerdict'),
  resolveAttachmentReadVerdict: async () => mockVerdict,
}));

import { registerTranslationRoutes } from '../../../../routes/attachments/translation';

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-e2ee';
const MESSAGE_ID = '6ad16c1d42e6a5137b40af18';

type Carrier = { isEncrypted: boolean; encryptionMode: string | null; conversation: { encryptionMode: string | null } } | null;

const carrierOf = (conversationMode: string | null, messageMode: string | null, isEncrypted: boolean): Carrier => ({
  isEncrypted,
  encryptionMode: messageMode,
  conversation: { encryptionMode: conversationMode },
});

function makePrisma(carrier: Carrier | Error) {
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: ATTACHMENT_ID,
        messageId: MESSAGE_ID,
        mimeType: 'audio/mp4',
        uploadedBy: 'someone-else',
        message: { id: MESSAGE_ID, conversationId: 'c1' },
      }),
    },
    message: {
      findUnique: carrier instanceof Error ? jest.fn<any>().mockRejectedValue(carrier) : jest.fn<any>().mockResolvedValue(carrier),
    },
  } as any;
}

function makeServices() {
  const translationService = {
    getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({ attachment: { id: ATTACHMENT_ID }, transcription: null, translatedAudios: [] }),
    transcribeAttachment: jest.fn<any>().mockResolvedValue({ taskId: 'task-1', attachment: { id: ATTACHMENT_ID } }),
  };
  const translateService = {
    translate: jest.fn<any>().mockResolvedValue({ success: true, data: { status: 'processing', translations: [] } }),
  };
  return { translationService, translateService };
}

async function buildApp(carrier: Carrier | Error): Promise<{ app: FastifyInstance; services: ReturnType<typeof makeServices> }> {
  const prisma = makePrisma(carrier);
  const services = makeServices();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('translationService', services.translationService as any);
  const authRequired = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
  };
  await registerTranslationRoutes(app, authRequired, prisma, services.translateService as any);
  await app.ready();
  return { app, services };
}

const transcribe = (app: FastifyInstance) => app.inject({ method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`, payload: {} });
const translate = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`, payload: { targetLanguages: ['en'] } });

describe('POST /attachments/:id/transcribe — un vocal que le serveur ne lit pas (#10726)', () => {
  it('refuse en 403 typé dans une conversation chiffrée de bout en bout, sans lancer Whisper', async () => {
    const { app, services } = await buildApp(carrierOf('e2ee', 'e2ee', true));

    const res = await transcribe(app);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_NOT_TRANSCRIBABLE' });
    expect(services.translationService.transcribeAttachment).not.toHaveBeenCalled();
    expect(services.translationService.getAttachmentWithTranscription).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse aussi un message chiffré SANS mode déclaré dans une conversation au mode inconnu', async () => {
    const { app, services } = await buildApp(carrierOf(null, null, true));

    const res = await transcribe(app);

    expect(res.statusCode).toBe(403);
    expect(services.translationService.transcribeAttachment).not.toHaveBeenCalled();
    await app.close();
  });

  it('fail-closed : un message porteur introuvable ou une lecture qui lève ne transcrivent rien', async () => {
    for (const carrier of [null, new Error('replica lag')] as const) {
      const { app, services } = await buildApp(carrier);

      const res = await transcribe(app);

      expect(res.statusCode).toBe(403);
      expect(services.translationService.transcribeAttachment).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('transcrit toujours un vocal en clair, ou chiffré PAR le serveur', async () => {
    for (const carrier of [carrierOf(null, null, false), carrierOf('server', 'server', true), carrierOf('hybrid', null, false)]) {
      const { app, services } = await buildApp(carrier);

      const res = await transcribe(app);

      expect(res.statusCode).toBe(200);
      expect(services.translationService.transcribeAttachment).toHaveBeenCalledTimes(1);
      await app.close();
    }
  });
});

describe('POST /attachments/:id/translate — même garde (#10726)', () => {
  it('refuse en 403 typé la traduction d’un vocal chiffré de bout en bout, sans appeler le service', async () => {
    const { app, services } = await buildApp(carrierOf('e2ee', 'e2ee', true));

    const res = await translate(app);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_NOT_TRANSLATABLE' });
    expect(services.translateService.translate).not.toHaveBeenCalled();
    await app.close();
  });

  it('traduit toujours un vocal que le serveur lit', async () => {
    const { app, services } = await buildApp(carrierOf(null, null, false));

    const res = await translate(app);

    expect(res.statusCode).toBe(200);
    expect(services.translateService.translate).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('un appelant sans accès n’apprend rien du chiffrement (#10726)', () => {
  it.each([
    ['translate', translate],
    ['transcribe', transcribe],
  ] as const)('%s : le refus d’accès précède la lecture du mode, même réponse en clair ou chiffré', async (_route, call) => {
    mockVerdict = 'forbidden';
    try {
      const bodies: string[] = [];
      for (const carrier of [carrierOf('e2ee', 'e2ee', true), carrierOf(null, null, false)]) {
        const { app, services } = await buildApp(carrier);
        const res = await call(app);
        expect(res.statusCode).toBe(403);
        expect(String(res.json().code ?? '')).not.toMatch(/^E2EE_/);
        expect(services.translateService.translate).not.toHaveBeenCalled();
        expect(services.translationService.transcribeAttachment).not.toHaveBeenCalled();
        bodies.push(res.body);
        await app.close();
      }
      expect(bodies[0]).toBe(bodies[1]);
    } finally {
      mockVerdict = 'allow';
    }
  });
});
