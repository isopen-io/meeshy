import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { flattenMediaHubPages, mediaHubInfiniteOptions, type MediaHubData } from '@/lib/api/conversation-media-hub';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Message } from '@/lib/api/types';

import { itemsOfKind, type MediaHubKind } from './media-hub';

const selectMessages = (data: MediaHubData): readonly Message[] => flattenMediaHubPages(data);

/**
 * L'INDEX D'UN GENRE (#8103) — la requête, ses éléments, et la pagination.
 * Partagé par l'écran « Médias, liens et documents » et l'aperçu de la feuille
 * de détails : les deux lisent la MÊME clé de cache, si bien qu'ouvrir l'écran
 * après l'aperçu ne recharge rien.
 *
 * `placeholderData` garde les résultats du terme PRÉCÉDENT pendant qu'une
 * recherche du MÊME genre se charge — jamais ceux d'un autre genre : un
 * segment jamais vu montre son squelette, pas les éléments du voisin.
 * `select` est une fonction de MODULE (voir `flattenMessagePages`).
 */
export function useMediaHubIndex(params: {
  readonly deps: ConversationsDeps;
  readonly conversationId: string;
  readonly kind: MediaHubKind;
  readonly term: string | null;
}) {
  const { deps, conversationId, kind, term } = params;
  const query = useInfiniteQuery({
    ...mediaHubInfiniteOptions(deps, conversationId, kind, term),
    select: selectMessages,
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === kind ? previous : undefined),
  });
  const messages = query.data;
  const items = useMemo(() => (messages === undefined ? undefined : itemsOfKind(messages, kind)), [messages, kind]);
  return { query, items };
}

/** La valeur, une fois la frappe posée depuis `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return settled;
}
