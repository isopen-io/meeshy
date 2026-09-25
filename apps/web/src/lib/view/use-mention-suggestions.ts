import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import type { MentionCandidate } from '@/lib/api/mention-suggestions';

import { useMentionContacts } from './mention-contacts';
import { activeMentionQuery, composeMentionList, filterMentionCandidates, queriesRemote, type MentionQuery } from './mention-query';
import { mentionSourceStore, type MentionSource } from './mention-source';

/** Le débounce de la recherche distante — `MentionComposerController.debounceMs`. */
export const MENTION_REMOTE_DEBOUNCE_MS = 300;

/** Au-delà, la mémoire de la session d'écriture cesse de grandir : les plus
 * anciennes requêtes sortent les premières. */
const REMOTE_CACHE_LIMIT = 32;

const NO_CANDIDATES: readonly MentionCandidate[] = [];

export type MentionSuggestions = {
  /** La requête `@` sous le curseur — `null` quand aucune n'est ouverte. */
  readonly query: MentionQuery | null;
  /** La liste est MONTRÉE — y compris vide, pour dire « personne ». */
  readonly open: boolean;
  readonly items: readonly MentionCandidate[];
  /** L'index de la rangée active, `-1` quand il n'y en a aucune. */
  readonly activeIndex: number;
  /** Une recherche distante est EN VOL et n'a encore rien rendu. */
  readonly resolving: boolean;
  readonly move: (delta: 1 | -1) => void;
  readonly highlight: (index: number) => void;
  readonly dismiss: () => void;
};

type RemoteAnswer = {
  readonly search: MentionSource['search'];
  readonly key: string;
  readonly items: readonly MentionCandidate[];
};

type RemoteCache = { readonly search: MentionSource['search'] | null; readonly entries: Map<string, readonly MentionCandidate[]> };

const remember = (cache: RemoteCache, key: string, items: readonly MentionCandidate[]): void => {
  cache.entries.delete(key);
  cache.entries.set(key, items);
  const oldest = cache.entries.keys().next();
  if (cache.entries.size > REMOTE_CACHE_LIMIT && oldest.done !== true) cache.entries.delete(oldest.value);
};

/**
 * LA LISTE DE MENTIONS D'UN CHAMP (#7826, #7846) — miroir de
 * `MentionComposerController.handleQuery`, et règle du porteur du 2026-09-24 :
 *
 * 1. `@` seul ⇒ les CONTACTS (cache persisté, `mention-contacts.ts`) puis
 *    les PARTICIPANTS du contexte répondent IMMÉDIATEMENT, sans réseau ;
 * 2. une lettre ⇒ ces deux groupes se filtrent ET se trient sous le doigt
 *    (`rankMentionCandidates`), toujours sans réseau ;
 * 3. deux lettres ⇒ la passerelle (ou l'annuaire) est interrogée après
 *    300 ms de silence ; une frappe plus récente ANNULE la précédente
 *    (`AbortController`), jamais une réponse périmée ne remplace une liste
 *    plus juste ;
 * 4. la composition garde contacts → participants → autres, sans doublon
 *    (`composeMentionList`).
 *
 * `source` : celle du champ (`useMentionSource`) ; ABSENTE, c'est celle que
 * le fil ouvert publie (`mention-source.ts`), lue seulement quand une requête
 * est active — le composeur du fil au repos ne re-rend pas à chaque message.
 *
 * Deux choix propres au web :
 * - pendant qu'une requête plus longue est en vol, la réponse de la requête
 *   qu'elle PROLONGE reste servie, filtrée (`al` → `ali`) : la liste
 *   s'affine sous le doigt au lieu de se vider puis de revenir ;
 * - chaque réponse est mémorisée pour la session d'écriture (bornée) :
 *   effacer une lettre puis la retaper ne repart pas sur le réseau.
 *
 * `showsSuggestions` d'iOS est repris tel quel : la liste se montre dès
 * qu'une requête est active, SAUF pendant qu'une recherche est en vol et n'a
 * encore rien à montrer — une liste vide n'est donc pas un silence, c'est la
 * réponse « personne ».
 */
export function useMentionSuggestions(input: {
  readonly text: string;
  readonly caret: number;
  readonly enabled: boolean;
  readonly source?: MentionSource | null;
}): MentionSuggestions {
  const { text, caret, enabled } = input;
  const query = useMemo(() => (enabled ? activeMentionQuery(text, caret) : null), [enabled, text, caret]);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const active = query !== null && query.start !== dismissedAt;
  const published = useStore(mentionSourceStore, (state) => (active && input.source === undefined ? state.source : null));
  const source = input.source === undefined ? published : active ? input.source : null;
  const contacts = useMentionContacts({ active: source !== null, selfId: source?.selfId ?? null });

  useEffect(() => {
    if (query === null) setDismissedAt(null);
  }, [query]);

  const needle = query !== null && source !== null && queriesRemote(query.query) ? query.query.trim().toLocaleLowerCase() : null;
  const [remote, setRemote] = useState<RemoteAnswer | null>(null);
  const cache = useRef<RemoteCache>({ search: null, entries: new Map() });
  const search = source?.search ?? null;

  useEffect(() => {
    if (needle === null || search === null) return undefined;
    if (cache.current.search !== search) cache.current = { search, entries: new Map() };
    const known = cache.current.entries.get(needle);
    if (known !== undefined) {
      setRemote({ search, key: needle, items: known });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search(needle, controller.signal).then(
        (items) => {
          if (controller.signal.aborted) return;
          remember(cache.current, needle, items);
          setRemote({ search, key: needle, items });
        },
        () => {
          if (!controller.signal.aborted) setRemote({ search, key: needle, items: [] });
        },
      );
    }, MENTION_REMOTE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle, search]);

  const resolving = needle !== null && !(remote !== null && remote.search === search && remote.key === needle);

  const items = useMemo(() => {
    if (!active || source === null || query === null) return NO_CANDIDATES;
    const usable = remote !== null && remote.search === source.search && needle !== null && needle.startsWith(remote.key);
    /* La réponse EXACTE est servie telle quelle — la passerelle trouve aussi
       sur des champs que le client ne voit pas (prénom, nom). Seule une
       réponse PROLONGÉE (`al` servie pendant que `ali` est en vol) est
       filtrée localement, faute de mieux. */
    const served = !usable ? NO_CANDIDATES : remote.key === needle ? remote.items : filterMentionCandidates(remote.items, query.query);
    return composeMentionList({ contacts, participants: source.locals, remote: served, query: query.query, selfId: source.selfId });
  }, [active, source, query, remote, needle, contacts]);

  const open = active && source !== null && (items.length > 0 || !resolving);

  const listKey = query === null ? '' : `${query.start}:${query.query}`;
  const [cursor, setCursor] = useState<{ readonly key: string; readonly index: number }>({ key: '', index: 0 });
  const activeIndex = items.length === 0 ? -1 : Math.min(cursor.key === listKey ? cursor.index : 0, items.length - 1);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (items.length === 0) return;
      setCursor({ key: listKey, index: (Math.max(activeIndex, 0) + delta + items.length) % items.length });
    },
    [items.length, listKey, activeIndex],
  );
  const highlight = useCallback((index: number) => setCursor({ key: listKey, index }), [listKey]);
  const dismiss = useCallback(() => setDismissedAt(query?.start ?? null), [query]);

  return { query: active ? query : null, open, items, activeIndex, resolving, move, highlight, dismiss };
}
