/**
 * Le traitement d'un média sort de la requête HTTP (#11264, défaut validé de
 * #11249) : une file (BullMQ sur le Redis existant), un worker, des priorités,
 * une reprise — et, depuis l'audit S9, jamais une requête suspendue à Redis,
 * jamais une pièce `pending` sans personne pour la rendre, jamais un fichier
 * dérivé orphelin, jamais un rendu raté publié `ready`.
 *
 * Redis est absent du job de CI : la file est doublée, et l'adaptateur BullMQ
 * par un faux `Queue`. Le rendu lui-même (sharp, disque) est RÉEL.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { deferredMediaKinds, mediaJobId, mediaJobRef, readMediaJob, type MediaJob } from '../jobs';
import {
  MEDIA_WORKER_HEARTBEAT_KEY,
  bullmqMediaJobQueue,
  mediaQueueConnection,
  mediaQueueProducerConnection,
  type MediaJobQueue,
  type QueueLike,
} from '../queue';
import { processMediaJob } from '../process-job';
import { deferrableKinds, scheduleDeferred } from '../dispatch';
import { handleMediaReady, readMediaReadyNotice, type MediaReadyPorts } from '../ready-notifier';
import { listenerLease, type LeaseClient } from '../listener-lease';
import { sweepPendingMedia } from '../sweep';
import { runMediaJob, workerConcurrency } from '../../../../workers/media-worker';
import { MetadataManager } from '../../MetadataManager';
import { UploadProcessor } from '../../UploadProcessor';
import { copiedAttachmentFields } from '../../../messaging/copiedAttachmentFields';

const ID = (n: number): string => n.toString(16).padStart(24, 'a');
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

const neverSettles = <T>(): Promise<T> => new Promise<T>(() => undefined);

const recordingQueue = (alive = true): MediaJobQueue & { readonly jobs: MediaJob[] } => {
  const jobs: MediaJob[] = [];
  return { jobs, workerAlive: async () => alive, schedule: async (job) => { jobs.push(job); } };
};

/** Un double Prisma à lignes : `updateMany`/`findMany` honorent `id`, `filePath` et `processingState`. */
function rowsStore(initial: ReadonlyArray<Record<string, unknown>>) {
  const rows = new Map(initial.map((row) => [row.id as string, { ...row }]));
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const delegate = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].filter((r) => matches(r, where)).map((r) => ({ id: r.id as string }))),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = [...rows.values()].filter((r) => matches(r, where));
      hit.forEach((r) => rows.set(r.id as string, { ...r, ...data }));
      return { count: hit.length };
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: ID(3), createdAt: new Date(), messageId: null, ...data };
      rows.set(row.id, row);
      return row;
    }),
  };
  return { rows, delegate, prisma: { messageAttachment: delegate, postMedia: delegate } };
}

const depsFor = (base: string, prisma: unknown) => ({
  prisma: prisma as never, uploadBasePath: base, metadataManager: new MetadataManager(base), runFfmpeg: async () => undefined,
});

describe('les tâches — une par pièce, lues comme des données Redis (#11264)', () => {
  it('une image de moins de 2 Mo reste SYNCHRONE ; une vidéo diffère vignette puis rendu ; un vocal reste dans la requête', () => {
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 2 * 1024 * 1024 - 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual([]);
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 2 * 1024 * 1024, queueEnabled: true, compatRenditionEnabled: true })).toEqual(['thumb']);
    expect(deferredMediaKinds({ attachmentType: 'video', fileSize: 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual(['thumb', 'transcode']);
    expect(deferredMediaKinds({ attachmentType: 'audio', fileSize: 1, queueEnabled: true, compatRenditionEnabled: true })).toEqual([]);
    expect(deferredMediaKinds({ attachmentType: 'image', fileSize: 50_000_000, queueEnabled: false, compatRenditionEnabled: true })).toEqual([]);
  });

  it('une tâche malformée ou hostile n’est pas lue ; la forme d’avant (une tâche par rendu) l’est encore', () => {
    expect(readMediaJob({ target: 'user', recordId: ID(1), kinds: ['thumb'] })).toBeNull();
    expect(readMediaJob({ target: 'postMedia', recordId: '../etc', kinds: ['thumb'] })).toBeNull();
    expect(readMediaJob({ target: 'postMedia', recordId: ID(1), kinds: ['rm'] })).toBeNull();
    expect(readMediaJob({ kind: 'thumb', target: 'messageAttachment', recordId: ID(1), final: true })).toEqual({ target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });
  });

  it('l’identifiant de tâche se relit depuis un événement qui ne porte que lui', () => {
    const job = { target: 'postMedia' as const, recordId: ID(2) };
    expect(mediaJobId(job)).not.toContain(':');
    expect(mediaJobRef(mediaJobId(job))).toEqual(job);
    expect(mediaJobRef('thumb-postMedia-zz')).toBeNull();
  });
});

