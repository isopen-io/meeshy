import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { SentMessageAck } from '@/lib/api/messages';
import { fakeIndexedDb } from '@/lib/share-incoming/idb-double';

import { createSendQueue, idbSendQueueStorage, memorySendQueueStorage } from './send-queue';
import { planSend, type SendPayload, type SendTarget } from './send-sheet-plan';
import type { SendSheetPorts } from './send-sheet-run';

/**
 * LA FILE D'ENVOI DURABLE (#10948, V6) — l'envoi survit à la feuille, au
 * réseau et à la fermeture de l'application, et part dans l'ordre.
 */
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });

function fakePorts(net: { online: boolean }, log: string[]): SendSheetPorts {
  let cid = 0;
  const unused = async (): Promise<never> => Promise.reject(new Error('non utilisé'));
  return {
    online: () => net.online,
    openDirect: async (userId) => ok({ id: `dm-${userId}` }),
    openGroup: unused,
    forward: async (p) => (log.push(`forward→${p.targetConversationId}`), { ok: true, count: p.messages.length }),
    sendMessage: async (p) => (log.push(`send→${p.conversationId}:${p.body.content ?? ''}:${p.body.clientMessageId}`), ok<SentMessageAck>({ id: `m${log.length}`, conversationId: p.conversationId, createdAt: 'x' })),
    uploadFiles: unused,
    fetchFile: unused,
    uploadMedia: unused,
    publishMedia: unused,
    publishFromAttachment: unused,
    repost: unused,
    createTextPost: unused,
    newClientMessageId: () => `cid-${(cid += 1)}`,
  };
}

const conversation = (id: string): SendTarget => ({ kind: 'conversation', conversationId: id, label: id });
const text = (body: string): SendPayload => ({ kind: 'text', text: body });

const jobOf = (payload: SendPayload, targets: readonly SendTarget[]) => {
  const planned = planSend({ payload, targets, caption: '', viewerId: 'me' });
  if (!planned.ok) throw new Error('plan');
  return { entries: planned.entries, payload, language: 'fr', viewerId: 'me', labels: Object.fromEntries(planned.entries.map((e) => [e.key, e.key])) };
};

const asViewer = (viewer: { id: string | null }) => () => viewer.id;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('la file d’envoi', () => {
  test('en ligne : l’envoi part, puis quitte le stockage', async () => {
    const net = { online: true };
    const log: string[] = [];
    const storage = memorySendQueueStorage();
    const queue = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts(net, log) });
    const queued = queue.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, log));
    await settle();
    expect(queued.run.getState().statuses['conversation:c1']).toEqual({ state: 'sent', conversationId: 'c1' });
    await settle();
    expect(storage.current()).toEqual([]);
  });

  test('hors ligne : rien n’est refusé, l’envoi est GARDÉ, puis part au retour du réseau', async () => {
    const net = { online: false };
    const log: string[] = [];
    const storage = memorySendQueueStorage();
    const queue = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts(net, log) });
    const queued = queue.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, log));
    await settle();
    expect(queued.run.getState().statuses['conversation:c1']).toEqual({ state: 'queued' });
    expect(storage.current()).toHaveLength(1);
    net.online = true;
    await queue.flush();
    expect(log).toEqual(['send→c1:Salut:cid-1']);
    await settle();
    expect(storage.current()).toEqual([]);
  });

  test('FIFO : deux envois en attente partent dans l’ordre où ils ont été faits', async () => {
    const net = { online: false };
    const log: string[] = [];
    const ports = fakePorts(net, log);
    const queue = createSendQueue({ activeViewer: () => 'me', storage: memorySendQueueStorage(), portsFor: async () => ports });
    queue.submit(jobOf(text('premier'), [conversation('c1')]), ports);
    queue.submit(jobOf(text('second'), [conversation('c2')]), ports);
    await settle();
    net.online = true;
    await queue.flush();
    expect(log.map((line) => line.split(':')[1])).toEqual(['premier', 'second']);
  });

  test('l’application fermée puis rouverte : l’envoi relu repart, sous le MÊME identifiant de message', async () => {
    const net = { online: false };
    const before: string[] = [];
    const storage = idbSendQueueStorage(fakeIndexedDb().factory);
    const first = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts(net, before) });
    first.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, before));
    await settle();
    await settle();

    net.online = true;
    const after: string[] = [];
    const reopened = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts(net, after) });
    await reopened.resume();
    expect(after).toEqual(['send→c1:Salut:cid-1']);
    expect(reopened.jobs()).toHaveLength(1);
    await settle();
    expect(await storage.load()).toEqual([]);
  });

  test('un stockage qui échoue n’empêche pas l’envoi', async () => {
    const net = { online: true };
    const log: string[] = [];
    const broken = { load: async () => Promise.reject(new Error('privé')), save: async () => Promise.reject(new Error('privé')) };
    const queue = createSendQueue({ activeViewer: () => 'me', storage: broken, portsFor: async () => fakePorts(net, log) });
    await queue.resume();
    queue.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, log));
    await settle();
    expect(log).toHaveLength(1);
  });
});

