/**
 * Le traitement d'un média sort de la requête HTTP (#11264, défaut validé de
 * #11249) : une file (BullMQ sur le Redis existant), un worker, des priorités,
 * une reprise.
 *
 * Redis est absent du job de CI : la file est doublée par un tableau, et
 * l'adaptateur BullMQ par un faux `Queue` qui enregistre ses appels. Le rendu
 * lui-même (sharp, disque) est RÉEL.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { MEDIA_JOB_PRIORITY, deferredMediaKinds, mediaJobId, type MediaJob } from '../jobs';
import { bullmqMediaJobQueue, type MediaJobQueue } from '../queue';
import { processMediaJob } from '../process-job';
import { handleMediaJobCompleted } from '../ready-notifier';
import { MetadataManager } from '../../MetadataManager';
import { UploadProcessor } from '../../UploadProcessor';

const dirs: string[] = [];
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
afterEach(async () => {
  if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
  else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function uploadRoot(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'media-queue-'));
  dirs.push(base);
  return base;
}

/** Une photo de plus de 2 Mo (bruit : incompressible). */
async function bigPhoto(): Promise<Buffer> {
  const width = 1800;
  const height = 1200;
  const noise = Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 2654435761) % 251));
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
}

async function smallPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#3a7' } }).jpeg().toBuffer();
}

const recordingQueue = (): MediaJobQueue & { readonly jobs: MediaJob[] } => {
  const jobs: MediaJob[] = [];
  return { jobs, enqueue: async (job) => { jobs.push(job); } };
};

