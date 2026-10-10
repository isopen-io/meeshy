/**
 * #8039 — un vocal enregistré sur le web (WebM/Opus sous Chrome, Ogg sous
 * Firefox) doit ressortir du téléversement en AAC/M4A, seul format que les
 * trois clients lisent (AVFoundation ne lit ni WebM ni Ogg).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

type FakeFfmpegOutcome = { exitCode: number };
const ffmpegOutcome: FakeFfmpegOutcome = { exitCode: 0 };
const spawnCalls: string[][] = [];

jest.mock('child_process', () => ({
  spawn: jest.fn((_cmd: string, args: string[]) => {
    spawnCalls.push(args);
    const proc = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: jest.fn() });
    setImmediate(() => proc.emit('close', ffmpegOutcome.exitCode));
    return proc;
  }),
}));

const writtenPaths: string[] = [];
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(async () => undefined),
    writeFile: jest.fn(async (p: string) => { writtenPaths.push(p); }),
    chmod: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    readFile: jest.fn(async () => Buffer.from('normalized-m4a')),
  },
}));

const probedStreams: { value: { video: boolean; audio: boolean } | null } = { value: null };
const mockMetadataManager = {
  extractMetadata: jest.fn(async (..._args: unknown[]) => ({ duration: 3 })),
  probeMediaStreams: jest.fn(async () => probedStreams.value),
  generateVideoThumbnail: jest.fn(async () => null),
  generateThumbnail: jest.fn(async () => null),
  generateImageVariants: jest.fn(async () => []),
};
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => mockMetadataManager),
}));

const mockEncryptionService = {
  encryptAttachment: jest.fn(async (params: { fileBuffer: Buffer; mimeType: string }) => ({
    encryptedBuffer: params.fileBuffer,
    metadata: {
      encryptionKey: 'k', iv: 'iv', authTag: 'tag', hmac: 'h',
      originalSize: params.fileBuffer.length, originalHash: 'oh',
      encryptedSize: params.fileBuffer.length, encryptedHash: 'eh', mode: 'server',
    },
  })),
};
jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator.js', () => ({
  ThumbHashGenerator: { generate: jest.fn(async () => null) },
}));

import { UploadProcessor } from '../../../services/attachments/UploadProcessor';

const WEBM_OPUS_BYTES = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
  Buffer.from('webm', 'latin1'),
  Buffer.alloc(64),
]);

function makeProcessor() {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'att-1', ...data }));
  const prisma = { messageAttachment: { create } };
  process.env.UPLOAD_PATH = '/uploads';
  return { processor: new UploadProcessor(prisma as never), create };
}

function webVoiceNote() {
  return { buffer: WEBM_OPUS_BYTES, filename: 'voice.webm', mimeType: 'audio/webm;codecs=opus', size: WEBM_OPUS_BYTES.length };
}

describe('UploadProcessor — un vocal web se normalise en M4A (#8039)', () => {
  beforeEach(() => {
    probedStreams.value = null;
    ffmpegOutcome.exitCode = 0;
    spawnCalls.length = 0;
    writtenPaths.length = 0;
    jest.clearAllMocks();
  });

  it('persiste un WebM/Opus comme audio/mp4 dans un fichier .m4a', async () => {
    const { processor, create } = makeProcessor();

    const result = await processor.uploadFile(webVoiceNote(), 'user-1');

    const persisted = create.mock.calls[0][0].data;
    expect(persisted.mimeType).toBe('audio/mp4');
    expect(String(persisted.filePath)).toMatch(/\.m4a$/);
    expect(String(persisted.fileUrl)).toMatch(/\.m4a$/);
    expect(String(persisted.fileName)).toMatch(/\.m4a$/);
    expect(result.mimeType).toBe('audio/mp4');
    expect(writtenPaths.some((p) => p.startsWith('/uploads/') && p.endsWith('.m4a'))).toBe(true);
    expect(writtenPaths.some((p) => p.startsWith('/uploads/') && p.endsWith('.webm'))).toBe(false);
  });

  it('demande à ffmpeg un conteneur M4A, jamais celui de la source', async () => {
    const { processor } = makeProcessor();

    await processor.uploadFile(webVoiceNote(), 'user-1');

    const args = spawnCalls[0];
    expect(args[args.indexOf('-f') + 1]).toBe('ipod');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
  });

  it('garde le WebM d’origine, fichier et type, quand ffmpeg échoue', async () => {
    ffmpegOutcome.exitCode = 1;
    const { processor, create } = makeProcessor();

    await processor.uploadFile(webVoiceNote(), 'user-1');

    const persisted = create.mock.calls[0][0].data;
    expect(persisted.mimeType).toBe('audio/webm;codecs=opus');
    expect(String(persisted.filePath)).toMatch(/\.webm$/);
  });

  it('chiffre et persiste la version M4A sur le chemin chiffré serveur', async () => {
    const { processor, create } = makeProcessor();

    await processor.uploadEncryptedFile(webVoiceNote(), 'user-1', 'server' as never);

    const encrypted = mockEncryptionService.encryptAttachment.mock.calls[0][0];
    expect(encrypted.mimeType).toBe('audio/mp4');
    expect(encrypted.fileBuffer.toString()).toBe('normalized-m4a');
    expect(create.mock.calls[0][0].data.mimeType).toBe('audio/mp4');
  });
});

const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from('ftypisom\x00\x00\x02\x00isomiso2', 'latin1'), Buffer.alloc(32)]);

function mp4File(filename: string) {
  return { buffer: MP4_BYTES, filename, mimeType: 'video/mp4', size: MP4_BYTES.length };
}

describe('UploadProcessor — un MP4 sans image est un son (#9693)', () => {
  beforeEach(() => {
    ffmpegOutcome.exitCode = 0;
    spawnCalls.length = 0;
    writtenPaths.length = 0;
    jest.clearAllMocks();
  });

  it('persiste un MP4 audio seul comme audio/mp4, normalisé en .m4a, sans vignette vidéo', async () => {
    probedStreams.value = { video: false, audio: true };
    const { processor, create } = makeProcessor();

    const result = await processor.uploadFile(mp4File('podcast.mp4'), 'user-1');

    const persisted = create.mock.calls[0][0].data;
    expect(persisted.mimeType).toBe('audio/mp4');
    expect(String(persisted.filePath)).toMatch(/\.m4a$/);
    expect(result.mimeType).toBe('audio/mp4');
    expect(mockMetadataManager.extractMetadata.mock.calls[0][1]).toBe('audio');
    expect(mockMetadataManager.generateVideoThumbnail).not.toHaveBeenCalled();
  });

  it('garde une vraie vidéo en video/mp4', async () => {
    probedStreams.value = { video: true, audio: true };
    const { processor, create } = makeProcessor();

    await processor.uploadFile(mp4File('clip.mp4'), 'user-1');

    const persisted = create.mock.calls[0][0].data;
    expect(persisted.mimeType).toBe('video/mp4');
    expect(String(persisted.filePath)).toMatch(/\.mp4$/);
  });

  it('garde video/mp4 quand la sonde ne répond pas', async () => {
    probedStreams.value = null;
    const { processor, create } = makeProcessor();

    await processor.uploadFile(mp4File('clip.mp4'), 'user-1');

    expect(create.mock.calls[0][0].data.mimeType).toBe('video/mp4');
  });
});
