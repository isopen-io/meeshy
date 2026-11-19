import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { isPermanentFailure } from '@/lib/api/outcome';
import type { ImagePreparer } from '@/lib/media/prepare-image-upload';

import { pendingAttachmentOf } from './attachments';
import { memoryDeviceRecords } from './device-records';
import { createOutboxDurability, outboxRecordKey } from './outbox-durability';
import { createOutboxStore, entriesOf, type OutboxEntry, type OutboxState } from './outbox-store';
import { performSend, retrySend, type SendDeps } from './perform-send';
import type { StoreApi } from 'zustand/vanilla';

/**
 * UNE PIÈCE JOINTE BALAYÉE NE BLOQUE PLUS SON ENVOI À VIE (#19865) — relevé
 * par l'audit adversarial de #19801 (constat A1).
 *
 * Le téléversement a RÉUSSI, le `POST …/messages` a ÉCHOUÉ : l'entrée garde
 * `upload.attachmentIds` dans une file DURABLE, et toute reprise les réutilise
 * (« aucune régénération au renvoi »). Passé 24 h, le balayage des orphelines a
 * supprimé la ligne et les octets — la passerelle refuse alors par un
 * `404 ATTACHMENT_NOT_FOUND`, et l'entrée ne pouvait plus JAMAIS aboutir alors
 * que le `File` d'origine dort encore dans IndexedDB.
 *
 * Les deux moitiés du correctif se testent ici parce qu'aucune ne suffit :
 * OUBLIER les ids (sans quoi la reprise redemande la pièce supprimée) et
 * RENDRE LA REPRISE OFFERTE (`isPermanentFailure`, sans quoi aucun bouton
 * « Réessayer » n'existe pour un 4xx).
 */

type Route = { readonly status: number; readonly body?: unknown };

function routedFetch(routes: Readonly<Record<string, Route | readonly Route[]>>) {
  const calls: { readonly url: string; readonly body: unknown }[] = [];
  const seen: Record<string, number> = {};
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
    const path = Object.keys(routes).find((p) => url.includes(p));
    if (path === undefined) return new Response(null, { status: 404 });
    const declared = routes[path]!;
    const nth = seen[path] ?? 0;
    seen[path] = nth + 1;
    const route = Array.isArray(declared) ? declared[Math.min(nth, declared.length - 1)]! : (declared as Route);
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status });
  }) as typeof fetch;
  return { impl, calls };
}

const passThrough: ImagePreparer = {
  prepare: async (file) => file,
  transcode: async () => null,
  prepareUploads: async (pending) => pending,
};

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

const uploaded = (id: string, name: string) => ({
  id, messageId: '', fileName: name, originalName: name, mimeType: 'image/png', fileSize: 3, fileUrl: `https://x/${name}`,
});

const uploadOf = (...pieces: readonly { readonly id: string; readonly name: string }[]): Route => ({
  status: 200,
  body: { success: true, data: { attachments: pieces.map((piece) => uploaded(piece.id, piece.name)) } },
});

