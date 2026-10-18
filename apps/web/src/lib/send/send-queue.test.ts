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
  return { entries: planned.entries, payload, language: 'fr', labels: Object.fromEntries(planned.entries.map((e) => [e.key, e.key])) };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('la file d’envoi', () => {
  test('en ligne : l’envoi part, puis quitte le stockage', async () => {
    const net = { online: true };
    const log: string[] = [];
    const storage = memorySendQueueStorage();
    const queue = createSendQueue({ storage, portsFor: async () => fakePorts(net, log) });
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
    const queue = createSendQueue({ storage, portsFor: async () => fakePorts(net, log) });
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
    const queue = createSendQueue({ storage: memorySendQueueStorage(), portsFor: async () => ports });
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
    const first = createSendQueue({ storage, portsFor: async () => fakePorts(net, before) });
    first.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, before));
    await settle();
    await settle();

    net.online = true;
    const after: string[] = [];
    const reopened = createSendQueue({ storage, portsFor: async () => fakePorts(net, after) });
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
    const queue = createSendQueue({ storage: broken, portsFor: async () => fakePorts(net, log) });
    await queue.resume();
    queue.submit(jobOf(text('Salut'), [conversation('c1')]), fakePorts(net, log));
    await settle();
    expect(log).toHaveLength(1);
  });
});
