import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { bookmarkedPostsQuery, BOOKMARKS_PAGE_SIZE } from '@/lib/api/bookmarked-posts';
import { apiDeps } from '@/lib/api/deps';
import {
  BOOKMARK_FILTERS,
  effectiveBookmarkFilter,
  offersBookmarkFilter,
  visibleBookmarks,
  type BookmarkFilter,
} from '@/lib/feed/bookmark-filter';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { Link } from '@/routes/route-table';

import { FeedSkeleton } from './feed';

/**
 * **LES PUBLICATIONS ENREGISTRÉES** (#7286) — `/me/bookmarks`, miroir réduit
 * de `BookmarksView.swift` (D-1).
 *
 * **LE DÉFAUT QUE CET ÉCRAN FERME** : le geste d'enregistrement écrivait
 * depuis #6278, la passerelle servait `scope=bookmarks` depuis #4149, et
 * AUCUNE adresse ne permettait de relire ce qu'on avait enregistré. Un geste
 * dont l'effet est invisible pour toujours à celui qui le fait — la forme la
 * plus discrète du contrôle qui ment (loi 4) : il a bien un effet, simplement
 * cet effet ne lui sert à rien.
 *
 * **LA PORTE EST CELLE D'iOS** : Réglages › Outils (`SettingsView.swift`,
 * `meeshyToolsSection`), jamais un barreau de l'échelle flottante — l'écran
 * est une ARCHIVE, pas une destination de lecture quotidienne. D'où aussi le
 * retour vers `/settings` plutôt que vers le Flux.
 *
 * **L'ADRESSE VIT SOUS `/me`**, comme `/me/progression` : c'est un corpus qui
 * n'existe que pour le lecteur connecté (401 sans session, d'où `bookmarks`
 * dans `PRIVATE_ROUTES`). Adresse NEUVE — le legacy n'a jamais servi cet
 * écran, il n'y a donc aucune nomenclature à reprendre (D-5).
 *
 * **MÊME CARTE QUE LE FIL, MÊME MODÈLE** — `resolveFeedCardModel` et
 * `FeedPostCard`, jamais une seconde peau : le Prisme, l'accent et la
 * géométrie d'une publication ne se recalculent pas par écran (D-14, D-1).
 * Les gestes viennent du seul hôte qui les tient (`usePostGesture`), `onComment`
 * compris — la garde d'inventaire `post-card-hosts.test.ts` l'exige, et c'est
 * elle qui empêche le cinquième hôte de rendre un chiffre inerte.
 *
 * **LE RETRAIT EST LE MÊME GESTE QUE DANS LE FLUX**, et c'est tout le sujet du
 * critère de fin : `onGesture(postId, 'bookmark')` part vers
 * `performPostGesture`, qui écrit CHAQUE caisse du registre des cartes
 * (`card-caches.ts`, #7341) — ce corpus-ci compris. Retirer ici retire dans le
 * Flux ; retirer dans le Flux ôte la ligne ici. Une seule source de vérité,
 * optimiste des deux côtés, avec retour en arrière à LA PLACE de la ligne
 * (`bookmark-membership.ts`).
 *
 * **CE QUI N'EST PAS REPRIS D'iOS, ASSUMÉ** : le tirer-pour-rafraîchir (le
 * corpus ne bouge que par un geste du lecteur, qui l'écrit déjà en optimiste)
 * et la distinction post/réel AU TAP — iOS ouvre un réel dans son lecteur
 * immersif et un post dans son détail, là où la carte du web porte elle-même
 * ses deux portes depuis #7284/#7298 (`/post/$post`, `/reel/$post`), sans que
 * cet écran ait à trancher.
 */

const BOOKMARK_ROW_HEIGHT_ESTIMATE = 420;

const HEADER_HEIGHT = 64;

export function BookmarksHeader() {
  const language = currentInterfaceLanguage();
  return (
    <header className="flex shrink-0 items-center gap-2 px-3" style={{ height: HEADER_HEIGHT }}>
      <Link
        to="settings"
        aria-label={translate(language, 'bookmarks.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'bookmarks.title')}
      </h1>
    </header>
  );
}

/**
 * **L'ÉTAT VIDE APPREND LE GESTE** — c'est celui que la majorité des lecteurs
 * verra au premier passage, et l'issue le dit en toutes lettres : il doit dire
 * COMMENT on enregistre, pas constater une absence.
 *
 * iOS s'arrête à « Les posts et les réels que vous enregistrez apparaîtront
 * ici » — une promesse, pas une instruction. Le web va un cran plus loin et
 * OUVRE la porte du geste (le Flux) : sur un écran atteint par les Réglages,
 * l'instruction sans le chemin laisse le lecteur au même endroit.
 *
 * AUCUN `role="alert"` : un corpus vide n'est pas une panne. Le glyphe est
 * décoratif — `aria-hidden`, exactement comme iOS masque son `bookmark` pour
 * que VoiceOver n'annonce pas le nom brut du symbole.
 */
export function BookmarksEmpty() {
  const language = currentInterfaceLanguage();
  return (
    <li className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span aria-hidden="true" style={{ color: 'var(--color-ios-brand)', opacity: 0.4 }}>
        <GlyphSvg glyph={FEED_GLYPHS.bookmark} size={44} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'bookmarks.empty.title')}
      </p>
      <p className="max-w-xs text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'bookmarks.empty.subtitle')}
      </p>
      <Link
        to="feed"
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'bookmarks.empty.cta')}
      </Link>
    </li>
  );
}

