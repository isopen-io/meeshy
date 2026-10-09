import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';

import { pendingAttachmentOf } from './attachments';
import { createOutboxStore } from './outbox-store';
import { performSend, type SendDeps } from './perform-send';

/**
 * L'ORDRE DU COMPOSEUR VOYAGE JUSQU'À LA PASSERELLE (#9776) — la passerelle
 * fixe le rang de chaque pièce sur l'ordre de `attachmentIds`. Le client doit
 * donc téléverser les fichiers dans l'ordre composé, et envoyer les ids dans
 * l'ordre où l'upload les rend (un lot multipart traité en séquence).
 */
function routedFetch(routes: Readonly<Record<string, { readonly status: number; readonly body?: unknown }>>) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const path = Object.keys(routes).find((p) => url.includes(p));
    const response = path === undefined ? { status: 404 } : routes[path]!;
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { impl, calls };
}

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

const uploaded = (id: string, name: string) => ({
  id, messageId: '', fileName: name, originalName: name, mimeType: 'image/png', fileSize: 3, fileUrl: `https://x/${name}`,
});

describe('performSend — l’ordre des pièces (#9776)', () => {
  test('les fichiers partent dans l’ordre composé, et les ids dans l’ordre rendu par l’upload', async () => {
    const { impl, calls } = routedFetch({
      '/attachments/upload': {
        status: 200,
        body: { success: true, data: { attachments: [uploaded('att-prisme', 'prisme.png'), uploaded('att-bulle', 'bulle.png'), uploaded('att-neon', 'neon.png')] } },
      },
      '/conversations/c-a/messages': {
        status: 200,
        body: { success: true, data: { id: 'm9', clientMessageId: 'x', conversationId: 'c-a', senderId: 'u-viewer', createdAt: '2026-10-09T10:00:00.000Z' } },
      },
    });
    const deps: SendDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      queryClient: new QueryClient(),
      outbox: createOutboxStore(),
      online: true,
    };

    await performSend({
      conversationId: 'c-a',
      draft: {
        content: '',
        originalLanguage: 'fr',
        attachments: [pendingAttachmentOf(png('prisme.png')), pendingAttachmentOf(png('bulle.png')), pendingAttachmentOf(png('neon.png'))],
      },
      viewerId: 'u-viewer',
      deps,
    });

    const form = calls[0]?.init.body as FormData;
    expect(form.getAll('files').map((file) => (file as File).name)).toEqual(['prisme.png', 'bulle.png', 'neon.png']);
    const sentBody = JSON.parse(String(calls[1]?.init.body));
    expect(sentBody.attachmentIds).toEqual(['att-prisme', 'att-bulle', 'att-neon']);
  });
});
