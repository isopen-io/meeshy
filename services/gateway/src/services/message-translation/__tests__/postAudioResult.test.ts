/**
 * #19749 — les traductions vocales d'un post ou d'une story arrivent jusqu'à
 * `PostMedia.translations`, avec une piste écrite par la PASSERELLE.
 *
 * De bout en bout côté passerelle : une trame ZMQ entrante passe par le vrai
 * `ZmqMessageHandler`, le vrai `MessageTranslationService` et le vrai
 * `PostAudioService` ; seules la base et la diffusion sont des doubles. La
 * piste s'écrit pour de vrai sous `UPLOAD_PATH/translated`.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
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
import type { MultiLevelJobMappingCache } from '../../MultiLevelJobMappingCache';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocialEventsHandler } from '../../../socketio/handlers/SocialEventsHandler';

const POST_ID = '6650a1b2c3d4e5f6a7b8c9d0';
const POST_MEDIA_ID = '6650a1b2c3d4e5f6a7b8c9d1';
const TRACK_BYTES = Buffer.from('ID3-piste-traduite-en');

type Update = { where: { id: string }; data: Record<string, unknown> };

const makePrisma = (media: { postId: string | null } | null) => {
  const updates: Update[] = [];
  const prisma = {
    messageAttachment: { findUnique: async () => null },
    message: { findUnique: async () => null },
    postMedia: {
      findUnique: async (args: { where: { id: string }; select: Record<string, unknown> }) => {
        if (args.where.id !== POST_MEDIA_ID || media === null) return null;
        if (args.select.translations) return { translations: {} };
        return { id: POST_MEDIA_ID, postId: media.postId, comment: null };
      },
      update: async (args: Update) => {
        updates.push(args);
        return { commentId: null };
      },
    },
    post: { findFirst: async () => null },
    postComment: { findFirst: async () => null },
  };
  return { prisma: prisma as unknown as PrismaClient, updates };
};

const makeUploadRoot = async () => fs.mkdtemp(path.join(os.tmpdir(), 'post-audio-'));

const startGateway = async (prisma: PrismaClient) => {
  const handler = Object.assign(new ZmqMessageHandler(), { close: async () => undefined });
  zmqClient.current = handler;
  PostAudioService.init(prisma, {} as SocialEventsHandler);
  const jobMappingCache = { getAndDeleteJobMapping: async () => null } as unknown as MultiLevelJobMappingCache;
  const service = new MessageTranslationService(prisma, jobMappingCache);
  await service.initialize();
  return { handler, service };
};

const audioProcessCompletedFrames = (postReference: Record<string, string>): Buffer[] => [
  Buffer.from(JSON.stringify({
    type: 'audio_process_completed',
    taskId: `task-${Math.random()}`,
    messageId: POST_MEDIA_ID,
    attachmentId: POST_MEDIA_ID,
    transcription: { text: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper' },
    translatedAudios: [{
      targetLanguage: 'en',
      translatedText: 'Hello everyone',
      audioUrl: '/outputs/audio/translated/tts_cache_shared.mp3',
      audioPath: '/workspace/outputs/audio/translated/tts_cache_shared.mp3',
      durationMs: 1500,
      voiceCloned: true,
      voiceQuality: 0.8,
      audioMimeType: 'audio/mp3',
    }],
    voiceModelUserId: 'u1',
    voiceModelQuality: 0.8,
    processingTimeMs: 42,
    timestamp: 0,
    binaryFrames: { audio_en: { index: 1, size: TRACK_BYTES.length, mimeType: 'audio/mp3' } },
    ...postReference,
  })),
  TRACK_BYTES,
];

const until = async <T>(read: () => T | undefined, timeoutMs = 3000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition jamais atteinte');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('#19749 — la piste vocale traduite d’un post arrive dans PostMedia.translations', () => {
  const previousUploadPath = process.env.UPLOAD_PATH;
  const services: MessageTranslationService[] = [];

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
    process.env.UPLOAD_PATH = previousUploadPath;
  });

  const expectTrackWrittenByGateway = async (uploadRoot: string, updates: Update[]) => {
    const update = await until(() => updates.find((u) => u.where.id === POST_MEDIA_ID && 'translations' in u.data));
    const english = (update.data.translations as Record<string, { url?: string; path?: string; transcription: string }>).en;
    const filename = `${POST_MEDIA_ID}_en.mp3`;
    expect(english.url).toBe(`/api/v1/attachments/file/translated/${filename}`);
    expect(english.path).toBe(path.join(uploadRoot, 'translated', filename));
    expect(JSON.stringify(english)).not.toContain('/outputs/');
    expect(english.transcription).toBe('Hello everyone');
    expect(await fs.readFile(path.join(uploadRoot, 'translated', filename))).toEqual(TRACK_BYTES);
  };

  it('écrit la piste sous translated/<postMediaId>_<langue> quand l’événement nomme le post', async () => {
    const uploadRoot = await makeUploadRoot();
    process.env.UPLOAD_PATH = uploadRoot;
    const { prisma, updates } = makePrisma({ postId: POST_ID });
    const { handler, service } = await startGateway(prisma);
    services.push(service);

    await handler.handleMessage(audioProcessCompletedFrames({ postId: POST_ID, postMediaId: POST_MEDIA_ID }));

    await expectTrackWrittenByGateway(uploadRoot, updates);
  });

  it('retrouve le post d’un ancien traducteur qui ne renvoie pas postId, par le PostMedia de l’attachmentId', async () => {
    const uploadRoot = await makeUploadRoot();
    process.env.UPLOAD_PATH = uploadRoot;
    const { prisma, updates } = makePrisma({ postId: POST_ID });
    const { handler, service } = await startGateway(prisma);
    services.push(service);

    await handler.handleMessage(audioProcessCompletedFrames({}));

    await expectTrackWrittenByGateway(uploadRoot, updates);
  });

  it('ne touche à aucun PostMedia quand l’attachmentId n’est ni une pièce de message ni un média de post', async () => {
    const uploadRoot = await makeUploadRoot();
    process.env.UPLOAD_PATH = uploadRoot;
    const { prisma, updates } = makePrisma(null);
    const { handler, service } = await startGateway(prisma);
    services.push(service);

    await handler.handleMessage(audioProcessCompletedFrames({}));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(updates).toEqual([]);
    await expect(fs.readdir(path.join(uploadRoot, 'translated'))).rejects.toThrow();
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
    const { prisma } = makePrisma({ postId: POST_ID });
    const { handler, service } = await startGateway(prisma);
    services.push(service);
    const received: Array<{ postId: string; postMediaId: string; transcription: { text: string } }> = [];
    jest.spyOn(PostAudioService.shared, 'handleTranscriptionReady').mockImplementation(async (params) => {
      received.push(params);
    });
    const socketManager = Object.create(MeeshySocketIOManager.prototype) as { _handleTranscriptionReady: (data: unknown) => Promise<void> };
    service.on('transcriptionReady', (data) => socketManager._handleTranscriptionReady.call(socketManager, data));

    await handler.handleMessage(transcriptionReadyFrame(postReference));

    return until(() => received[0]);
  };

  it('quand l’événement nomme le post', async () => {
    const call = await routedToPost({ postId: POST_ID, postMediaId: POST_MEDIA_ID });

    expect(call).toMatchObject({ postId: POST_ID, postMediaId: POST_MEDIA_ID, transcription: { text: 'Bonjour à tous' } });
  });

  it('quand un ancien traducteur ne le nomme pas, par le PostMedia de l’attachmentId', async () => {
    const call = await routedToPost({});

    expect(call).toMatchObject({ postId: POST_ID, postMediaId: POST_MEDIA_ID, transcription: { text: 'Bonjour à tous' } });
  });
});
