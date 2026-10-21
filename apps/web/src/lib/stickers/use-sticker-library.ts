import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { apiDeps } from '@/lib/api/deps';
import { STICKERS_QUERY_KEY, STICKERS_STALE_TIME, createSticker, loadMyStickers, withStickerFirst } from '@/lib/api/stickers';

import {
  addedSnapshot,
  noteStickerAdded,
  receivedStickerFile,
  stickerInLibrary,
  stickerKeyOf,
  subscribeAdded,
} from './received';

type Picture = { readonly fileUrl: string } | undefined;

/**
 * **« MES STICKERS » VUE DEPUIS UN MESSAGE** (#10630) — la MÊME clé de cache que
 * la feuille du composeur (`STICKERS_QUERY_KEY`) : une seule bibliothèque, lue
 * une fois. `enabled` : la requête ne part que quand un sticker la demande.
 * L'ajout écrit le cache au geste (le sticker passe en tête), le réseau confirme.
 */
export function useStickerLibrary(enabled = true) {
  const queryClient = useQueryClient();
  const library = useQuery({
    queryKey: STICKERS_QUERY_KEY,
    enabled,
    queryFn: async ({ signal }) => {
      const result = await loadMyStickers({ ...apiDeps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: STICKERS_STALE_TIME,
  });
  const added = useSyncExternalStore(subscribeAdded, addedSnapshot, addedSnapshot);
  const owned = library.data;

  const has = useCallback(
    (sticker: MessageSticker, picture: Picture): boolean => stickerInLibrary({ sticker, picture, library: owned ?? [], added }),
    [owned, added],
  );

  const add = useCallback(
    async (sticker: MessageSticker, picture: Picture): Promise<boolean> => {
      if (picture === undefined || picture.fileUrl === '') return false;
      const file = await receivedStickerFile(picture.fileUrl);
      if (file === null) return false;
      const result = await createSticker(apiDeps, { file, origin: 'received' });
      if (!result.ok) return false;
      queryClient.setQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY, (list) => withStickerFirst(list ?? [], result.data));
      const key = stickerKeyOf(sticker, picture);
      if (key !== null) noteStickerAdded(key);
      return true;
    },
    [queryClient],
  );

  return { has, add, loaded: owned !== undefined };
}
