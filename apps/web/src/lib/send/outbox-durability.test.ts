import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import type { ImagePreparer } from '@/lib/media/prepare-image-upload';

import { pendingAttachmentOf } from './attachments';
import { memoryDeviceRecords } from './device-records';
import { createOutboxDurability, outboxRecordKey } from './outbox-durability';
import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, type SendDeps } from './perform-send';

/**
 * #14698 — on compose et envoie d'autres messages pendant qu'une pièce jointe
 * se téléverse, en ligne comme hors ligne (jumelle web de #14696).
 */

type Gate = { readonly release: () => void };

function gatedFetch() {
  const calls: { readonly url: string; readonly body: unknown }[] = [];
  const gates: Gate[] = [];
  let counter = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ url, body });
    if (url.includes('/attachments/upload')) {
      await new Promise<void>((resolve) => gates.push({ release: resolve }));
      return new Response(
        JSON.stringify({ success: true, data: { attachments: [{ id: 'att-video', messageId: '', fileName: 'v.mp4', originalName: 'v.mp4', mimeType: 'video/mp4', fileSize: 3, fileUrl: 'https://x/v.mp4' }] } }),
        { status: 200 },
      );
    }
    counter += 1;
    const sent = body as { readonly clientMessageId: string };
    return new Response(
      JSON.stringify({ success: true, data: { id: `srv-${counter}`, clientMessageId: sent.clientMessageId, conversationId: 'c-a', senderId: 'u-viewer', createdAt: '2026-11-03T10:00:00.000Z' } }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { impl, calls, gates };
}

const passThrough: ImagePreparer = {
  prepare: async (file) => file,
  transcode: async () => null,
  prepareUploads: async (pending) => pending,
};

const video = () => new File([new Uint8Array([1, 2, 3])], 'v.mp4', { type: 'video/mp4' });

const depsOf = (impl: typeof fetch, outbox = createOutboxStore(), online = true): SendDeps => ({
  source: 'gateway',
  transport: createHttpTransport({ base: '', fetchImpl: impl }),
  queryClient: new QueryClient(),
  outbox,
  online,
  prepare: passThrough,
});

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const messagePosts = (calls: readonly { readonly url: string; readonly body: unknown }[]) =>
  calls.filter((call) => call.url.includes('/conversations/c-a/messages')).map((call) => call.body as { readonly clientMessageId: string; readonly content?: string });

describe('un second envoi pendant un téléversement (#14698)', () => {
  test('le texte part pendant que la vidéo se téléverse, et la vidéo arrive ensuite avec sa pièce', async () => {
    const { impl, calls, gates } = gatedFetch();
    const deps = depsOf(impl);

    const first = performSend({ conversationId: 'c-a', draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(video())] }, viewerId: 'u-viewer', deps });
    await flushMicrotasks();
    expect(gates).toHaveLength(1);

    await performSend({ conversationId: 'c-a', draft: { content: 'pendant ce temps', originalLanguage: 'fr' }, viewerId: 'u-viewer', deps });

    expect(messagePosts(calls).map((post) => post.content)).toEqual(['pendant ce temps']);
    const stillUploading = entriesOf(deps.outbox.getState(), 'c-a');
    expect(stillUploading).toHaveLength(1);
    expect(stillUploading[0]?.delivery).toBe('pending');
    expect(stillUploading[0]?.upload?.files).toHaveLength(1);

    gates[0]?.release();
    await first;

    const posts = messagePosts(calls);
    expect(posts).toHaveLength(2);
    expect((posts[1] as { readonly attachmentIds?: readonly string[] }).attachmentIds).toEqual(['att-video']);
    expect(entriesOf(deps.outbox.getState(), 'c-a')).toHaveLength(0);
  });
});