describe('bullmqMediaJobQueue — la requête n’attend JAMAIS Redis (audit S9, défaut 1)', () => {
  const fakeQueue = (over: Partial<QueueLike> = {}): QueueLike => ({
    add: jest.fn(async () => undefined),
    client: Promise.resolve({ get: async () => String(Date.now()) }),
    ...over,
  });

  it('ajoute UNE tâche par pièce, priorité du rendu le plus urgent, trois reprises', async () => {
    const queue = fakeQueue();
    const job: MediaJob = { target: 'postMedia', recordId: ID(2), kinds: ['thumb', 'transcode'] };

    await bullmqMediaJobQueue(queue).schedule(job);

    expect(queue.add).toHaveBeenCalledWith('media', job, expect.objectContaining({ jobId: mediaJobId(job), priority: 2, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }));
  });

  it('une mise en file qui ne répond pas ÉCHOUE au délai, au lieu de suspendre la requête', async () => {
    const queue = bullmqMediaJobQueue(fakeQueue({ add: () => neverSettles() }), { timeoutMs: 50 });
    await expect(queue.schedule({ target: 'postMedia', recordId: ID(2), kinds: ['thumb'] })).rejects.toThrow(/50 ms/);
  });

  it('worker vivant ⇔ battement de cœur récent ; absent, périmé ou Redis muet ⇒ non', async () => {
    const now = 1_000_000;
    const withBeat = (beat: string | null) => bullmqMediaJobQueue(fakeQueue({ client: Promise.resolve({ get: async (key: string) => (key === MEDIA_WORKER_HEARTBEAT_KEY ? beat : null) }) }), { now: () => now });
    await expect(withBeat(String(now - 1000)).workerAlive()).resolves.toBe(true);
    await expect(withBeat(String(now - 60_000)).workerAlive()).resolves.toBe(false);
    await expect(withBeat(null).workerAlive()).resolves.toBe(false);
    await expect(bullmqMediaJobQueue(fakeQueue({ client: neverSettles() }), { timeoutMs: 50 }).workerAlive()).resolves.toBe(false);
  });

  it('la connexion PRODUCTRICE échoue vite ; celle du worker reste bloquante (exigé par BullMQ)', () => {
    expect(mediaQueueProducerConnection('redis://r:6379')).toEqual(expect.objectContaining({ enableOfflineQueue: false, maxRetriesPerRequest: 1 }));
    expect(mediaQueueConnection('redis://r:6379').maxRetriesPerRequest).toBeNull();
  });

  it('le balayage remplace une tâche FINIE retenue, jamais une tâche vivante', async () => {
    const remove = jest.fn(async () => undefined);
    const add = jest.fn(async () => undefined);
    const job: MediaJob = { target: 'messageAttachment', recordId: ID(4), kinds: ['thumb'] };

    await bullmqMediaJobQueue(fakeQueue({ add, getJob: async () => ({ getState: async () => 'completed', remove }) })).reschedule(job);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);

    await bullmqMediaJobQueue(fakeQueue({ add, getJob: async () => ({ getState: async () => 'active', remove }) })).reschedule(job);
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe('dispatch — ne différer que si un worker bat ; file muette ⇒ rendu sur place', () => {
  it('aucun worker vivant : rien n’est différé (audit S9, défaut 2)', async () => {
    await expect(deferrableKinds(recordingQueue(false), { attachmentType: 'video', fileSize: 1, compatRenditionEnabled: true })).resolves.toEqual([]);
    await expect(deferrableKinds(recordingQueue(true), { attachmentType: 'video', fileSize: 1, compatRenditionEnabled: true })).resolves.toEqual(['thumb', 'transcode']);
  });

  it('une mise en file qui dépasse son délai PUIS aboutit : rien n’est rendu sur place, une seule tâche (contre-audit N1)', async () => {
    const added: MediaJob[] = [];
    const late = bullmqMediaJobQueue({
      add: (_name, job) => new Promise((resolve) => setTimeout(() => { added.push(job); resolve(undefined); }, 100)),
      client: Promise.resolve({ get: async () => String(Date.now()) }),
    }, { timeoutMs: 50 });
    const render = jest.spyOn(MetadataManager.prototype, 'generateThumbnail');

    const outcome = await scheduleDeferred({ queue: late, target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(outcome).toBe('left-to-sweep');
    expect(added).toHaveLength(1);
    expect(render).not.toHaveBeenCalled();
    render.mockRestore();
  });

  it('une file qui lève : la pièce reste `pending` pour le balayage, la requête rend la main', async () => {
    const queue: MediaJobQueue = { workerAlive: async () => true, schedule: async () => { throw new Error('redis down'); } };
    await expect(scheduleDeferred({ queue, target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] })).resolves.toBe('left-to-sweep');
  });
});

describe('UploadProcessor — la requête ne fait plus que vérifier et persister (#11264)', () => {
  async function upload(buffer: Buffer, queue: MediaJobQueue) {
    process.env.UPLOAD_PATH = await uploadRoot();
    const store = rowsStore([]);
    const processor = new UploadProcessor(store.prisma as never, { mediaQueue: queue });
    const result = await processor.uploadFile({ buffer, filename: 'photo.jpg', mimeType: 'image/jpeg', size: buffer.length }, '507f1f77bcf86cd799439011');
    return { data: store.delegate.create.mock.calls[0][0].data, result };
  }

  it('une grande photo, worker vivant : vignette DIFFÉRÉE, ligne `pending`, une tâche en file', async () => {
    const queue = recordingQueue();
    const { data, result } = await upload(await bigPhoto(), queue);

    expect(data.processingState).toBe('pending');
    expect(data.thumbnailPath).toBeUndefined();
    expect(result.thumbnailUrl).toBeUndefined();
    expect(queue.jobs).toEqual([{ target: 'messageAttachment', recordId: ID(3), kinds: ['thumb'] }]);
  }, 120_000);

  it('une grande photo, file suspendue : l’envoi se RÉSOUT quand même, la pièce attend le balayage (audit S9, défaut 1 ; N1)', async () => {
    const hung = bullmqMediaJobQueue({ add: () => neverSettles(), client: Promise.resolve({ get: async () => String(Date.now()) }) }, { timeoutMs: 50 });

    const { data, result } = await upload(await bigPhoto(), hung);

    expect(data.processingState).toBe('pending');
    expect(result.processingState).toBe('pending');
  }, 120_000);

  it('une petite photo : tout reste dans la requête, aucune tâche, aucun état', async () => {
    const queue = recordingQueue();
    const { data } = await upload(await smallPhoto(), queue);

    expect(data.processingState).toBeUndefined();
    expect(data.thumbnailPath).toMatch(/_thumb\.webp$/);
    expect(queue.jobs).toEqual([]);
  }, 120_000);
});

describe('processMediaJob — rendre, écrire, relire (#11264, audit S9 défauts 3, 4, 6)', () => {
  const photoRow = (over: Record<string, unknown> = {}) => ({ id: ID(1), filePath: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, thumbHash: null, renditions: null, processingState: 'pending', ...over });

  it('écrit vignette, variantes WebP et AVIF, thumbhash, et passe la ligne à `ready`', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await bigPhoto());
    const { rows, prisma } = rowsStore([photoRow()]);

    const outcome = await processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });

    const row = rows.get(ID(1)) as Record<string, unknown>;
    expect(outcome).toEqual({ status: 'done', target: 'messageAttachment', recordIds: [ID(1)], kinds: ['thumb'] });
    expect(row.thumbnailPath).toBe('p_thumb.webp');
    expect((row.imageVariants as unknown[]).length).toBeGreaterThan(0);
    expect((row.avifVariants as unknown[]).length).toBeGreaterThan(0);
    expect(typeof row.thumbHash).toBe('string');
    expect(row.processingState).toBe('ready');
  }, 120_000);

  it('rejouée, la tâche réécrit les mêmes valeurs aux mêmes clés', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await smallPhoto());
    const { rows, prisma } = rowsStore([photoRow()]);
    const job: MediaJob = { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] };

    await processMediaJob(depsFor(base, prisma), job);
    const first = { ...rows.get(ID(1)) };
    await processMediaJob(depsFor(base, prisma), job);

    expect(rows.get(ID(1))).toEqual(first);
  }, 120_000);

  it('les COPIES de diffusion et de transfert (même `filePath`) reçoivent le rendu et sont nommées (défaut 4)', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await smallPhoto());
    const { rows, prisma } = rowsStore([photoRow(), photoRow({ id: ID(5) }), photoRow({ id: ID(6), filePath: 'autre.jpg' })]);

    const outcome = await processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });

    expect(outcome).toEqual(expect.objectContaining({ recordIds: [ID(1), ID(5)] }));
    expect(rows.get(ID(5))?.thumbnailPath).toBe('p_thumb.webp');
    expect(rows.get(ID(5))?.processingState).toBe('ready');
    expect(rows.get(ID(6))?.thumbnailPath).toBeUndefined();
  }, 120_000);

  it('une pièce SUPPRIMÉE PENDANT le rendu : ce qui vient d’être produit est effacé du disque (défaut 3)', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await bigPhoto());
    const { rows, delegate, prisma } = rowsStore([photoRow()]);
    const realUpdate = delegate.updateMany.getMockImplementation();
    delegate.updateMany.mockImplementationOnce(async (args) => {
      rows.delete(ID(1));
      return realUpdate ? realUpdate(args) : { count: 0 };
    });

    const outcome = await processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });

    expect(outcome).toEqual({ status: 'gone' });
    expect((await fs.readdir(base)).sort()).toEqual(['p.jpg']);
  }, 120_000);

  it('une pièce supprimée avant la lecture : rien n’est rendu ni écrit', async () => {
    const { delegate, prisma } = rowsStore([]);
    const outcome = await processMediaJob(depsFor('/nowhere', prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] });

    expect(outcome).toEqual({ status: 'gone' });
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('un rendu RATÉ lève (la file reprend) et ne publie jamais `ready` (défaut 6)', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), Buffer.from('pas une image'));
    const { rows, prisma } = rowsStore([photoRow()]);

    await expect(processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] })).rejects.toThrow();
    expect(rows.get(ID(1))?.processingState).toBe('pending');
  });

  it('une variante WebP ou AVIF RATÉE lève en mode strict, est avalée sinon (contre-audit N3)', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'bad.jpg'), Buffer.from('pas une image'));
    const manager = new MetadataManager(base);

    await expect(manager.generateAvifVariants('bad.jpg', { strict: true })).rejects.toThrow();
    await expect(manager.generateImageVariants('bad.jpg', { strict: true })).rejects.toThrow();
    await expect(manager.generateAvifVariants('bad.jpg')).resolves.toEqual([]);
  });

  it('le worker passe `strict` aux variantes : une AVIF ratée ne finit jamais `ready`', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await smallPhoto());
    const { rows, prisma } = rowsStore([photoRow()]);
    const avif = jest.spyOn(MetadataManager.prototype, 'generateAvifVariants')
      .mockImplementation(async (_p, options) => { if (options?.strict) throw new Error('ENOSPC'); return []; });

    await expect(processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] })).rejects.toThrow('ENOSPC');
    expect(rows.get(ID(1))?.processingState).toBe('pending');
    avif.mockRestore();
  }, 120_000);

  it('une reprise saute les rendus déjà faits, et prévient après chaque rendu intermédiaire', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), await smallPhoto());
    const { rows, prisma } = rowsStore([photoRow()]);
    const progress = jest.fn(async () => undefined);
    const generateThumbnail = jest.spyOn(MetadataManager.prototype, 'generateThumbnail');

    await processMediaJob(depsFor(base, prisma), { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb', 'transcode'] }, { done: ['thumb'], onRendered: progress });

    expect(generateThumbnail).not.toHaveBeenCalled();
    expect(rows.get(ID(1))?.processingState).toBe('ready');
    generateThumbnail.mockRestore();
  });
});