describe('deferredMediaKinds — ce qui sort de la requête (#11264)', () => {
  it('file éteinte : tout reste dans la requête, comme avant', () => {
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 50_000_000, queueEnabled: false, compatRenditionEnabled: true })).toEqual([]);
  });

  it('une image de moins de 2 Mo reste SYNCHRONE : un ancien client attend sa vignette dans la réponse', () => {
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 2 * 1024 * 1024 - 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual([]);
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 2 * 1024 * 1024, queueEnabled: true, compatRenditionEnabled: true })).toEqual(['thumb']);
  });

  it('une vidéo diffère sa vignette, et son rendu H.264 quand il est allumé', () => {
    expect(deferredMediaKinds({ attachmentType: 'video', fileSize: 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual(['thumb', 'transcode']);
    expect(deferredMediaKinds({ attachmentType: 'video', fileSize: 1, queueEnabled: true, compatRenditionEnabled: false })).toEqual(['thumb']);
  });

  it('un vocal reste dans la requête (son URL change de .webm en .m4a : un ancien client lirait l’ancienne)', () => {
    expect(deferredMediaKinds({ attachmentType: 'audio', fileSize: 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual([]);
  });

  it('priorités : vignette (2) avant rendu vidéo (3) ; identifiant de tâche idempotent par pièce', () => {
    expect(MEDIA_JOB_PRIORITY).toEqual({ thumb: 2, transcode: 3 });
    const job: MediaJob = { kind: 'thumb', target: 'messageAttachment', recordId: 'aaaaaaaaaaaaaaaaaaaaaaa1', final: true };
    expect(mediaJobId(job)).toBe(mediaJobId({ ...job }));
    expect(mediaJobId(job)).not.toContain(':');
  });
});

describe('bullmqMediaJobQueue — l’adaptateur BullMQ (#11264)', () => {
  it('ajoute la tâche avec son identifiant idempotent, sa priorité, ses reprises', async () => {
    const add = jest.fn(async () => undefined);
    const queue = bullmqMediaJobQueue({ add } as never);
    const job: MediaJob = { kind: 'transcode', target: 'postMedia', recordId: 'aaaaaaaaaaaaaaaaaaaaaaa2', final: true };

    await queue.enqueue(job);

    expect(add).toHaveBeenCalledWith('transcode', job, expect.objectContaining({
      jobId: mediaJobId(job),
      priority: 3,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }));
  });
});

describe('UploadProcessor — la requête ne fait plus que vérifier et persister (#11264)', () => {
  async function upload(buffer: Buffer, queue: MediaJobQueue) {
    const base = await uploadRoot();
    process.env.UPLOAD_PATH = base;
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'aaaaaaaaaaaaaaaaaaaaaaa3', createdAt: new Date(), ...data }));
    const processor = new UploadProcessor({ messageAttachment: { create } } as never, { mediaQueue: queue });
    const result = await processor.uploadFile({ buffer, filename: 'photo.jpg', mimeType: 'image/jpeg', size: buffer.length }, '507f1f77bcf86cd799439011');
    return { base, create, result };
  }

  it('une grande photo : vignette et variantes DIFFÉRÉES, ligne en `pending`, une tâche en file', async () => {
    const queue = recordingQueue();
    const photo = await bigPhoto();
    expect(photo.length).toBeGreaterThanOrEqual(2 * 1024 * 1024);

    const { create, result } = await upload(photo, queue);

    const data = create.mock.calls[0][0].data;
    expect(data.processingState).toBe('pending');
    expect(data.thumbnailPath).toBeUndefined();
    expect(data.imageVariants).toBeUndefined();
    expect(result.thumbnailUrl).toBeUndefined();
    expect(queue.jobs).toEqual([{ kind: 'thumb', target: 'messageAttachment', recordId: 'aaaaaaaaaaaaaaaaaaaaaaa3', final: true }]);
  });

  it('une petite photo : tout reste dans la requête, aucune tâche, aucun état', async () => {
    const queue = recordingQueue();

    const { create } = await upload(await smallPhoto(), queue);

    const data = create.mock.calls[0][0].data;
    expect(data.processingState).toBeUndefined();
    expect(data.thumbnailPath).toMatch(/_thumb\.webp$/);
    expect(queue.jobs).toEqual([]);
  });
});

describe('processMediaJob — le worker rend, persiste, et se rejoue sans dommage (#11264)', () => {
  function prismaWith(row: Record<string, unknown>) {
    const state = { row: { ...row } };
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.row = { ...state.row, ...data };
      return state.row;
    });
    const findUnique = jest.fn(async () => state.row);
    return { state, update, prisma: { messageAttachment: { findUnique, update }, postMedia: { findUnique, update } } };
  }

  it('une tâche « thumb » écrit vignette, variantes WebP et AVIF, thumbhash, et passe la ligne à `ready`', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await bigPhoto());
    const { state, prisma } = prismaWith({ id: 'r1', filePath: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, thumbHash: null, renditions: null, processingState: 'pending' });

    const outcome = await processMediaJob(
      { prisma: prisma as never, uploadBasePath: base, metadataManager: new MetadataManager(base), runFfmpeg: async () => undefined },
      { kind: 'thumb', target: 'messageAttachment', recordId: 'r1', final: true },
    );

    expect(outcome).toEqual({ status: 'done', target: 'messageAttachment', recordId: 'r1', kind: 'thumb' });
    expect(state.row.thumbnailPath).toBe('p_thumb.webp');
    expect(state.row.thumbnailUrl).toBe('p_thumb.webp');
    expect((state.row.imageVariants as unknown[]).length).toBeGreaterThan(0);
    expect((state.row.avifVariants as unknown[]).length).toBeGreaterThan(0);
    expect(typeof state.row.thumbHash).toBe('string');
    expect(state.row.processingState).toBe('ready');
    await expect(fs.stat(path.join(base, 'p_thumb.webp'))).resolves.toBeDefined();
  });

  it('rejouée (reprise après panne), la tâche réécrit les mêmes valeurs aux mêmes clés', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await smallPhoto());
    const deps = (prisma: unknown) => ({ prisma: prisma as never, uploadBasePath: base, metadataManager: new MetadataManager(base), runFfmpeg: async () => undefined });
    const job: MediaJob = { kind: 'thumb', target: 'messageAttachment', recordId: 'r1', final: true };
    const { state, prisma } = prismaWith({ id: 'r1', filePath: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, thumbHash: null, renditions: null, processingState: 'pending' });

    await processMediaJob(deps(prisma), job);
    const first = { ...state.row };
    await processMediaJob(deps(prisma), job);

    expect(state.row).toEqual(first);
  });

  it('une pièce supprimée entre-temps : rien n’est écrit', async () => {
    const update = jest.fn();
    const prisma = { messageAttachment: { findUnique: async () => null, update } };

    const outcome = await processMediaJob(
      { prisma: prisma as never, uploadBasePath: '/nowhere', metadataManager: new MetadataManager('/nowhere'), runFfmpeg: async () => undefined },
      { kind: 'thumb', target: 'messageAttachment', recordId: 'gone', final: true },
    );

    expect(outcome).toEqual({ status: 'gone' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('handleMediaJobCompleted — qui apprend que le média est prêt (#11264)', () => {
  it('pièce de message : les lecteurs reçoivent `message:attachment-updated` (qu’un ancien client applique), l’auteur `attachment:ready`', async () => {
    const emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];
    const attachmentUpdated = jest.fn(async () => undefined);
    const row = { id: 'r1', messageId: 'm1', uploadedBy: 'u1', processingState: 'ready', message: { conversationId: 'c1' } };

    await handleMediaJobCompleted(
      {
        loadMessageAttachment: async () => row as never,
        loadPostMedia: async () => null,
        emitAttachmentUpdated: attachmentUpdated,
        emitToUser: (userId, event, payload) => emitted.push({ room: userId, event, payload: payload as Record<string, unknown> }),
      },
      { status: 'done', target: 'messageAttachment', recordId: 'r1', kind: 'thumb' },
    );

    expect(attachmentUpdated).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'm1', attachment: row });
    expect(emitted).toEqual([{ room: 'u1', event: SERVER_EVENTS.ATTACHMENT_READY, payload: expect.objectContaining({ attachmentId: 'r1', target: 'messageAttachment', messageId: 'm1', conversationId: 'c1', processingState: 'ready' }) }]);
  });

  it('pièce pas encore envoyée : seul l’auteur est prévenu (le `message:new` portera la ligne finie)', async () => {
    const attachmentUpdated = jest.fn(async () => undefined);
    const emitted: string[] = [];

    await handleMediaJobCompleted(
      {
        loadMessageAttachment: async () => ({ id: 'r1', messageId: null, uploadedBy: 'u1', processingState: 'ready', message: null }) as never,
        loadPostMedia: async () => null,
        emitAttachmentUpdated: attachmentUpdated,
        emitToUser: (userId) => emitted.push(userId),
      },
      { status: 'done', target: 'messageAttachment', recordId: 'r1', kind: 'thumb' },
    );

    expect(attachmentUpdated).not.toHaveBeenCalled();
    expect(emitted).toEqual(['u1']);
  });
});