describe('hors ligne, la file est durable et part dans l’ordre au retour du réseau (#14698)', () => {
  test('au retour du réseau, les envois en file partent en FIFO sous leur MÊME clientMessageId', async () => {
    const { impl, calls, gates } = gatedFetch();
    const outbox = createOutboxStore();
    const offline = depsOf(impl, outbox, false);

    await performSend({ conversationId: 'c-a', draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(video())] }, viewerId: 'u-viewer', deps: { ...offline, now: () => 1 } });
    await performSend({ conversationId: 'c-b', draft: { content: 'deuxième', originalLanguage: 'fr' }, viewerId: 'u-viewer', deps: { ...offline, now: () => 2 } });
    await performSend({ conversationId: 'c-a', draft: { content: 'troisième', originalLanguage: 'fr' }, viewerId: 'u-viewer', deps: { ...offline, now: () => 3 } });
    expect(calls).toHaveLength(0);
    const queuedIds = [
      entriesOf(outbox.getState(), 'c-a')[0]!.message.clientMessageId,
      entriesOf(outbox.getState(), 'c-b')[0]!.message.clientMessageId,
      entriesOf(outbox.getState(), 'c-a')[1]!.message.clientMessageId,
    ];

    const durability = createOutboxDurability({ outbox, records: memoryDeviceRecords(), activeViewer: () => 'u-viewer', deps: () => depsOf(impl, outbox, true) });
    const flushing = durability.flush();
    await flushMicrotasks();
    gates[0]?.release();
    await flushing;

    const sentIds = calls.filter((call) => call.url.includes('/messages')).map((call) => (call.body as { readonly clientMessageId: string }).clientMessageId);
    expect(sentIds).toEqual(queuedIds);
    expect(Object.keys(outbox.getState().entries)).toEqual([]);
  });

  test('un envoi refusé pour de bon n’est pas rejoué tout seul : il garde son « Réessayer »', async () => {
    const { impl, calls } = gatedFetch();
    const outbox = createOutboxStore();
    await performSend({ conversationId: 'c-a', draft: { content: 'refusé', originalLanguage: 'fr' }, viewerId: 'u-viewer', deps: depsOf(impl, outbox, false) });
    const id = entriesOf(outbox.getState(), 'c-a')[0]!.message.clientMessageId;
    outbox.getState().markFailed('c-a', id, { ok: false, status: 403, error: 'interdit' });

    await createOutboxDurability({ outbox, records: memoryDeviceRecords(), activeViewer: () => 'u-viewer', deps: () => depsOf(impl, outbox, true) }).flush();

    expect(calls).toHaveLength(0);
    expect(entriesOf(outbox.getState(), 'c-a')[0]?.delivery).toBe('failed');
  });

  test('la file survit au redémarrage : relue pour son compte, la pièce et son aperçu reviennent, puis elle part', async () => {
    const { impl, calls, gates } = gatedFetch();
    const records = memoryDeviceRecords();
    const before = createOutboxStore();
    const writer = createOutboxDurability({ outbox: before, records, activeViewer: () => 'u-viewer', deps: () => depsOf(impl, before, false) });
    await writer.start();
    await performSend({ conversationId: 'c-a', draft: { content: 'avec vidéo', originalLanguage: 'fr', attachments: [pendingAttachmentOf(video())] }, viewerId: 'u-viewer', deps: depsOf(impl, before, false) });
    await writer.settled();
    const queuedId = entriesOf(before.getState(), 'c-a')[0]!.message.clientMessageId;

    const after = createOutboxStore();
    const reader = createOutboxDurability({ outbox: after, records, activeViewer: () => 'u-viewer', deps: () => depsOf(impl, after, true) });
    const starting = reader.start();
    await flushMicrotasks();
    const restored = entriesOf(after.getState(), 'c-a');
    expect(restored.map((entry) => entry.message.clientMessageId)).toEqual([queuedId]);
    expect(restored[0]?.upload?.files[0]?.file.name).toBe('v.mp4');
    expect(restored[0]?.message.attachments?.[0]?.fileUrl.startsWith('blob:')).toBe(true);

    gates[0]?.release();
    await starting;
    await reader.settled();
    expect(messagePosts(calls).map((post) => post.clientMessageId)).toEqual([queuedId]);
    expect(await records.load(outboxRecordKey('u-viewer'))).toBeUndefined();
  });

  test('la file d’un autre compte ne se relit pas, et changer de compte n’efface pas celle du premier', async () => {
    const records = memoryDeviceRecords();
    const { impl } = gatedFetch();
    let viewer = 'u-a';
    const outbox = createOutboxStore();
    const durability = createOutboxDurability({ outbox, records, activeViewer: () => viewer, deps: () => depsOf(impl, outbox, false) });
    await durability.start();
    await performSend({ conversationId: 'c-a', draft: { content: 'de A', originalLanguage: 'fr' }, viewerId: 'u-a', deps: depsOf(impl, outbox, false) });
    await durability.settled();

    viewer = 'u-b';
    outbox.setState({ entries: {}, confirmed: {} });
    await durability.start();
    await durability.settled();

    expect(outbox.getState().entries).toEqual({});
    const stored = (await records.load(outboxRecordKey('u-a'))) as Record<string, readonly unknown[]> | undefined;
    expect(stored?.['c-a']).toHaveLength(1);
  });
});