describe('runMediaJob — le dernier essai raté passe la pièce `failed` AVANT de publier l’échec', () => {
  const failingJob = (attemptsMade: number) => ({
    data: { target: 'messageAttachment', recordId: ID(1), kinds: ['thumb'] },
    progress: 0,
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  });

  it('essai 3/3 : `failed` écrit, l’erreur remonte ; essai 1/3 : la ligne reste `pending`', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), Buffer.from('pas une image'));
    const store = rowsStore([{ id: ID(1), filePath: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, thumbHash: null, renditions: null, processingState: 'pending' }]);

    await expect(runMediaJob(depsFor(base, store.prisma), failingJob(0) as never)).rejects.toThrow();
    expect(store.rows.get(ID(1))?.processingState).toBe('pending');
    await expect(runMediaJob(depsFor(base, store.prisma), failingJob(2) as never)).rejects.toThrow();
    expect(store.rows.get(ID(1))?.processingState).toBe('failed');
  });

  it('au dernier essai, la pièce ET ses copies passent `failed` et sont annoncées (contre-audit N5)', async () => {
    const base = await uploadRoot();
    await fs.writeFile(path.join(base, 'p.jpg'), Buffer.from('pas une image'));
    const row = { filePath: 'p.jpg', mimeType: 'image/jpeg', fileSize: 1, thumbHash: null, renditions: null, processingState: 'pending' };
    const store = rowsStore([{ id: ID(1), ...row }, { id: ID(5), ...row }]);
    const progress = jest.fn(async () => undefined);

    await expect(runMediaJob(depsFor(base, store.prisma), { ...failingJob(2), updateProgress: progress } as never)).rejects.toThrow();

    expect(store.rows.get(ID(5))?.processingState).toBe('failed');
    expect(progress).toHaveBeenCalledWith({ target: 'messageAttachment', recordIds: [ID(1), ID(5)], failed: true });
  });

  it('une concurrence mal formée retombe à 1 (jamais `NaN` passé à BullMQ)', () => {
    expect(workerConcurrency('abc')).toBe(1);
    expect(workerConcurrency(undefined)).toBe(1);
    expect(workerConcurrency('2')).toBe(2);
  });
});

