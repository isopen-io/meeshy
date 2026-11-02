/**
 * Sans worker qui bat, la file allumée ne rend plus les grands médias DANS la
 * requête (#13984) : la ligne naît `pending`, la réponse part, et la passerelle
 * rend ensuite, en tâche de fond, par la même fabrique que le worker. Avec un
 * worker vivant, rien ne change : la tâche part en file.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { MediaJob } from '../jobs';
import type { MediaJobQueue } from '../queue';
import { planDeferral, scheduleDeferred } from '../dispatch';
import { localMediaRenderer, type LocalRenderPorts } from '../local-render';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const BIG_PHOTO = { attachmentType: 'image', fileSize: 3 * 1024 * 1024, compatRenditionEnabled: false } as const;
const SMALL_PHOTO = { attachmentType: 'image', fileSize: 500 * 1024, compatRenditionEnabled: false } as const;
const JOB: MediaJob = { target: 'messageAttachment', recordId: ID, kinds: ['thumb'] };

const queueWith = (alive: boolean): MediaJobQueue & { readonly jobs: MediaJob[] } => {
  const jobs: MediaJob[] = [];
  return { jobs, workerAlive: async () => alive, schedule: async (job) => { jobs.push(job); } };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

function recordingPorts(over: Partial<LocalRenderPorts> = {}) {
  const calls: string[] = [];
  const ports: LocalRenderPorts = {
    render: async (job) => { calls.push(`render:${job.recordId}`); return [job.recordId, 'copie']; },
    fail: async (job) => { calls.push(`fail:${job.recordId}`); return [job.recordId]; },
    notify: async (_job, ids) => { calls.push(`notify:${ids.join('+')}`); },
    ...over,
  };
  return { calls, ports };
}

describe('planDeferral — qui rend un grand média, et quand', () => {
  it('un worker bat : la file, jamais la passerelle', async () => {
    const local = jest.fn();
    await expect(planDeferral(queueWith(true), local, BIG_PHOTO)).resolves.toEqual({ kinds: ['thumb'], local: null });
  });

  it('aucun worker ne bat : la passerelle rend après la réponse', async () => {
    const local = jest.fn();
    await expect(planDeferral(queueWith(false), local, BIG_PHOTO)).resolves.toEqual({ kinds: ['thumb'], local });
  });

  it('aucun worker et aucun rendu de fond disponible : tout reste dans la requête, comme avant', async () => {
    await expect(planDeferral(queueWith(false), null, BIG_PHOTO)).resolves.toEqual({ kinds: [], local: null });
  });

  it('file éteinte (production, retour arrière) : tout reste dans la requête', async () => {
    await expect(planDeferral(null, jest.fn(), BIG_PHOTO)).resolves.toEqual({ kinds: [], local: null });
  });

  it('une photo de moins de 2 Mo garde sa vignette dans la réponse : un ancien client l’y attend', async () => {
    await expect(planDeferral(queueWith(false), jest.fn(), SMALL_PHOTO)).resolves.toEqual({ kinds: [], local: null });
  });
});

describe('scheduleDeferred — le rendu de fond ne passe pas par la file', () => {
  it('confie la tâche au rendu de fond, sans rien mettre en file', async () => {
    const queue = queueWith(false);
    const local = jest.fn();
    await expect(scheduleDeferred({ queue, local, target: 'messageAttachment', recordId: ID, kinds: ['thumb'] })).resolves.toBe('rendering-in-gateway');
    expect(local).toHaveBeenCalledWith(JOB);
    expect(queue.jobs).toEqual([]);
  });

  it('sans rendu de fond : la file, comme avant', async () => {
    const queue = queueWith(true);
    await expect(scheduleDeferred({ queue, target: 'messageAttachment', recordId: ID, kinds: ['thumb'] })).resolves.toBe('scheduled');
    expect(queue.jobs).toEqual([JOB]);
  });
});

describe('localMediaRenderer — rendre APRÈS la réponse, prévenir, ne jamais lever', () => {
  it('ne rend rien pendant l’appel : le rendu commence après que la requête a rendu la main', async () => {
    const { calls, ports } = recordingPorts();
    localMediaRenderer(ports)(JOB);
    expect(calls).toEqual([]);
    await flush();
    await flush();
    expect(calls).toEqual([`render:${ID}`, `notify:${ID}+copie`]);
  });

  it('un rendu raté passe la pièce `failed` et le dit, jamais `pending` pour toujours', async () => {
    const { calls, ports } = recordingPorts({ render: async () => { throw new Error('sharp'); } });
    localMediaRenderer(ports)(JOB);
    await flush();
    await flush();
    await flush();
    expect(calls).toEqual([`fail:${ID}`, `notify:${ID}`]);
  });

  it('une pièce disparue pendant le rendu ne prévient personne', async () => {
    const { calls, ports } = recordingPorts({ render: async () => [] });
    localMediaRenderer(ports)(JOB);
    await flush();
    await flush();
    expect(calls).toEqual([]);
  });

  it('une annonce qui lève ne remonte jamais au processus', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const { ports } = recordingPorts({ notify: async () => { throw new Error('socket'); }, fail: async () => { throw new Error('mongo'); } });
    localMediaRenderer(ports)(JOB);
    localMediaRenderer({ ...ports, render: async () => { throw new Error('sharp'); } })(JOB);
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