/** `status === 'error'`, à CACHE VIDE — miroir `FeedError` (`feed.tsx`) : le
 * hors-ligne dit autre chose que la panne, et la reprise reste offerte dans
 * les deux cas (c'est le geste qui suit un retour de réseau que le navigateur
 * n'a pas encore signalé). */
export function BookmarksError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  const language = currentInterfaceLanguage();
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, online ? 'bookmarks.error.title' : 'feed.offline.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, online ? 'bookmarks.error.body' : 'bookmarks.offline.body')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'feed.retry')}
      </button>
    </li>
  );
}

const FILTER_LABEL = {
  all: 'bookmarks.filter.all',
  posts: 'bookmarks.filter.posts',
  reels: 'bookmarks.filter.reels',
} as const;

/**
 * LE SÉLECTEUR DE NATURE — `Picker(.segmented)` d'iOS, rendu en groupe de
 * boutons plutôt qu'en `<select>` : trois facettes se montrent, elles ne se
 * déplient pas, et `aria-pressed` dit l'état de chacune là où un `<select>`
 * ne dirait que la valeur courante.
 *
 * L'hôte décide s'il le MONTRE (`offersBookmarkFilter`) : proposer « Réels »
 * sur une liste sans réel n'offrirait qu'un moyen de vider l'écran.
 */
export function BookmarksFilterPicker({
  value,
  onChange,
}: {
  readonly value: BookmarkFilter;
  readonly onChange: (next: BookmarkFilter) => void;
}) {
  const language = currentInterfaceLanguage();
  return (
    <div
      role="group"
      aria-label={translate(language, 'bookmarks.filter.a11y')}
      className="flex gap-1 rounded-chip p-1"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)' }}
    >
      {BOOKMARK_FILTERS.map((facette) => {
        const active = facette === value;
        return (
          <button
            key={facette}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(facette)}
            className="flex-1 rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              outlineColor: 'var(--color-ios-brand)',
              color: active ? 'var(--color-ios-surface)' : 'var(--color-ios-ink)',
              backgroundColor: active ? 'var(--color-ios-brand)' : 'transparent',
            }}
          >
            {translate(language, FILTER_LABEL[facette])}
          </button>
        );
      })}
    </div>
  );
}

export default function BookmarksScreen() {
  const frame = useRef<HTMLUListElement | null>(null);
  useScrollportMemory(frame);
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const { languages: readerLanguages } = useReaderLanguages();
  const minute = useMinute();
  const [filter, setFilter] = useState<BookmarkFilter>('all');

  const corpus = useInfiniteQuery(bookmarkedPostsQuery(apiDeps));
  const { announcement, onGesture, onShare, onComment, onRepost, menu } = usePostGesture();

  const posts = corpus.data ?? [];
  /** CACHE D'ABORD (§ Instant App Principles) : le squelette n'existe que pour
   * un cache VIDE. `corpus.data` servi, même périmé, se peint sur-le-champ et
   * la revalidation reste silencieuse. */
  const loading = corpus.data === undefined && !corpus.isError;
  const paginationState = paginationStateOf(corpus);

  const applied = effectiveBookmarkFilter(posts, filter);
  const visibles = useMemo(() => visibleBookmarks(posts, applied), [posts, applied]);
  const models = useMemo(
    () => visibles.map((post) => resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() })),
    // `minute` n'entre dans AUCUNE expression : elle est la clé qui fait
    // réévaluer `new Date()` — même motif que `feed.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibles, readerLanguages, minute],
  );

  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(BOOKMARK_ROW_HEIGHT_ESTIMATE),
    /* ARMÉ au seul état `idle`, et seulement s'il y a déjà des cartes — même
       garde que le Flux : une liste vide ne doit rien charger en boucle. Le
       FILTRE ne l'éteint pas : c'est le corpus SERVI qui pagine, pas la
       facette, sinon « Réels » sur une page sans réel figerait la suite. */
    enabled: paginationState === 'idle' && posts.length > 0,
    onReach: () => void corpus.fetchNextPage(),
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <BookmarksHeader />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ul
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-safe"
        {...(loading ? { 'aria-busy': true, 'aria-label': translate(language, 'bookmarks.loading') } : {})}
      >
        {corpus.data === undefined && corpus.isError ? (
          <BookmarksError online={online} onRetry={() => void corpus.refetch()} />
        ) : loading ? (
          <li>
            <FeedSkeleton count={2} />
          </li>
        ) : posts.length === 0 ? (
          <BookmarksEmpty />
        ) : (
          <>
            {offersBookmarkFilter(posts) ? (
              <li className="shrink-0 pt-1">
                <BookmarksFilterPicker value={applied} onChange={setFilter} />
              </li>
            ) : null}
            {models.map((model) => (
              <li key={model.id}>
                <FeedPostCard
                  model={model}
                  onGesture={onGesture}
                  onShare={onShare}
                  onComment={onComment}
                  onRepost={onRepost}
                  menu={menu}
                  preferredLanguages={readerLanguages}
                />
              </li>
            ))}
            <LensPaginationFooter
              state={paginationState}
              showsAllLoadedHint={showsAllLoadedHint(posts.length, BOOKMARKS_PAGE_SIZE)}
              exhaustedLabel={translate(language, 'bookmarks.allLoaded')}
              loadingMoreContent={<FeedSkeleton count={1} />}
              onRetry={() => void corpus.fetchNextPage()}
              sentinelRef={observeTail}
            />
          </>
        )}
      </ul>
    </div>
  );
}