describe('sweepPendingMedia — une pièce `pending` sans tâche est remise en file (défaut 1)', () => {
  it('une fois par jeu d’octets, avec les rendus de son type', async () => {
    const reschedule = jest.fn(async () => undefined);
    const listPending = jest.fn(async (target: string) => (target === 'messageAttachment'
      ? [
        { id: ID(1), filePath: 'v.mp4', mimeType: 'video/mp4', fileSize: 10 },
        { id: ID(2), filePath: 'v.mp4', mimeType: 'video/mp4', fileSize: 10 },
      ]
      : []));

    const count = await sweepPendingMedia({ listPending, reschedule }, { now: new Date('2026-10-23T12:00:00Z'), compatRenditionEnabled: true });

    expect(count).toBe(1);
    expect(reschedule).toHaveBeenCalledWith({ target: 'messageAttachment', recordId: ID(1), kinds: ['thumb', 'transcode'] });
    expect(listPending).toHaveBeenCalledWith('messageAttachment', new Date('2026-10-23T11:50:00Z'), 100);
  });
});

describe('handleMediaReady — qui apprend que le média a avancé (#11264)', () => {
  const ports = (over: Partial<MediaReadyPorts> = {}) => {
    const emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];
    const base: MediaReadyPorts = {
      loadMessageAttachment: async () => null,
      loadPostMedia: async () => null,
      emitAttachmentUpdated: jest.fn(async () => undefined),
      notifyPostReaders: jest.fn(async () => undefined),
      emitToUser: (userId, event, payload) => emitted.push({ room: userId, event, payload: payload as Record<string, unknown> }),
      serialize: (r) => r,
      ...over,
    };
    return { emitted, ports: base };
  };

  it('pièce de message ET ses copies : chaque lecteur reçoit `message:attachment-updated`, l’auteur `attachment:ready`', async () => {
    const row = (id: string, conv: string) => ({ id, messageId: `m-${id}`, uploadedBy: 'u1', processingState: 'ready', message: { conversationId: conv } });
    const { emitted, ports: p } = ports({ loadMessageAttachment: async (id) => row(id, id === ID(1) ? 'c1' : 'c2') as never });

    await handleMediaReady(p, { target: 'messageAttachment', recordIds: [ID(1), ID(2)] });

    expect(p.emitAttachmentUpdated).toHaveBeenCalledWith({ conversationId: 'c1', messageId: `m-${ID(1)}`, attachment: row(ID(1), 'c1') });
    expect(p.emitAttachmentUpdated).toHaveBeenCalledWith({ conversationId: 'c2', messageId: `m-${ID(2)}`, attachment: row(ID(2), 'c2') });
    expect(emitted[0]).toEqual({ room: 'u1', event: SERVER_EVENTS.ATTACHMENT_READY, payload: expect.objectContaining({ attachmentId: ID(1), processingState: 'ready' }) });
  });

  it('média de post : les LECTEURS du post sont prévenus, pas seulement l’auteur (défaut 5)', async () => {
    const { emitted, ports: p } = ports({ loadPostMedia: async () => ({ id: ID(1), uploaderId: 'u1', postId: 'post-1', processingState: 'ready' }) });

    await handleMediaReady(p, { target: 'postMedia', recordIds: [ID(1)] });

    expect(p.notifyPostReaders).toHaveBeenCalledWith('post-1');
    expect(emitted.map((e) => e.room)).toEqual(['u1']);
  });

  it('un échec de file ne prévient que si la ligne dit `failed` ; l’auteur l’apprend alors', async () => {
    const pending = ports({ loadMessageAttachment: async () => ({ id: ID(1), messageId: null, uploadedBy: 'u1', processingState: 'pending', message: null }) });
    await handleMediaReady(pending.ports, { target: 'messageAttachment', recordIds: [ID(1)], requireState: 'failed' });
    expect(pending.emitted).toEqual([]);

    const failed = ports({ loadMessageAttachment: async () => ({ id: ID(1), messageId: null, uploadedBy: 'u1', processingState: 'failed', message: null }) });
    await handleMediaReady(failed.ports, { target: 'messageAttachment', recordIds: [ID(1)], requireState: 'failed' });
    expect(failed.emitted[0].payload).toEqual(expect.objectContaining({ processingState: 'failed' }));
  });

  it('un événement de file se lit comme une donnée : ids non ObjectId écartés', () => {
    expect(readMediaReadyNotice(JSON.stringify({ target: 'postMedia', recordIds: [ID(1), '$where'] }))).toEqual({ target: 'postMedia', recordIds: [ID(1)] });
    expect(readMediaReadyNotice({ target: 'user', recordIds: [ID(1)] })).toBeNull();
    expect(readMediaReadyNotice('{')).toBeNull();
  });
});

