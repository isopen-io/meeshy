import { useMemo } from 'react';

import { LoadMore, MessageSearchRow, SearchStatus } from '@/components/global-search-results';
import { Glyph } from '@/components/glyph';
import { GLOBAL_SEARCH_PARAM } from '@/components/list-search-mounts';
import { globalSearchText, useGlobalSearchCatalog } from '@/lib/i18n-global-search-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SearchState } from '@/lib/view/global-search-state';
import { messageSearchRowModel, type MessageSearchRowModel } from '@/lib/view/message-search-row';
import { useEverywhereMessages } from '@/lib/view/use-global-search';
import { Link } from '@/routes/route-table';

/**
 * **LA SECTION « MESSAGES » DE LA RECHERCHE DE LA LISTE** (#14619) — sous les
 * conversations filtrées par leur nom, la liste montre les MESSAGES qui
 * contiennent la requête, dans toutes les conversations du lecteur (la
 * passerelle porte seule les lois de lecture). Temporisée, muette sous deux
 * caractères ; chaque ligne ouvre le fil SUR le message. « Rechercher
 * partout » ouvre la recherche générale PAR-DESSUS la liste
 * (`?search=<q>`, `list-search-mounts.tsx`), où vivent aussi les posts et les personnes — l'entrée
 * qu'iOS pose à côté de son champ de recherche.
 */


export function MessageSearchSection({
  language,
  query,
  state,
  rows,
  hasMore,
  busy,
  onMore,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly query: string;
  readonly state: SearchState;
  readonly rows: readonly MessageSearchRowModel[];
  readonly hasMore: boolean;
  readonly busy: boolean;
  readonly onMore: () => void;
  readonly onRetry: () => void;
}) {
  if (state === 'idle') return null;
  return (
    <li data-list-message-search className="mx-2 mt-4 grid gap-1">
      <section aria-label={globalSearchText(language, 'section.messages')} className="grid gap-1">
        <header className="flex items-center justify-between px-4">
          <h2 className="text-body font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {globalSearchText(language, 'section.messages')}
          </h2>
          <Link
            to="list"
            search={{ [GLOBAL_SEARCH_PARAM]: query }}
            data-search-everywhere
            className="flex min-h-11 items-center gap-1 px-2 text-caption font-semibold"
            style={{ color: 'var(--color-ios-brand)' }}
          >
            <Glyph name="magnifyingGlass" size={14} />
            {globalSearchText(language, 'search.everywhere')}
          </Link>
        </header>
        {rows.length > 0 ? (
          <ul className="grid gap-0.5">
            {rows.map((model) => (
              <MessageSearchRow key={model.messageId} model={model} language={language} />
            ))}
          </ul>
        ) : null}
        <SearchStatus language={language} state={state} isEmpty={rows.length === 0} emptyKey="messages.empty" onRetry={onRetry} />
        {hasMore ? <LoadMore language={language} busy={busy} onMore={onMore} /> : null}
      </section>
    </li>
  );
}

export function ListMessageSearch({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  const ready = useGlobalSearchCatalog(language);
  const search = useEverywhereMessages(query);
  const rows = useMemo(() => search.hits.map((hit) => messageSearchRowModel(hit, { locale: language })), [search.hits, language]);
  if (!ready) return null;
  return (
    <MessageSearchSection
      language={language}
      query={search.query ?? query.trim()}
      state={search.state}
      rows={rows}
      hasMore={search.hasMore}
      busy={search.busy}
      onMore={search.more}
      onRetry={search.retry}
    />
  );
}