describe('un envoi en échec rejouable n’est jamais oublié', () => {
  const failedJob = (failure: object) => ({
    ...jobOf(text('Bonjour'), [conversation('c1')]),
    id: 'j1',
    createdAt: 1,
    snapshot: { statuses: { 'conversation:c1': { state: 'failed', failure } }, completed: {}, clientIds: { 'conversation:c1#0': 'cid-0' }, conversations: {}, uploads: {}, media: {} },
  });

  test('relu au lancement, un envoi en échec réseau REPART, sans attendre un évènement online', async () => {
    const log: string[] = [];
    const storage = memorySendQueueStorage([failedJob({ kind: 'network' })] as never);
    const queue = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts({ online: true }, log) });
    await queue.resume();
    expect(log).toEqual(['send→c1:Bonjour:cid-0']);
  });

  test('un refus définitif relu au lancement n’est PAS rejoué', async () => {
    const log: string[] = [];
    const storage = memorySendQueueStorage([failedJob({ kind: 'refused', status: 403, message: 'non' })] as never);
    const queue = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts({ online: true }, log) });
    await queue.resume();
    expect(log).toEqual([]);
  });

  test('en ligne mais injoignable : la file réessaie d’elle-même, à délai CROISSANT, puis se tait quand c’est parti', async () => {
    const log: string[] = [];
    const delays: number[] = [];
    const timers: (() => void)[] = [];
    let attempts = 0;
    const base = fakePorts({ online: true }, log);
    const ports: SendSheetPorts = {
      ...base,
      sendMessage: async (p) => ((attempts += 1) < 3 ? { ok: false, status: 0, error: 'injoignable', code: 'TIMEOUT' } : base.sendMessage(p)),
    };
    const queue = createSendQueue({
      activeViewer: () => 'me',
      storage: memorySendQueueStorage(),
      portsFor: async () => ports,
      schedule: (work, ms) => {
        delays.push(ms);
        timers.push(work);
      },
    });
    const queued = queue.submit(jobOf(text('Salut'), [conversation('c1')]), ports);
    await settle();
    await settle();
    expect(queued.run.getState().statuses['conversation:c1']).toEqual({ state: 'failed', failure: { kind: 'network' } });
    timers.shift()?.();
    await settle();
    await settle();
    timers.shift()?.();
    await settle();
    await settle();
    expect(queued.run.getState().statuses['conversation:c1']).toEqual({ state: 'sent', conversationId: 'c1' });
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0] ?? Infinity);
    expect(timers).toEqual([]);
  });
});

describe('un envoi appartient au compte qui l’a fait', () => {
  test('relu sous un AUTRE compte, il ne part pas — et repart quand son compte revient', async () => {
    const viewer = { id: 'other' as string | null };
    const log: string[] = [];
    const storage = memorySendQueueStorage([{ ...jobOf(text('de moi'), [conversation('c1')]), id: 'j1', createdAt: 1 }] as never);
    const queue = createSendQueue({ activeViewer: asViewer(viewer), storage, portsFor: async () => fakePorts({ online: true }, log) });
    await queue.resume();
    await queue.flush();
    expect(log).toEqual([]);
    expect(queue.jobs()).toEqual([]);
    expect(storage.current()).toHaveLength(1);
    viewer.id = 'me';
    await queue.flush();
    expect(log).toEqual(['send→c1:de moi:cid-1']);
  });

  test('un envoi de l’autre compte, en attente, n’est pas effacé par un envoi du compte actif', async () => {
    const log: string[] = [];
    const storage = memorySendQueueStorage([{ ...jobOf(text('de moi'), [conversation('c1')]), id: 'j1', createdAt: 1 }] as never);
    const queue = createSendQueue({ activeViewer: () => 'other', storage, portsFor: async () => fakePorts({ online: false }, log) });
    await queue.resume();
    queue.submit({ ...jobOf(text('de l’autre'), [conversation('c2')]), viewerId: 'other' }, fakePorts({ online: false }, log));
    await settle();
    expect(storage.current().map((row) => row.viewerId).sort()).toEqual(['me', 'other']);
  });

  test('oublier un compte efface ses envois de l’appareil, ceux des autres restent', async () => {
    const storage = memorySendQueueStorage([
      { ...jobOf(text('a'), [conversation('c1')]), id: 'j1', createdAt: 1 },
      { ...jobOf(text('b'), [conversation('c2')]), id: 'j2', createdAt: 2, viewerId: 'other' },
    ] as never);
    const queue = createSendQueue({ activeViewer: () => null, storage, portsFor: async () => fakePorts({ online: false }, []) });
    await queue.forget('me');
    expect(storage.current().map((row) => row.id)).toEqual(['j2']);
  });

  test('un envoi écrit sans compte (avant ce correctif) n’est jamais joué, et quitte l’appareil', async () => {
    const log: string[] = [];
    const job = jobOf(text('x'), [conversation('c1')]);
    const orphan = { id: 'j0', createdAt: 1, entries: job.entries, payload: job.payload, language: job.language, labels: job.labels };
    const storage = memorySendQueueStorage([orphan] as never);
    const queue = createSendQueue({ activeViewer: () => 'me', storage, portsFor: async () => fakePorts({ online: true }, log) });
    await queue.resume();
    await settle();
    expect(log).toEqual([]);
    expect(storage.current()).toEqual([]);
  });
});
