import { QueryClient } from '@tanstack/react-query';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { createHttpTransport, type ApiResult, type HttpRequest, type HttpTransport } from '@/lib/api/http';
import { createImagePreparer } from '@/lib/media/prepare-image-upload';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { pendingAttachmentOf } from './attachments';
import { createOutboxStore } from './outbox-store';
import { performSend } from './perform-send';
import { createSendSheetPorts } from './send-sheet-ports';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * LES PIÈCES D'UN MESSAGE PARTENT PRÉPARÉES (#11310) — par le fil comme par la
 * feuille d'envoi, la photo qui atteint `POST attachments.upload` est celle que
 * le préparateur a rendue (WebP 0,85, EXIF retiré), jamais l'original. Le
 * worker est remplacé par un port qui rend un WebP : on observe le FICHIER qui
 * part sur le réseau.
 */

const photo = (name: string): File => new File([new Uint8Array(64)], name, { type: 'image/jpeg' });

const recompressing = () => createImagePreparer(() => Promise.resolve(new Blob([new Uint8Array(8)], { type: 'image/webp' })));

const uploaded = (id: string) => ({ id, messageId: '', fileName: `${id}.webp`, originalName: `${id}.webp`, mimeType: 'image/webp', fileSize: 8, fileUrl: `https://x/${id}` });

describe('les pièces du fil (performSend)', () => {
  test('la photo téléversée est la version préparée, dans l’ordre composé', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      const body = String(input).includes('/attachments/upload')
        ? { success: true, data: { attachments: [uploaded('a1'), uploaded('a2')] } }
        : { success: true, data: { id: 'm1', clientMessageId: 'x', conversationId: 'c-a', senderId: 'u', createdAt: '2026-10-20T10:00:00.000Z' } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', attachments: [pendingAttachmentOf(photo('IMG_1.JPG')), pendingAttachmentOf(photo('IMG_2.jpeg'))] },
      viewerId: 'u',
      deps: {
        source: 'gateway',
        transport: createHttpTransport({ base: '', fetchImpl }),
        queryClient: new QueryClient(),
        outbox: createOutboxStore(),
        online: true,
        prepare: recompressing(),
      },
    });

    const files = (calls[0]?.body as FormData).getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type, file.size])).toEqual([
      ['IMG_1.webp', 'image/webp', 8],
      ['IMG_2.webp', 'image/webp', 8],
    ]);
  });
});

describe('les pièces de la feuille d’envoi (uploadFiles)', () => {
  test('la photo téléversée est la version préparée', async () => {
    const requests: HttpRequest[] = [];
    const transport = {
      request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
        requests.push(request);
        return { ok: true, data: { attachments: [{ id: 'att-1' }] } } as ApiResult<T>;
      },
    } as unknown as HttpTransport;
    const deps: ConversationsDeps = { source: 'gateway', transport };
    const ports = createSendSheetPorts({ language: 'fr', deps, prepare: recompressing() });

    expect(await ports.uploadFiles([photo('IMG_3.jpg')])).toEqual({ ok: true, data: { attachmentIds: ['att-1'] } });
    const files = (requests[0]?.body as FormData).getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([['IMG_3.webp', 'image/webp']]);
  });
});
