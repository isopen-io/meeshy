import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import { placeOf } from '@/lib/view/message-body';
import { threadOf, threadPages } from '@/test-support/thread-cache';

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
    const attente = entriesOf(deps.outbox.getState(), 'c-a')[0]?.message;
    expect(attente === undefined ? null : placeOf(attente)).toEqual({
      latitude: PARIS.latitude,
      longitude: PARIS.longitude,
      name: null,
      address: null,
    });
  });
});

/**
 * **L'EXPÉDITEUR VOIT SON LIEU (#7328)** — le lot #7280 a fait PARTIR le lieu
 * et s'est arrêté là : `Draft.place` était rangé sur l'ENTRÉE d'outbox, jamais
 * sur le `LocalMessage` que la bulle rend. Le geste marchait, la pièce
 * partait, et l'écran de celui qui l'envoie ne montrait RIEN — impossible de
 * savoir si l'envoi a échoué ou si le correspondant l'a reçu.
 *
 * C'est la forme INVERSE du contrôle qui ment (loi 4), et la plus déroutante :
 * un contrôle inerte ne fait rien, celui-ci fait tout SAUF le dire.
 *
 * Les deux témoins ci-dessous mesurent l'ALLER-RETOUR complet, parce que le
 * défaut survivait à chacune de ses deux moitiés prise seule : la bulle
 * OPTIMISTE (avant tout accusé) et la bulle CONFIRMÉE (`confirmedMessageOf`
 * étale le local — ce qui n'y est pas ne peut pas en sortir).
 *
 * Ils interrogent `placeOf` (`lib/view/message-body.ts`), LA loi que les deux
 * peaux appellent (`bubble.tsx:276`, `focal-row.tsx:467`) — jamais la clé
 * brute : un témoin qui lirait `message.location` verdirait sur une forme que
 * la carte ne sait pas lire.
 */
describe('l’expéditeur voit son lieu dans son propre fil (#7328)', () => {
  test('la bulle OPTIMISTE porte le lieu, avant tout accusé', async () => {
    const { impl } = capturingFetch();
    const deps = depsOf(impl, false); // hors ligne : aucun accusé ne peut le réparer
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'je suis là, optimiste', originalLanguage: 'fr', place: PARIS },
      viewerId: 'u-viewer',
      deps,
    });
    const optimiste = entriesOf(deps.outbox.getState(), 'c-a')[0]?.message;
    expect(optimiste === undefined ? null : placeOf(optimiste)).toEqual({
      latitude: PARIS.latitude,
      longitude: PARIS.longitude,
      name: null,
      address: null,
    });
  });

  test('le CONFIRMÉ écrit dans le fil garde le lieu', async () => {
    const { impl } = capturingFetch();
    const deps = depsOf(impl);
    deps.queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([]));
    await performSend({
      conversationId: 'c-a',
      draft: { content: 'je suis là, confirmé', originalLanguage: 'fr', place: PARIS },
      viewerId: 'u-viewer',
      deps,
    });
    const confirmé = threadOf(deps.queryClient, 'c-a')?.messages[0];
    expect(confirmé?.id).toBe('m9');
    expect(confirmé === undefined ? null : placeOf(confirmé)).toEqual({
      latitude: PARIS.latitude,
      longitude: PARIS.longitude,
      name: null,
      address: null,
    });
  });
});
