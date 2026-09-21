import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';

import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, retrySend, type SendDeps } from './perform-send';

/**
 * **LE LIEU VOYAGE (#7280)** — la tuile « Position » attache un lieu au
 * composeur ; ce témoin mesure qu'il ATTEINT le corps du POST.
 *
 * C'est la question du cycle 122 du `CLAUDE.md` racine posée à un lot de
 * composition : « qui AFFICHE — ici, qui REÇOIT — ce que ce contrôle
 * produit ? ». Une tuile qui pose un lieu dans un état local que rien n'envoie
 * serait le contrôle inerte de la loi 4, avec en prime la puce « LIEU » qui
 * affirme le contraire.
 *
 * La FORME est celle de la passerelle : un champ `location` DÉDIÉ sur le
 * corps, jamais un `metadata` brut (`MessageRequest.location`,
 * `packages/shared/types/messaging.ts:171-175` ; `parseSharedPlace`,
 * `services/gateway/src/services/location/sharedPlace.ts`).
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

const PARIS = { latitude: 48.8566, longitude: 2.3522 } as const;

describe('le lieu attaché part avec le message (#7280)', () => {
  test('`location` est sur le corps du POST, à sa forme de passerelle', async () => {
    const { impl, bodies } = capturingFetch();
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'je suis là', originalLanguage: 'fr', place: PARIS },
      viewerId: 'u-viewer',
      deps: depsOf(impl),
    });
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { location?: unknown }).location).toEqual(PARIS);
  });

  /** AUCUNE CLÉ À SA VALEUR PAR DÉFAUT — la même discipline que
   * `content`/`replyToId`/la protection : un envoi sans lieu ne porte pas la
   * clé, jamais `location: null`. */
  test('sans lieu, la clé est ABSENTE du corps', async () => {
    const { impl, bodies } = capturingFetch();
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'sans lieu', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps: depsOf(impl),
    });
    expect(Object.hasOwn(bodies[0] as object, 'location')).toBe(false);
  });

  /**
   * LA REPRISE NE PERD PAS LE LIEU — `retrySend` relit l'entrée d'outbox,
   * jamais le composeur (qui a déjà été vidé). Un lieu qui ne survit pas au
   * premier échec réseau disparaîtrait sans un mot, exactement comme la pièce
   * jointe amputée que `uploadPhase` refuse.
   */
  test('un renvoi après échec porte le MÊME lieu', async () => {
    const failing = capturingFetch(500);
    const deps = depsOf(failing.impl);
    await performSend({
      conversationId: 'c-a',
      /* UN TEXTE PROPRE À CE CAS — la carte de dédoublonnage de `performSend`
         est un état de MODULE : réutiliser le texte d'un cas précédent ferait
         sauter cet envoi en silence, et le témoin mesurerait le débounce au
         lieu de la reprise. */
      draft: { content: 'je suis là, renvoi', originalLanguage: 'fr', place: PARIS },
      viewerId: 'u-viewer',
      deps,
    });
    const entry = entriesOf(deps.outbox.getState(), 'c-a')[0];
    expect(entry?.delivery).toBe('failed');

    const retried = capturingFetch();
    await retrySend({
      conversationId: 'c-a',
      clientMessageId: entry?.message.clientMessageId ?? '',
      deps: { ...deps, transport: createHttpTransport({ base: '', fetchImpl: retried.impl }) },
    });
    expect((retried.bodies[0] as { location?: unknown }).location).toEqual(PARIS);
  });

  test('hors ligne, le lieu attend dans l’outbox avec son message', async () => {
    const { impl } = capturingFetch();
    const deps = depsOf(impl, false);
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'plus tard', originalLanguage: 'fr', place: PARIS },
      viewerId: 'u-viewer',
      deps,
    });
    expect(entriesOf(deps.outbox.getState(), 'c-a')[0]?.place).toEqual(PARIS);
  });
});
