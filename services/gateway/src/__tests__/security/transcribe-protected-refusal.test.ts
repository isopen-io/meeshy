/**
 * #20017 — `POST /attachments/:id/transcribe` **refuse de DÉCLENCHER** une
 * transcription sur une pièce protégée.
 *
 * L'assertion qui porte ce témoin n'est pas le `403`. C'est que
 * `transcribeAttachment` **n'est pas appelée** : garder la transcription au
 * service empêche de la LIRE, cela ne défait pas qu'elle a été ÉCRITE en clair
 * dans `MessageAttachment.transcription`, colonne que les sauvegardes
 * emportent. C'est le cycle 127 — « une compensation en aval ne remplace pas
 * une garde d'admission quand l'effet qu'elle compense est IRRÉVERSIBLE » — et
 * la question qu'il prescrit : *que reste-t-il de fait que ce nettoyage ne
 * défait pas ?*
 *
 * Les trois gardes qui PRÉCÈDENT la mienne sont doublées : ce témoin isole le
 * gate de ce lot, il ne réatteste pas le contrôle d'accès, le gate E2EE ni le
 * consentement, qui ont leurs propres suites.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../services/attachments/attachmentReadVerdict', () => ({
  resolveAttachmentReadVerdict: jest.fn(async () => 'allow'),
  denyAttachmentRead: jest.fn(),
}));

jest.mock('../../services/attachments/attachmentCarrierServerReadable', () => ({
  serverReadsAttachmentCarrier: jest.fn(async () => true),
}));

jest.mock('../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: jest.fn(async () => ({ canTranscribeAudio: true })),
  })),
}));

const mockTranscribeAttachment = jest.fn<any>();
const mockGetAttachmentWithTranscription = jest.fn<any>();

import { registerTranslationRoutes } from '../../routes/attachments/translation';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const USER_ID = '507f1f77bcf86cd799439011';

const NU = { isViewOnce: false, isBlurred: false, effectFlags: 0, isEncrypted: false, encryptionMode: null };
const PORTEUR_NU = { ...NU, expiresAt: null, deletedAt: null };

/**
 * Le `findUnique` sert DEUX lecteurs : le chargement de la pièce par la route
 * (`attachmentTranslateSelect`, qui demande `mimeType`) et ma garde (qui
 * demande `message`). Le discriminant est donc le `select`, pas l'ordre.
 */
function makePrisma(piece: Record<string, unknown>, porteur: Record<string, unknown> | null) {
  return {
    messageAttachment: {
      findUnique: jest.fn<any>(async ({ select }: { select: Record<string, unknown> }) =>
        select['message']
          ? { ...piece, message: porteur }
          : { id: PIECE, messageId: MESSAGE, mimeType: 'audio/mp4', fileUrl: '/u/memo.m4a', ...piece }
      ),
    },
  } as never;
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authRequired = async (req: any) => {
    req.authContext = { isAuthenticated: true, isAnonymous: false, type: 'registered', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  const translateService = {
    transcribeAttachment: (...a: unknown[]) => mockTranscribeAttachment(...a),
    getAttachmentWithTranscription: (...a: unknown[]) => mockGetAttachmentWithTranscription(...a),
    translate: jest.fn<any>(),
  };
  // Le handler `transcribe` lit `fastify.translationService` (une DÉCORATION),
  // pas l'argument du registrar — que seul le handler `translate` consomme.
  app.decorate('translationService', translateService as never);
  await registerTranslationRoutes(app, authRequired, prisma as never, translateService as never);
  await app.ready();
  return app;
}

const poster = async (piece: Record<string, unknown>, porteur: Record<string, unknown> | null) => {
  const app = await buildApp(makePrisma(piece, porteur));
  const res = await app.inject({ method: 'POST', url: `/attachments/${PIECE}/transcribe`, payload: {} });
  await app.close();
  return res;
};

beforeEach(() => {
  mockTranscribeAttachment.mockReset();
  mockGetAttachmentWithTranscription.mockReset();
  mockTranscribeAttachment.mockResolvedValue({ taskId: 't1', attachment: { id: PIECE } });
  mockGetAttachmentWithTranscription.mockResolvedValue({ attachment: { id: PIECE }, transcription: null, translatedAudios: [] });
});

describe('POST /attachments/:id/transcribe — une pièce protégée ne se fait pas transcrire (#20017)', () => {
  it.each([
    ['la PIÈCE est à vue unique', { ...NU, isViewOnce: true }, PORTEUR_NU],
    ['la PIÈCE est floutée', { ...NU, isBlurred: true }, PORTEUR_NU],
    ['le MESSAGE est à vue unique', NU, { ...PORTEUR_NU, isViewOnce: true }],
    ['le MESSAGE est ÉPHÉMÈRE', NU, { ...PORTEUR_NU, expiresAt: new Date('2026-11-20T12:00:00.000Z') }],
    ['le MESSAGE est SUPPRIMÉ', NU, { ...PORTEUR_NU, deletedAt: new Date('2026-11-20T10:00:00.000Z') }],
  ])('refuse en 403 et NE DÉCLENCHE RIEN quand %s', async (_nom, piece, porteur) => {
    const res = await poster(piece, porteur);

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PROTECTED_NOT_TRANSCRIBABLE');
    // L'assertion qui compte : l'effet IRRÉVERSIBLE n'a pas eu lieu.
    expect(mockTranscribeAttachment).not.toHaveBeenCalled();
    // Et la branche qui RENDRAIT une transcription déjà écrite n'est pas atteinte.
    expect(mockGetAttachmentWithTranscription).not.toHaveBeenCalled();
  });

  it('laisse passer une pièce ordinaire — la garde n’est pas un interrupteur', async () => {
    const res = await poster(NU, PORTEUR_NU);

    expect(res.statusCode).toBe(200);
    expect(mockTranscribeAttachment).toHaveBeenCalledTimes(1);
  });
});
