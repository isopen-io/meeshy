/**
 * #11329 — `GET /attachments/:attachmentId/subtitles/:lang` sert la
 * transcription d'une vidéo ou d'un vocal en WebVTT, dans la langue du
 * LECTEUR. `auto` descend son prisme rang par rang (Prisme, `/CLAUDE.md`) ;
 * un code nomme une langue précise.
 *
 * La route porte les MÊMES bornes que la fiche de la pièce
 * (`/attachments/:id/metadata`, #4923) et, en plus, se tait sur une pièce
 * PROTÉGÉE — vue unique, floutée, éphémère, chiffrée : sa transcription ne
 * voyage pas à côté du média qu'on a caché. Le refus est le même 404 qu'une
 * pièce inexistante, sans oracle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: jest.fn<any>().mockResolvedValue(null),
  })),
}));

import { registerMetadataRoutes } from '../../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439001';
const UPLOADER_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd799439010';
const MESSAGE_ID = '507f1f77bcf86cd799439030';
const ATTACHMENT_ID = '507f1f77bcf86cd799439040';
const PARTICIPANT_ID = '507f1f77bcf86cd799439050';

const VOICE_NOTE = {
  id: ATTACHMENT_ID,
  messageId: MESSAGE_ID,
  uploadedBy: UPLOADER_ID,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isEncrypted: false,
  encryptionMode: null,
  transcription: {
    text: 'Bonjour à tous. On se retrouve demain.',
    language: 'fr',
    durationMs: 4000,
    segments: [
      { text: 'Bonjour à tous.', startMs: 0, endMs: 1500 },
      { text: 'On se retrouve demain.', startMs: 1600, endMs: 3900 },
    ],
  },
  translations: {
    en: { type: 'audio', transcription: 'Hello everyone. See you tomorrow.', createdAt: '2026-10-23' },
    es: { type: 'audio', transcription: 'Hola a todos. Nos vemos mañana.', createdAt: '2026-10-23' },
  },
};

const LIVE_MESSAGE = {
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  deletedAt: null,
  expiresAt: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isEncrypted: false,
  encryptionMode: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
};

const PARTICIPANT_ROW = {
  id: PARTICIPANT_ID,
  conversationId: CONV_ID,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  language: 'es',
  user: { role: 'USER' },
};

type Fixture = {
  readonly attachment?: unknown;
  readonly message?: unknown;
  readonly participant?: unknown;
  readonly reader?: unknown;
};

const registered = { isAuthenticated: true, isAnonymous: false, type: 'registered', userId: USER_ID } as const;
const anonymous = { isAuthenticated: true, isAnonymous: true, type: 'anonymous', userId: 'session', participantId: PARTICIPANT_ID } as const;

function buildApp(authContext: unknown, fixture: Fixture = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const participant = 'participant' in fixture ? fixture.participant : PARTICIPANT_ROW;
  const prisma = {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue('attachment' in fixture ? fixture.attachment : VOICE_NOTE),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue('message' in fixture ? fixture.message : LIVE_MESSAGE),
      findFirst: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(participant),
      findUnique: jest.fn<any>().mockResolvedValue(participant),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue('reader' in fixture
        ? fixture.reader
        : { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }),
    },
    messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
  registerMetadataRoutes(app, async (req: any) => {
    if (authContext) req.authContext = authContext;
  }, prisma as any);
  return app;
}

async function subtitles(app: ReturnType<typeof buildApp>, lang: string) {
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/subtitles/${lang}` });
  await app.close();
  return res;
}

describe('#11329 — la langue du lecteur, rang par rang', () => {
  it('auto : rang 1 sans traduction, rang 2 traduit ⇒ le rang 2, jamais la première traduction venue', async () => {
    const res = await subtitles(buildApp(registered, {
      reader: { systemLanguage: 'it', regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: 'en' },
    }), 'auto');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/vtt; charset=utf-8/);
    expect(res.headers['content-language']).toBe('es');
    expect(res.body.startsWith('WEBVTT\n')).toBe(true);
    expect(res.body).toContain('Hola a todos.');
    expect(res.body).not.toContain('Hello');
  });

  it('auto : la langue d’origine concourt à SON rang — prisme [fr, en] sur un vocal français ⇒ l’original', async () => {
    const res = await subtitles(buildApp(registered, {
      reader: { systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null },
    }), 'auto');
    expect(res.headers['content-language']).toBe('fr');
    expect(res.body).toContain('00:00:00.000 --> 00:00:01.500\nBonjour à tous.');
  });

  it('auto : aucune langue du prisme servie ⇒ l’original', async () => {
    const res = await subtitles(buildApp(registered, {
      reader: { systemLanguage: 'ja', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
    }), 'auto');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-language']).toBe('fr');
  });

  it('auto : un invité de lien lit dans la langue de sa participation', async () => {
    const res = await subtitles(buildApp(anonymous), 'auto');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-language']).toBe('es');
  });

  it('une langue NOMMÉE et traduite : servie sur la chronologie de l’original', async () => {
    const res = await subtitles(buildApp(registered), 'en');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-language']).toBe('en');
    expect(res.body).toContain('00:00:01.600 --> 00:00:03.900');
  });

  it('une langue nommée sans traduction : 404', async () => {
    expect((await subtitles(buildApp(registered), 'ja')).statusCode).toBe(404);
  });

  it('une langue mal formée : 400', async () => {
    expect((await subtitles(buildApp(registered), 'fr;drop')).statusCode).toBe(400);
  });

  it('une pièce sans transcription : 404', async () => {
    expect((await subtitles(buildApp(registered, { attachment: { ...VOICE_NOTE, transcription: null } }), 'auto')).statusCode).toBe(404);
  });
});

describe('#11329 — une pièce protégée ne transporte pas sa transcription', () => {
  const protectedCases: ReadonlyArray<readonly [string, Fixture]> = [
    ['pièce à vue unique', { attachment: { ...VOICE_NOTE, isViewOnce: true } }],
    ['pièce floutée', { attachment: { ...VOICE_NOTE, isBlurred: true } }],
    ['pièce chiffrée', { attachment: { ...VOICE_NOTE, isEncrypted: true } }],
    ['pièce en mode e2ee', { attachment: { ...VOICE_NOTE, encryptionMode: 'e2ee' } }],
    ['message à vue unique', { message: { ...LIVE_MESSAGE, isViewOnce: true } }],
    ['message flouté', { message: { ...LIVE_MESSAGE, isBlurred: true } }],
    ['message ÉPHÉMÈRE encore vivant', { message: { ...LIVE_MESSAGE, expiresAt: new Date('2099-01-01T00:00:00Z') } }],
    ['message chiffré', { message: { ...LIVE_MESSAGE, isEncrypted: true } }],
    ['message en mode e2ee', { message: { ...LIVE_MESSAGE, encryptionMode: 'e2ee' } }],
  ];

  it.each(protectedCases)('%s : 404, la même réponse qu’une pièce inexistante', async (_label, fixture) => {
    const refused = await subtitles(buildApp(registered, fixture), 'auto');
    const missing = await subtitles(buildApp(registered, { attachment: null }), 'auto');
    expect(refused.statusCode).toBe(404);
    expect(refused.body).toBe(missing.body);
    expect(refused.body).not.toContain('Bonjour');
  });
});

describe('#11329 — les bornes de la fiche', () => {
  it('un non-membre : 404', async () => {
    expect((await subtitles(buildApp(registered, { participant: null }), 'auto')).statusCode).toBe(404);
  });

  it('sans identité : 401', async () => {
    expect((await subtitles(buildApp(null), 'auto')).statusCode).toBe(401);
  });
});
