import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { stickerOf } from '@/lib/view/message-body';

import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, retrySend, type SendDeps } from './perform-send';

/**
 * **LE STICKER DE BIBLIOTHÈQUE VOYAGE (#7938)** — un sticker choisi dans « Mes
 * stickers » part comme l'image qu'il est ET avec son descripteur
 * `{ stickerId }`, dans le champ `sticker` DÉDIÉ du corps que la passerelle
 * valide seule (`parseMessageSticker`). La bulle optimiste le porte aussi :
 * sans lui, l'expéditeur verrait une photo dans une bulle là où tous les
 * autres voient un sticker nu.
 */
function capturingFetch(status = 200) {
  const bodies: unknown[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/messages') && typeof init?.body === 'string') {
      bodies.push(JSON.parse(init.body));
    }
    return new Response(
      status === 200
        ? JSON.stringify({
            success: true,
            data: {
              id: 'm9',
              clientMessageId: 'ignored',
              conversationId: 'c-a',
              senderId: 'u-viewer',
              createdAt: '2026-09-21T10:00:00.000Z',
            },
          })
        : null,
      { status },
    );
  }) as typeof fetch;
  return { impl, bodies };
}

const depsOf = (impl: typeof fetch, online = true): SendDeps => ({
  source: 'gateway',
  transport: createHttpTransport({ base: '', fetchImpl: impl }),
  queryClient: new QueryClient(),
  outbox: createOutboxStore(),
  online,
});

const STICKER = { stickerId: '65f0c0ffee0000000000abcd' } as const;

describe('le sticker de bibliothèque part avec le message (#7938)', () => {
  test('`sticker` est sur le corps du POST, et la bulle optimiste le rend en sticker', async () => {
    const { impl, bodies } = capturingFetch();
    const deps = depsOf(impl, false);
    await performSend({
      conversationId: 'c-a',
      draft: { content: '', originalLanguage: 'fr', sticker: STICKER },
      viewerId: 'u-viewer',
      deps,
    });

    const [entry] = entriesOf(deps.outbox.getState(), 'c-a');
    expect(entry && stickerOf(entry.message)).toEqual(STICKER);

    await retrySend({ conversationId: 'c-a', clientMessageId: entry!.message.clientMessageId, deps: { ...deps, online: true } });
    expect((bodies[0] as { sticker?: unknown }).sticker).toEqual(STICKER);
  });

  test('sans sticker, la clé est ABSENTE du corps', async () => {
    const { impl, bodies } = capturingFetch();
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'salut', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps: depsOf(impl),
    });
    expect('sticker' in (bodies[0] as object)).toBe(false);
  });
});
