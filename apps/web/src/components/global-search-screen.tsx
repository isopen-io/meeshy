import { useMemo, useState } from 'react';

import { LoadMore, MessageSearchRow, PersonSearchRow, PostSearchRow, SearchStatus } from '@/components/global-search-results';
import { Glyph } from '@/components/glyph';
import { globalSearchText, useGlobalSearchCatalog, type GlobalSearchCatalogKey } from '@/lib/i18n-global-search-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { messageSearchRowModel } from '@/lib/view/message-search-row';
import { useEverywhereMessages, useEverywherePeople, useEverywherePosts } from '@/lib/view/use-global-search';
import { useReaderLanguages } from '@/lib/view/use-reader';

/**
 * **LA RECHERCHE GÉNÉRALE** (#14619, #14620) — miroir de `GlobalSearchView`
 * (iOS), PRÉSENTÉE PAR-DESSUS LA LISTE comme sur iOS : `/chats?search=<q>`
 * l'ouvre (`GlobalSearchOverlay`, `list-message-search.tsx`), le retour la
 * ferme. Pas d'adresse à elle : la table des routes est dans la première
 * peinture, et chaque route y paie sa carte de préchargement. Un champ, trois onglets — MESSAGES (toutes les
 * conversations du lecteur), POSTS (posts, réels et stories que la loi
 * d'audience du fil lui laisse voir ; l'onglet « Conversations » d'autrefois
 * est remplacé, la liste filtrant déjà les conversations par leur nom) et
 * PERSONNES. On y arrive par « Rechercher partout » de la liste, et `?tab=`
 * choisit l'onglet ouvert.
 *
 * Chaque onglet ne lit que lorsqu'il est visible ; une requête déjà faite se
 * repeint depuis le cache, sans attendre le réseau.
 */

export const SEARCH_TABS = ['messages', 'posts', 'people'] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

const TAB_KEY: Readonly<Record<SearchTab, GlobalSearchCatalogKey>> = { messages: 'tab.messages', posts: 'tab.posts', people: 'tab.people' };

export const searchTabOf = (raw: string | null): SearchTab => (SEARCH_TABS as readonly string[]).includes(raw ?? '') ? (raw as SearchTab) : 'messages';

function MessagesTab({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  const search = useEverywhereMessages(query);
  const rows = useMemo(() => search.hits.map((hit) => messageSearchRowModel(hit, { locale: language })), [search.hits, language]);
  return (
    <>
      <ul className="grid gap-0.5">
        {rows.map((model) => (
          <MessageSearchRow key={model.messageId} model={model} language={language} />
        ))}
      </ul>
      <SearchStatus language={language} state={search.state} isEmpty={rows.length === 0} emptyKey="messages.empty" onRetry={search.retry} />
      {search.hasMore ? <LoadMore language={language} busy={search.busy} onMore={search.more} /> : null}
    </>
  );
}

function PostsTab({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  const search = useEverywherePosts(query);
  const { languages } = useReaderLanguages();
  return (
    <>
      <ul className="grid gap-0.5">
        {search.posts.map((post) => (
          <PostSearchRow key={post.id} post={post} language={language} preferredLanguages={languages} />
        ))}
      </ul>
      <SearchStatus language={language} state={search.state} isEmpty={search.posts.length === 0} emptyKey="posts.empty" onRetry={search.retry} />
      {search.hasMore ? <LoadMore language={language} busy={search.busy} onMore={search.more} /> : null}
    </>
  );
}

function PeopleTab({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  const search = useEverywherePeople(query);
  return (
    <>
      <ul className="grid gap-0.5">
        {search.people.map((person) => (
          <PersonSearchRow key={person.id} person={person} />
        ))}
      </ul>
      <SearchStatus language={language} state={search.state} isEmpty={search.people.length === 0} emptyKey="people.empty" onRetry={search.retry} />
    </>
  );
}

export default function GlobalSearchScreen({
  initialQuery,
  initialTab,
  onClose,
}: {
  readonly initialQuery: string;
  readonly initialTab: string | null;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const ready = useGlobalSearchCatalog(language);
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<SearchTab>(() => searchTabOf(initialTab));
  const short = query.trim().length < 2;
  if (!ready) return <div data-global-search aria-busy="true" className="fixed inset-0 z-40" style={{ backgroundColor: 'var(--color-ios-surface)' }} />;

  return (
    <div
      data-global-search
      role="dialog"
      aria-modal="true"
      aria-label={globalSearchText(language, 'search.title')}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden pt-safe"
      style={{ backgroundColor: 'var(--color-ios-surface)' }}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={globalSearchText(language, 'search.back')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="caretLeft" size={20} className="rtl:-scale-x-100" />
        </button>
        <label className="glass-card flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-chip px-3">
          <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={globalSearchText(language, 'search.placeholder')}
            aria-label={globalSearchText(language, 'search.title')}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="grid size-11 place-items-center" aria-label={globalSearchText(language, 'search.clear')}>
              <Glyph name="x" size={14} style={{ color: 'var(--color-ios-ink-2)' }} />
            </button>
          ) : null}
        </label>
      </header>
      <div role="tablist" aria-label={globalSearchText(language, 'search.title')} className="flex shrink-0 gap-1 px-3 pb-2">
        {SEARCH_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-search-tab={key}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="grid min-h-11 flex-1 place-items-center rounded-chip text-caption font-semibold"
            style={
              tab === key
                ? { backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' }
                : { color: 'var(--color-ios-ink-2)' }
            }
          >
            {globalSearchText(language, TAB_KEY[key])}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="scrollbar-none flex flex-1 flex-col gap-2 overflow-y-auto pb-safe">
        {short ? (
          <p data-search-state="hint" className="px-6 py-8 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {globalSearchText(language, 'search.hint')}
          </p>
        ) : tab === 'messages' ? (
          <MessagesTab language={language} query={query} />
        ) : tab === 'posts' ? (
          <PostsTab language={language} query={query} />
        ) : (
          <PeopleTab language={language} query={query} />
        )}
      </div>
    </div>
  );
}