const staleRefusal: Route = {
  status: 404,
  body: { success: false, error: 'Attachment not found', code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment att-1 not found' },
};

const accepted: Route = {
  status: 200,
  body: { success: true, data: { id: 'srv-1', clientMessageId: 'x', conversationId: 'c-a', senderId: 'u-viewer', createdAt: '2026-11-19T10:00:00.000Z' } },
};

const depsOf = (impl: typeof fetch, outbox: StoreApi<OutboxState>): SendDeps => ({
  source: 'gateway',
  transport: createHttpTransport({ base: '', fetchImpl: impl }),
  queryClient: new QueryClient(),
  outbox,
  online: true,
  prepare: passThrough,
});

const soleEntry = (outbox: StoreApi<OutboxState>): OutboxEntry | undefined =>
  entriesOf(outbox.getState(), 'c-a')[0];

const uploadCount = (calls: readonly { readonly url: string }[]) =>
  calls.filter((call) => call.url.includes('/attachments/upload')).length;

const sentIds = (calls: readonly { readonly url: string; readonly body: unknown }[]) =>
  calls
    .filter((call) => call.url.includes('/conversations/c-a/messages'))
    .map((call) => (call.body as { readonly attachmentIds?: readonly string[] }).attachmentIds);

describe('performSend — la pièce jointe que la passerelle ne trouve plus (#19865)', () => {
  test('le refus NOMMÉ fait oublier les ids, et offre la reprise', async () => {
    const { impl } = routedFetch({
      '/attachments/upload': uploadOf({ id: 'att-1', name: 'prisme.png' }),
      '/conversations/c-a/messages': staleRefusal,
    });
    const outbox = createOutboxStore();

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(png('prisme.png'))] },
      viewerId: 'u-viewer',
      deps: depsOf(impl, outbox),
    });

    const entry = soleEntry(outbox);
    expect(entry?.delivery).toBe('failed');
    /* L'id mémorisé désigne une ligne que le balayage a supprimée : le garder
       condamne toute reprise à redemander la même pièce. */
    expect(entry?.upload?.attachmentIds).toBeUndefined();
    /* Le `File` d'origine, lui, reste — c'est lui qui rend la reprise possible. */
    expect(entry?.upload?.files).toHaveLength(1);
    /* Et un 4xx sans cette distinction ne porte AUCUN bouton « Réessayer ». */
    expect(isPermanentFailure(entry?.lastError)).toBe(false);
  });

  test('la reprise re-téléverse depuis le fichier conservé, et l’envoi aboutit', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': [uploadOf({ id: 'att-1', name: 'prisme.png' }), uploadOf({ id: 'att-2', name: 'prisme.png' })],
      '/conversations/c-a/messages': [staleRefusal, accepted],
    });
    const outbox = createOutboxStore();
    const deps = depsOf(impl, outbox);

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(png('prisme.png'))] },
      viewerId: 'u-viewer',
      deps,
    });
    const clientMessageId = soleEntry(outbox)!.message.clientMessageId;

    await retrySend({ conversationId: 'c-a', clientMessageId, deps });

    expect(uploadCount(calls)).toBe(2);
    expect(sentIds(calls)).toEqual([['att-1'], ['att-2']]);
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
    expect(outbox.getState().confirmed['c-a']).toBe(1);
  });

  test('une entrée REVIVIFIÉE depuis IndexedDB se répare de la même façon', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': [uploadOf({ id: 'att-1', name: 'prisme.png' }), uploadOf({ id: 'att-2', name: 'prisme.png' })],
      '/conversations/c-a/messages': [staleRefusal, accepted],
    });
    const records = memoryDeviceRecords();
    const first = createOutboxStore();
    const firstDeps = depsOf(impl, first);
    const durability = createOutboxDurability({
      outbox: first,
      records,
      activeViewer: () => 'u-viewer',
      deps: () => firstDeps,
    });
    await durability.start();

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(png('prisme.png'))] },
      viewerId: 'u-viewer',
      deps: firstDeps,
    });
    await durability.settled();

    /* L'onglet se ferme et revient : la file se relit depuis l'appareil. */
    const stored = await records.load(outboxRecordKey('u-viewer'));
    expect(stored).toBeDefined();
    const second = createOutboxStore();
    const secondDeps = depsOf(impl, second);
    await createOutboxDurability({
      outbox: second,
      records,
      activeViewer: () => 'u-viewer',
      deps: () => secondDeps,
    }).start();

    const revived = soleEntry(second);
    expect(revived?.upload?.attachmentIds).toBeUndefined();
    expect(revived?.upload?.files).toHaveLength(1);

    await retrySend({ conversationId: 'c-a', clientMessageId: revived!.message.clientMessageId, deps: secondDeps });

    expect(uploadCount(calls)).toBe(2);
    expect(entriesOf(second.getState(), 'c-a')).toHaveLength(0);
  });

  test('un lot PARTIEL — une seule pièce balayée — re-téléverse les DEUX, puisque le refus porte sur l’envoi entier', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': [
        uploadOf({ id: 'att-1', name: 'prisme.png' }, { id: 'att-2', name: 'bulle.png' }),
        uploadOf({ id: 'att-3', name: 'prisme.png' }, { id: 'att-4', name: 'bulle.png' }),
      ],
      '/conversations/c-a/messages': [staleRefusal, accepted],
    });
    const outbox = createOutboxStore();
    const deps = depsOf(impl, outbox);

    await performSend({
      conversationId: 'c-a',
      draft: {
        content: '',
        originalLanguage: 'fr',
        attachments: [pendingAttachmentOf(png('prisme.png')), pendingAttachmentOf(png('bulle.png'))],
      },
      viewerId: 'u-viewer',
      deps,
    });
    expect(soleEntry(outbox)?.upload?.attachmentIds).toBeUndefined();

    await retrySend({ conversationId: 'c-a', clientMessageId: soleEntry(outbox)!.message.clientMessageId, deps });

    expect(sentIds(calls)).toEqual([['att-1', 'att-2'], ['att-3', 'att-4']]);
    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
  });

  test('un refus de DROIT garde les ids : re-téléverser ne changerait rien', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': uploadOf({ id: 'att-1', name: 'prisme.png' }),
      '/conversations/c-a/messages': {
        status: 403,
        body: { success: false, error: 'refusé', code: 'ATTACHMENT_RIGHT_NOT_PERMITTED' },
      },
    });
    const outbox = createOutboxStore();
    const deps = depsOf(impl, outbox);

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(png('prisme.png'))] },
      viewerId: 'u-viewer',
      deps,
    });

    const entry = soleEntry(outbox);
    expect(entry?.upload?.attachmentIds).toEqual(['att-1']);
    expect(isPermanentFailure(entry?.lastError)).toBe(true);
    expect(uploadCount(calls)).toBe(1);
  });
});
