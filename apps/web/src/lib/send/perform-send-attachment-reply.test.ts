import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import type { Message } from '@/lib/api/types';

import { withAttachmentReply } from './attachment-reply';
import { createOutboxStore } from './outbox-store';
import { performSend, type SendDeps } from './perform-send';

/**
 * **RÉPONDRE À UNE PIÈCE DEPUIS LA VISIONNEUSE (#6303)** — la réponse part avec
 * `replyToId` ET la pièce nommée (`attachmentReplyTo: { attachmentId }`,
 * `messages-send.ts:70`), relue sur le message cité : la bande du composeur et
 * la bulle optimiste montrent la même pièce que celle que le serveur range.
 */
function capturingFetch() {
  const bodies: unknown[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/messages') && typeof init?.body === 'string') bodies.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        success: true,
        data: { id: 'm9', clientMessageId: 'ignored', conversationId: 'c-a', senderId: 'u-viewer', createdAt: '2026-09-26T10:00:00.000Z' },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { impl, bodies };
}

const depsOf = (impl: typeof fetch): SendDeps => ({
  source: 'gateway',
  transport: createHttpTransport({ base: '', fetchImpl: impl }),
  queryClient: new QueryClient(),
  outbox: createOutboxStore(),
  online: true,
});

const quoted = {
  id: '65f0a1b2c3d4e5f6a7b8c9d0',
  conversationId: 'c-a',
  attachments: [{ id: '65f0a1b2c3d4e5f6a7b8c9d1' }, { id: '65f0a1b2c3d4e5f6a7b8c9d2' }],
} as unknown as Message;

describe('la réponse à une pièce nomme la pièce (#6303)', () => {
  test('`attachmentReplyTo` part dans le corps, à côté de `replyToId`', async () => {
    const { impl, bodies } = capturingFetch();
    const replyTo = withAttachmentReply(quoted, '65f0a1b2c3d4e5f6a7b8c9d2');
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'celle-ci !', originalLanguage: 'fr', replyToId: quoted.id, replyTo },
      viewerId: 'u-viewer',
      deps: depsOf(impl),
    });
    expect(bodies[0]).toMatchObject({ replyToId: quoted.id, attachmentReplyTo: { attachmentId: '65f0a1b2c3d4e5f6a7b8c9d2' } });
  });

  test('une réponse au message seul n’envoie aucune pièce', async () => {
    const { impl, bodies } = capturingFetch();
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'ok', originalLanguage: 'fr', replyToId: quoted.id, replyTo: quoted },
      viewerId: 'u-viewer',
      deps: depsOf(impl),
    });
    expect('attachmentReplyTo' in (bodies[0] as object)).toBe(false);
  });
});
