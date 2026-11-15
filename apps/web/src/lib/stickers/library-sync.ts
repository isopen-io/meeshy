import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { STICKERS_QUERY_KEY, decodeSticker, withStickerFirst } from '../api/stickers';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
import type { SocketClient } from '../net/socket';

/**
 * **MA BIBLIOTHÈQUE DE STICKERS SUIT MES APPAREILS** (#16515) —
 * `sticker:library-updated`, posé par la passerelle sur `user:<id>` après
 * chaque écriture de `UserSticker`.
 *
 * La liste vit sous `STICKERS_QUERY_KEY` avec une péremption de cinq minutes
 * (`STICKERS_STALE_TIME`), justifiée par « aucune autre personne ne la
 * modifie — l'écran l'écrit au geste, le réseau confirme ». La phrase est
 * vraie d'une autre PERSONNE et fausse d'un autre APPAREIL : c'est elle, et la
 * péremption qu'elle justifie, qui tenaient un sticker ajouté ou retiré
 * ailleurs hors de cette grille.
 *
 * L'événement est APPLIQUÉ au cache, jamais traduit en invalidation : un
 * `invalidateQueries` relancerait le réseau pour apprendre ce que la charge
 * dit déjà, et ferait clignoter une grille que l'utilisateur regarde. C'est le
 * choix de `applyProfileDecorEvent`, et celui d'Android pour
 * `pack:installation-updated` (« la charge suffit »).
 */

type Unknowns = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Unknowns | null =>
  typeof value === 'object' && value !== null ? (value as Unknowns) : null;

/**
 * La liste n'est TOUCHÉE que si elle existe déjà. Sans elle il n'y a rien à
 * réconcilier, et la poser depuis un seul événement servirait une
 * bibliothèque d'un sticker à un écran qui n'a jamais lu la vraie — alors que
 * `enabled` retient justement la requête jusqu'à ce qu'un sticker la demande.
 */
const writeLibrary = (
  queryClient: QueryClient,
  next: (list: readonly StickerDefinition[]) => readonly StickerDefinition[],
): void => {
  const current = queryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY);
  if (current === undefined) return;
  queryClient.setQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY, next(current));
};

/**
 * `sticker:library-updated` — mes autres appareils. Un événement d'un autre
 * compte, ou malformé, est ignoré ENTIER : la charge ne voyage que sur ma room
 * personnelle, mais un socket qui tient encore la room d'un compte précédent
 * en porterait un d'autrui.
 *
 * `added` et `promoted` se posent par la MÊME opération — `withStickerFirst`,
 * déjà le chemin optimiste de l'écran : ce sticker passe en tête, en
 * remplaçant toute entrée de même id. Les séparer sert le diagnostic côté
 * serveur, pas la réconciliation ici.
 */
export function applyStickerLibraryEvent(queryClient: QueryClient, payload: unknown): void {
  const event = asRecord(payload);
  if (event === null) return;
  const me = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
  if (me === undefined || event['userId'] !== me.id) return;

  if (event['change'] === 'removed') {
    const stickerId = event['stickerId'];
    if (typeof stickerId !== 'string' || stickerId === '') return;
    writeLibrary(queryClient, (list) => list.filter((sticker) => sticker.id !== stickerId));
    return;
  }

  if (event['change'] !== 'added' && event['change'] !== 'promoted') return;
  const sticker = decodeSticker(event['sticker']);
  if (sticker === null) return;
  writeLibrary(queryClient, (list) => withStickerFirst(list, sticker));
}

/** Branche l'événement sur le cache de la bibliothèque ; rend le débranchement. */
export function bindStickerLibrarySync(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyStickerLibraryEvent(queryClient, payload);
  socket.on(SERVER_EVENTS.STICKER_LIBRARY_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.STICKER_LIBRARY_UPDATED, onUpdated);
}