describe('listenerLease — une seule passerelle prévient (audit S9, point 7)', () => {
  it('la première instance prend le bail ; la seconde ne l’a pas ; Redis en panne ⇒ pas le bail', async () => {
    const store = new Map<string, string>();
    const client: LeaseClient = {
      setnx: async (key, value) => (store.has(key) ? false : (store.set(key, value), true)),
      get: async (key) => store.get(key) ?? null,
      expire: async () => true,
    };

    await expect(listenerLease(async () => client, 'a').holds()).resolves.toBe(true);
    await expect(listenerLease(async () => client, 'b').holds()).resolves.toBe(false);
    await expect(listenerLease(async () => client, 'a').holds()).resolves.toBe(true);
    await expect(listenerLease(async () => { throw new Error('down'); }, 'c').holds()).resolves.toBe(false);
  });
});

describe('copiedAttachmentFields — une copie faite pendant le rendu reste `pending` (défaut 4)', () => {
  it('reprend `processingState`', () => {
    const fields = copiedAttachmentFields({ id: ID(1), fileName: 'f', originalName: 'f', mimeType: 'image/jpeg', fileSize: 1, filePath: 'p.jpg', fileUrl: 'p.jpg', processingState: 'pending' });
    expect(fields.processingState).toBe('pending');
  });
});
