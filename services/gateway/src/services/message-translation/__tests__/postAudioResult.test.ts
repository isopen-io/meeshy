/**
 * #19749 — les traductions vocales d'un post ou d'une story arrivent jusqu'à
 * `PostMedia.translations`, avec une piste écrite par la PASSERELLE et servie
 * par la route de fichiers comme le fichier d'origine du média.
 *
 * De bout en bout côté passerelle : une trame ZMQ entrante passe par le vrai
 * `ZmqMessageHandler`, le vrai `MessageTranslationService` et le vrai
 * `PostAudioService` ; seules la base et la diffusion sont des doubles. La
 * piste s'écrit pour de vrai sous `UPLOAD_PATH/translated/post`, puis se lit
 * par la vraie route `GET /attachments/file/*`.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import Fastify from 'fastify';
import { existsSync, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ZmqMessageHandler } from '../../zmq-translation/ZmqMessageHandler';

const zmqClient: { current: ZmqMessageHandler | null } = { current: null };

jest.mock('../../ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: async () => zmqClient.current,
    getInstanceSync: () => zmqClient.current,
  },
}));

import { MessageTranslationService } from '../MessageTranslationService';
import { PostAudioService } from '../../posts/PostAudioService';
import { MeeshySocketIOManager } from '../../../socketio/MeeshySocketIOManager';
import { registerFileStreamRoute } from '../../../routes/attachments/download';
import type { MultiLevelJobMappingCache } from '../../MultiLevelJobMappingCache';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocialEventsHandler } from '../../../socketio/handlers/SocialEventsHandler';

const POST_ID = '6650a1b2c3d4e5f6a7b8c9d0';
const POST_MEDIA_ID = '6650a1b2c3d4e5f6a7b8c9d1';
const OTHER_POST_ID = '6650a1b2c3d4e5f6a7b8c9d2';
const TRACK_BYTES = Buffer.from('ID3-piste-traduite-en');

type Update = { where: { id: string }; data: Record<string, unknown> };
type Media = { readonly postId: string | null; readonly commentPostId?: string };
type AttachmentLookup = { where: { id: string }; select: Record<string, unknown> };

const makePrisma = (medias: Record<string, Media>) => {
  const updates: Update[] = [];
  const stored: Record<string, unknown> = {};
  const attachmentLookups: AttachmentLookup[] = [];
  const prisma = {
    messageAttachment: {
      findUnique: async (args: AttachmentLookup) => {
        attachmentLookups.push(args);
        return null;
      },
      findMany: async () => [],
    },
    message: { findUnique: async () => null, findMany: async () => [] },
    postMedia: {
      findUnique: async (args: { where: { id: string }; select: Record<string, unknown> }) => {
        const media = medias[args.where.id];
        if (!media) return null;
        if (args.select.translations) return { translations: stored[args.where.id] ?? {} };
        return { id: args.where.id, postId: media.postId, comment: media.commentPostId ? { postId: media.commentPostId } : null };
      },
      update: async (args: Update) => {
        updates.push(args);
        if ('translations' in args.data) stored[args.where.id] = args.data.translations;
        return { commentId: null };
      },
    },
    post: { findFirst: async () => null },
    postComment: { findFirst: async () => null },
  };
  return { prisma: prisma as unknown as PrismaClient, updates, attachmentLookups };
};

const postMedia = { [POST_MEDIA_ID]: { postId: POST_ID } };

const startGateway = async (prisma: PrismaClient) => {
  const handler = Object.assign(new ZmqMessageHandler(), { close: async () => undefined });
  zmqClient.current = handler;
  PostAudioService.init(prisma, {} as SocialEventsHandler);
  const jobMappingCache = { getAndDeleteJobMapping: async () => null } as unknown as MultiLevelJobMappingCache;
  const service = new MessageTranslationService(prisma, jobMappingCache);
  await service.initialize();
  return { handler, service };
};

type TranslatedAudioOverrides = Partial<{ targetLanguage: string; audioMimeType: string; audioUrl: string | null; textOnly: boolean }>;

const audioProcessCompletedFrames = (postReference: Record<string, string>, audio: TranslatedAudioOverrides = {}): Buffer[] => {
  const language = audio.targetLanguage ?? 'en';
  return [
    Buffer.from(JSON.stringify({
      type: 'audio_process_completed',
      taskId: `task-${Math.random()}`,
      messageId: postReference.postMediaId ?? POST_MEDIA_ID,
      attachmentId: postReference.postMediaId ?? POST_MEDIA_ID,
      transcription: { text: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper' },
      translatedAudios: [{
        targetLanguage: language,
        translatedText: 'Hello everyone',
        audioUrl: '/outputs/audio/translated/tts_cache_shared.mp3',
        audioPath: '/workspace/outputs/audio/translated/tts_cache_shared.mp3',
        durationMs: 1500,
        voiceCloned: true,
        voiceQuality: 0.8,
        audioMimeType: 'audio/mp3',
        ...audio,
      }],
      voiceModelUserId: 'u1',
      voiceModelQuality: 0.8,
      processingTimeMs: 42,
      timestamp: 0,
      binaryFrames: { [`audio_${language}`]: { index: 1, size: TRACK_BYTES.length, mimeType: 'audio/mp3' } },
      ...postReference,
    })),
    TRACK_BYTES,
  ];
};

const withoutBinary = ([metadata]: Buffer[]): Buffer[] => {
  const { binaryFrames: _dropped, ...event } = JSON.parse(metadata.toString()) as Record<string, unknown>;
  return [Buffer.from(JSON.stringify(event))];
};

const until = async <T>(read: () => T | undefined, timeoutMs = 3000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition jamais atteinte');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

const listFiles = async (root: string): Promise<string[]> => {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
  }));
  return nested.flat();
};

const TRACK_KEY = (language: string, ext: string) => new RegExp(`^translated/post/${POST_MEDIA_ID}_${language}_[0-9a-f]{32}\\.${ext}$`);
const LEGACY_TRACK_KEY = `translated/post/${POST_MEDIA_ID}_en.mp3`;
const FILE_ROUTE = '/api/v1/attachments/file/';

describe('#19749 — la piste vocale traduite d’un post arrive dans PostMedia.translations', () => {
  const previousUploadPath = process.env.UPLOAD_PATH;
  const services: MessageTranslationService[] = [];

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
    process.env.UPLOAD_PATH = previousUploadPath;
  });

  const gatewayOn = async (medias: Record<string, Media>) => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'post-audio-'));
    const uploadRoot = path.join(sandbox, 'uploads');
    await fs.mkdir(uploadRoot);
    process.env.UPLOAD_PATH = uploadRoot;
    const { prisma, updates, attachmentLookups } = makePrisma(medias);
    const { handler, service } = await startGateway(prisma);
    services.push(service);
    return { sandbox, uploadRoot, prisma, updates, attachmentLookups, handler };
  };

  type Entry = { url?: string; path?: string; transcription: string };

  const entryOf = async (updates: Update[], language: string, nth = 0) => {
    const update = await until(() => updates.filter((u) => u.where.id === POST_MEDIA_ID && 'translations' in u.data)[nth]);
    return (update.data.translations as Record<string, Entry>)[language];
  };

  const englishEntry = (updates: Update[], nth = 0) => entryOf(updates, 'en', nth);

  const keyOf = (entry: Entry) => (entry.url ?? '').replace(FILE_ROUTE, '');

  const routeOn = async (uploadRoot: string, prisma: PrismaClient) => {
    const app = Fastify({ logger: false });
    registerFileStreamRoute(app, prisma as never, { uploadRoot, mirror: null });
    await app.ready();
    return app;
  };

  const expectTrackWrittenByGateway = async (uploadRoot: string, updates: Update[]) => {
    const english = await englishEntry(updates);
    const key = keyOf(english);
    expect(english.url).toBe(`${FILE_ROUTE}${key}`);
    expect(key).toMatch(TRACK_KEY('en', 'mp3'));
    expect(english.path).toBe(path.join(uploadRoot, key));
    expect(JSON.stringify(english)).not.toContain('/outputs/');
    expect(english.transcription).toBe('Hello everyone');
    expect(await fs.readFile(path.join(uploadRoot, key))).toEqual(TRACK_BYTES);
  };

  it('écrit la piste sous translated/post/<postMediaId>_<langue>_<jeton> quand l’événement nomme le post, sans passer par la voie message', async () => {
    const { uploadRoot, updates, attachmentLookups, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));

    await expectTrackWrittenByGateway(uploadRoot, updates);
    expect(attachmentLookups.filter((lookup) => lookup.select.translations)).toEqual([]);
  });

  it('la piste écrite se lit par la route de fichiers, 200 et ses octets, sous le régime du fichier d’origine d’un média de post', async () => {
    const { uploadRoot, prisma, updates, handler } = await gatewayOn(postMedia);
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const english = await englishEntry(updates);
    await fs.mkdir(path.join(uploadRoot, '2026/11'), { recursive: true });
    await fs.writeFile(path.join(uploadRoot, '2026/11/voice.m4a'), 'ORIGINE');
    const app = await routeOn(uploadRoot, prisma);
    try {
      const track = await app.inject({ method: 'GET', url: (english.url ?? '').replace('/api/v1', '') });
      const origin = await app.inject({ method: 'GET', url: '/attachments/file/2026/11/voice.m4a' });

      expect(track.statusCode).toBe(200);
      expect(track.rawPayload).toEqual(TRACK_BYTES);
      expect(origin.statusCode).toBe(200);
      expect(track.headers['cache-control']).toBe(origin.headers['cache-control']);
    } finally {
      await app.close();
    }
  });

  it('une piste de MESSAGE sans ligne reste refusée (#9588), même quand un média de post porte le même id', async () => {
    const { uploadRoot, prisma } = await gatewayOn(postMedia);
    await fs.mkdir(path.join(uploadRoot, 'translated'), { recursive: true });
    await fs.writeFile(path.join(uploadRoot, `translated/${POST_MEDIA_ID}_en.mp3`), TRACK_BYTES);
    const app = Fastify({ logger: false });
    registerFileStreamRoute(app, prisma as never, { uploadRoot, mirror: null });
    await app.ready();
    try {
      expect((await app.inject({ method: 'GET', url: `/attachments/file/translated/${POST_MEDIA_ID}_en.mp3` })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('retrouve le post d’un ancien traducteur qui ne renvoie pas postId, par le PostMedia de l’attachmentId', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({}));

    await expectTrackWrittenByGateway(uploadRoot, updates);
  });

  it('retrouve aussi un média de COMMENTAIRE (postId nul) par le post de son commentaire', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn({ [POST_MEDIA_ID]: { postId: null, commentPostId: POST_ID } });

    await handler.handleMessage(audioProcessCompletedFrames({}));

    await expectTrackWrittenByGateway(uploadRoot, updates);
  });

  it('une traduction textOnly n’annonce ni piste ni adresse, même avec une audioUrl', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { textOnly: true }));

    const english = await englishEntry(updates);
    expect(english.transcription).toBe('Hello everyone');
    expect(english).not.toHaveProperty('url');
    expect(english).not.toHaveProperty('path');
    expect(await listFiles(uploadRoot)).toEqual([]);
  });

  it('ne touche à aucun PostMedia quand l’attachmentId n’est ni une pièce de message ni un média de post', async () => {
    const { sandbox, updates, handler } = await gatewayOn({});

    await handler.handleMessage(audioProcessCompletedFrames({}));
    await settle();

    expect(updates).toEqual([]);
    expect(await listFiles(sandbox)).toEqual([]);
  });

  it('#19841 — la clé d’une piste ne se déduit pas de postMediaId et de la langue : deux écritures, deux jetons de 128 bits', async () => {
    const { updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const first = keyOf(await englishEntry(updates, 0));
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const second = keyOf(await englishEntry(updates, 1));

    expect(first).toMatch(TRACK_KEY('en', 'mp3'));
    expect(second).toMatch(TRACK_KEY('en', 'mp3'));
    expect(second).not.toBe(first);
    expect(first).not.toBe(LEGACY_TRACK_KEY);
  });

  it('#19841 — une retraduction efface la piste précédente de SA langue, et seulement elle', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { targetLanguage: 'es' }));
    const spanish = keyOf(await entryOf(updates, 'es', 0));
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const first = keyOf(await englishEntry(updates, 1));

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const second = keyOf(await englishEntry(updates, 2));
    await until(() => (existsSync(path.join(uploadRoot, first)) ? undefined : true));

    expect(existsSync(path.join(uploadRoot, second))).toBe(true);
    expect(existsSync(path.join(uploadRoot, spanish))).toBe(true);
  });

  it('#19841 — une piste à l’ancienne clé devinable (sans jeton) répond comme un fichier absent, la nouvelle se sert', async () => {
    const { uploadRoot, prisma, updates, handler } = await gatewayOn(postMedia);
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const english = await englishEntry(updates);
    await fs.writeFile(path.join(uploadRoot, LEGACY_TRACK_KEY), TRACK_BYTES);
    const app = await routeOn(uploadRoot, prisma);
    try {
      const legacy = await app.inject({ method: 'GET', url: `/attachments/file/${LEGACY_TRACK_KEY}` });
      const missing = await app.inject({ method: 'GET', url: `/attachments/file/translated/post/${OTHER_POST_ID}_en.mp3` });
      const current = await app.inject({ method: 'GET', url: `/attachments/file/${keyOf(english)}` });

      expect(legacy.statusCode).toBe(404);
      expect(legacy.body).toBe(missing.body);
      expect(current.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
    ['audio/flac', 'flac'],
  ])('#19841 — %s s’écrit en .%s', async (audioMimeType, ext) => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { audioMimeType }));

    const key = keyOf(await englishEntry(updates));
    expect(key).toMatch(TRACK_KEY('en', ext));
    expect(await fs.readFile(path.join(uploadRoot, key))).toEqual(TRACK_BYTES);
  });

  it('#19841 — un format hors liste garde la traduction en TEXTE seul, sans piste ni adresse', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { audioMimeType: 'audio/x-unknown' }));

    const english = await englishEntry(updates);
    expect(english.transcription).toBe('Hello everyone');
    expect(english).not.toHaveProperty('url');
    expect(english).not.toHaveProperty('path');
    expect(await listFiles(uploadRoot)).toEqual([]);
  });

  it('#19841 — une piste sans binaire n’annonce rien et garde la précédente, sur le disque comme en base', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));
    const first = await englishEntry(updates, 0);

    await handler.handleMessage(withoutBinary(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID })));
    const second = await englishEntry(updates, 1);
    await settle();

    expect(second.url).toBe(first.url);
    expect(await listFiles(uploadRoot)).toEqual([path.join(uploadRoot, keyOf(first))]);
  });

  it('#19841 — une traduction sans audioUrl n’écrit aucune piste, même avec un binaire', async () => {
    const { uploadRoot, updates, handler } = await gatewayOn(postMedia);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { audioUrl: null }));

    const english = await englishEntry(updates);
    expect(english.transcription).toBe('Hello everyone');
    expect(english).not.toHaveProperty('url');
    expect(await listFiles(uploadRoot)).toEqual([]);
  });

  it.each([
    ['un jeton court', 'a'.repeat(31)],
    ['un jeton long', 'a'.repeat(33)],
    ['un jeton vide', ''],
    ['un jeton non hexadécimal', 'g'.repeat(32)],
    ['un jeton en majuscules', 'A'.repeat(32)],
  ])('#19841 — la route refuse une piste de post à %s comme un fichier absent', async (_case, token) => {
    const { uploadRoot, prisma } = await gatewayOn(postMedia);
    const key = `translated/post/${POST_MEDIA_ID}_en_${token}.mp3`;
    await fs.mkdir(path.join(uploadRoot, 'translated/post'), { recursive: true });
    await fs.writeFile(path.join(uploadRoot, key), TRACK_BYTES);
    const app = await routeOn(uploadRoot, prisma);
    try {
      expect((await app.inject({ method: 'GET', url: `/attachments/file/${key}` })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('#19841 — une piste .flac se sert en audio/flac', async () => {
    const { uploadRoot, prisma, updates, handler } = await gatewayOn(postMedia);
    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }, { audioMimeType: 'audio/flac' }));
    const english = await englishEntry(updates);
    const app = await routeOn(uploadRoot, prisma);
    try {
      const track = await app.inject({ method: 'GET', url: `/attachments/file/${keyOf(english)}` });

      expect(track.statusCode).toBe(200);
      expect(track.headers['content-type']).toBe('audio/flac');
    } finally {
      await app.close();
    }
  });

  it.each([
    ['un postMediaId qui remonte l’arborescence', { postId: POST_ID, postMediaId: '../../evil' }, {}],
    ['un postId qui n’est pas celui du média', { postId: OTHER_POST_ID, postMediaId: POST_MEDIA_ID }, {}],
    ['une langue qui remonte l’arborescence', { postId: POST_ID, postMediaId: POST_MEDIA_ID }, { targetLanguage: '../../evil' }],
    ['une extension hors liste', { postId: POST_ID, postMediaId: POST_MEDIA_ID }, { audioMimeType: 'audio/../../evil' }],
  ])('n’écrit rien nulle part pour %s', async (_case, reference, audio) => {
    const { sandbox, updates, handler } = await gatewayOn({ ...postMedia, '../../evil': { postId: POST_ID } });

    await handler.handleMessage(audioProcessCompletedFrames(reference, audio));
    await settle();

    expect(await listFiles(sandbox)).toEqual([]);
    expect(existsSync(path.join(sandbox, '..', 'evil_en.mp3'))).toBe(false);
    expect(updates.flatMap((u) => Object.values(u.data.translations as Record<string, { url?: string }>)).filter((t) => t.url)).toEqual([]);
  });
});

describe('#19749 — la transcription d’un post atteint PostAudioService.handleTranscriptionReady', () => {
  const services: MessageTranslationService[] = [];

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
    jest.restoreAllMocks();
  });

  const transcriptionReadyFrame = (postReference: Record<string, string>): Buffer => Buffer.from(JSON.stringify({
    type: 'transcription_ready',
    taskId: 'task-t',
    messageId: POST_MEDIA_ID,
    attachmentId: POST_MEDIA_ID,
    transcription: { text: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper', durationMs: 2000 },
    processingTimeMs: 12,
    timestamp: 0,
    ...postReference,
  }));

  const routedToPost = async (postReference: Record<string, string>) => {
    const { prisma } = makePrisma(postMedia);
    const { handler, service } = await startGateway(prisma);
    services.push(service);
    const received: Array<{ postId: string; postMediaId: string; transcription: { text: string } }> = [];
    jest.spyOn(PostAudioService.shared, 'handleTranscriptionReady').mockImplementation(async (params) => {
      received.push(params);
    });
    const socketManager = Object.create(MeeshySocketIOManager.prototype) as { _handleTranscriptionReady: (data: unknown) => Promise<void> };
    service.on('transcriptionReady', (data) => socketManager._handleTranscriptionReady.call(socketManager, data));

    await handler.handleMessage(transcriptionReadyFrame(postReference));

    return { received, until: () => until(() => received[0]) };
  };

  it('quand l’événement nomme le post', async () => {
    const call = await (await routedToPost({ postId: POST_ID, postMediaId: POST_MEDIA_ID })).until();

    expect(call).toMatchObject({ postId: POST_ID, postMediaId: POST_MEDIA_ID, transcription: { text: 'Bonjour à tous' } });
  });

  it.each([
    ['le post nommé n’est pas celui du média', { postId: OTHER_POST_ID, postMediaId: POST_MEDIA_ID }],
    ['l’événement ne nomme que postId', { postId: POST_ID }],
    ['l’événement ne nomme que postMediaId', { postMediaId: POST_MEDIA_ID }],
  ])('#19841 — jamais quand %s, sans repli par la voie message', async (_case, reference) => {
    const { received } = await routedToPost(reference);
    await settle();

    expect(received).toEqual([]);
  });

  it('quand un ancien traducteur ne le nomme pas, par le PostMedia de l’attachmentId', async () => {
    const call = await (await routedToPost({})).until();

    expect(call).toMatchObject({ postId: POST_ID, postMediaId: POST_MEDIA_ID, transcription: { text: 'Bonjour à tous' } });
  });
});
