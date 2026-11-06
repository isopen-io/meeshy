import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { STICKERS_QUERY_KEY } from '../api/stickers';
import type { SocketClient } from '../net/socket';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
import { applyStickerLibraryEvent, bindStickerLibrarySync } from './library-sync';

/**
 * **MA BIBLIOTHÈQUE SUIT MES APPAREILS** (#16515) — `sticker:library-updated`.
 *
 * La liste vit en cache avec une péremption de cinq minutes, justifiée par
 * « aucune autre personne ne la modifie ». C'est vrai d'une autre PERSONNE et
 * faux d'un autre APPAREIL : sans cet événement, un sticker ajouté ou retiré
 * ailleurs n'arrivait jamais.
 *
 * Chaque témoin assert sur la liste LUE — ce que le cache rend — jamais sur le
 * fait qu'un écrivain a été appelé.
 */

const ME = '65f0c0ffee0000000000a11c';

const sticker = (id: string, lastUsedAt = '2026-11-06T10:00:00.000Z'): StickerDefinition => ({
  id,
  name: null,
  origin: 'upload',
  mimeType: 'image/png',
  fileUrl: `stickers/${ME}/${id}.png`,
  width: 512,
  height: 512,
  sizeBytes: 1024,
  animated: false,
  createdAt: '2026-11-06T09:00:00.000Z',
  lastUsedAt,
});

const mine = (): MyProfile => ({
  id: ME,
  username: 'ada',
  displayName: null,
  firstName: null,
  lastName: null,
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  email: null,
  phone: null,
  createdAt: null,
});

const setup = (library: readonly StickerDefinition[] | undefined) => {
  const client = new QueryClient();
  client.setQueryData(MY_PROFILE_QUERY_KEY, mine());
  if (library !== undefined) client.setQueryData(STICKERS_QUERY_KEY, library);
  return client;
};

const ids = (client: QueryClient): readonly string[] =>
  (client.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY) ?? []).map((s) => s.id);

describe('applyStickerLibraryEvent', () => {
  test('un sticker ajouté sur un autre appareil arrive EN TÊTE de la grille', () => {
    const client = setup([sticker('old')]);

    applyStickerLibraryEvent(client, { userId: ME, change: 'added', sticker: sticker('neuf'), at: '2026-11-06T11:00:00.000Z' });

    expect(ids(client)).toEqual(['neuf', 'old']);
  });

  /** La grille est ordonnée par `lastUsedAt desc` : une remontée est un ORDRE, pas un ajout. */
  test('un sticker utilisé ailleurs remonte en tête sans se dédoubler', () => {
    const client = setup([sticker('a'), sticker('b'), sticker('c')]);

    applyStickerLibraryEvent(client, {
      userId: ME,
      change: 'promoted',
      sticker: sticker('c', '2026-11-06T12:00:00.000Z'),
      at: '2026-11-06T12:00:00.000Z',
    });

    expect(ids(client)).toEqual(['c', 'a', 'b']);
  });

  test('la définition servie par l’événement REMPLACE celle en cache', () => {
    const client = setup([sticker('a')]);

    applyStickerLibraryEvent(client, {
      userId: ME,
      change: 'promoted',
      sticker: { ...sticker('a', '2026-11-06T12:00:00.000Z'), name: 'Renommé' },
      at: '2026-11-06T12:00:00.000Z',
    });

    expect(client.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)?.[0]).toMatchObject({
      id: 'a',
      name: 'Renommé',
      lastUsedAt: '2026-11-06T12:00:00.000Z',
    });
  });

  test('un sticker retiré ailleurs quitte la grille', () => {
    const client = setup([sticker('a'), sticker('b')]);

    applyStickerLibraryEvent(client, { userId: ME, change: 'removed', stickerId: 'a', at: '2026-11-06T12:00:00.000Z' });

    expect(ids(client)).toEqual(['b']);
  });

  /**
   * Sans liste en cache il n'y a rien à réconcilier : la poser depuis un seul
   * événement servirait une bibliothèque d'UN sticker à un écran qui n'a
   * jamais lu la vraie, et `enabled` empêche justement la requête de partir
   * avant qu'un sticker ne la demande.
   */
  test('aucune liste en cache ⇒ rien n’est fabriqué', () => {
    const client = setup(undefined);

    applyStickerLibraryEvent(client, { userId: ME, change: 'added', sticker: sticker('neuf'), at: '2026-11-06T11:00:00.000Z' });

    expect(client.getQueryData(STICKERS_QUERY_KEY)).toBeUndefined();
  });

  /**
   * L'événement n'est émis que sur `user:<id>`, mais un socket qui tient
   * encore la room d'un compte précédent en porterait un d'autrui. Même garde
   * que `applyProfileDecorEvent` : l'événement est ignoré ENTIER.
   */
  test('un événement d’un autre compte, ou malformé, ne touche à rien', () => {
    const client = setup([sticker('a')]);

    applyStickerLibraryEvent(client, { userId: 'quelqu-un-dautre', change: 'removed', stickerId: 'a', at: '2026-11-06T12:00:00.000Z' });
    applyStickerLibraryEvent(client, null);
    applyStickerLibraryEvent(client, { userId: ME, change: 'removed', at: '2026-11-06T12:00:00.000Z' });
    applyStickerLibraryEvent(client, { userId: ME, change: 'added', sticker: { id: 42 }, at: '2026-11-06T12:00:00.000Z' });
    applyStickerLibraryEvent(client, { userId: ME, change: 'inventé', stickerId: 'a', at: '2026-11-06T12:00:00.000Z' });

    expect(ids(client)).toEqual(['a']);
  });
});

describe('bindStickerLibrarySync', () => {
  test('branche l’événement, et le débranchement le retire', () => {
    const client = setup([sticker('a')]);
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket = {
      on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, handler),
      off: (event: string) => void handlers.delete(event),
    } as unknown as SocketClient;

    const unbind = bindStickerLibrarySync({ socket, queryClient: client });

    expect([...handlers.keys()]).toEqual([SERVER_EVENTS.STICKER_LIBRARY_UPDATED]);
    handlers.get(SERVER_EVENTS.STICKER_LIBRARY_UPDATED)?.({
      userId: ME,
      change: 'added',
      sticker: sticker('neuf'),
      at: '2026-11-06T11:00:00.000Z',
    });
    expect(ids(client)).toEqual(['neuf', 'a']);

    unbind();
    expect([...handlers.keys()]).toEqual([]);
  });
});
