import { useMemo, useRef } from 'react';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph } from '@/components/glyph';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import { FEED_PAGE_SIZE } from '@/lib/api/feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { refreshFeedAction, useFeed } from '@/lib/api/query';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { Link } from '@/routes/route-table';

/**
 * LE FIL DES PUBLICATIONS (#5893, #6104) — destination du bouton flottant de
 * GAUCHE, miroir réduit de `FeedView.swift` (D-1) : auteur + heure relative
 * sur la même ligne, corps via le Prisme (`resolveFeedCardModel`,
 * `lib/feed/card-model.ts` — JAMAIS de descente réécrite ici, D-14), média
 * avec placeholder ThumbHash puis chargement paresseux, pagination par
 * curseur. LECTEUR SEUL ce lot (D-6) : ni écriture, ni réaction, ni
 * commentaire — les cinq statistiques de chaque carte sont des compteurs
 * STATIQUES (`FeedPostCard`).
 *
 * CE QUI N'EST PAS REPRIS CE LOT, ASSUMÉ (§ 1.5 de la spécification) : le
 * rail de stories, le placeholder de composeur, les deux boutons ronds
 * (Réels / à proximité), le menu « Plus d'options », le panneau de traduction
 * secondaire et la bannière temps réel « N nouveaux posts » — chacun un
 * contrôle qui ouvrirait une route ou un geste absent (loi 4), ou un
 * compagnon de temps réel hors périmètre lecture seule.
 */
const EMPTY_POSTS: readonly FeedPost[] = [];

/** L'estimation de hauteur d'une carte — une carte texte+média occupe bien
 * plus que la rangée de 88 px de la Lentille ; la marge de chargement du
 * défilement infini (`loadMoreRootMargin`) suit cette échelle. */
const FEED_ROW_HEIGHT_ESTIMATE = 420;

export function FeedHeader() {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
      <Link
        to="list"
        aria-label="Retour aux conversations"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-brand)' }}>
        Meeshy Feed
      </h1>
    </header>
  );
}

/** `status === 'error'`, à CACHE VIDE — miroir `ListError` (`conversations.tsx`). */
export function FeedError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {online ? 'Impossible de charger le fil' : 'Hors ligne'}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {online ? 'Réessayez dans un instant.' : 'Le fil s’affichera à la reconnexion.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        Réessayer
      </button>
    </li>
  );
}

export function FeedEmpty() {
  return (
    <li className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <Glyph name="image" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        Aucune publication
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        Les publications de vos contacts apparaîtront ici.
      </p>
    </li>
  );
}

/**
 * **LE BAS DU CORRIDOR DES DISQUES FLOTTANTS** — `--float-top`
 * (`styles/floating-menus.css:53`, 126) plus la hauteur du disque
 * (`FLOATING_BUTTON`, `lib/view/floating-pose.ts:16`, 52). L'inset de
 * sécurité du haut s'ANNULE dans la comparaison qui suit : il décale à la
 * fois ce corridor et l'en-tête du fil (via `pt-safe` sur le conteneur), donc
 * la marge à réserver ENTRE eux n'en dépend pas.
 *
 * Dupliqué plutôt qu'importé : `floating-pose.ts` ne vit aujourd'hui QUE dans
 * le chunk à la demande des menus (`floating_menus`, `budgets.json`) ;
 * l'importer depuis `feed.tsx` ferait naître une arête partagée entre deux
 * chunks déjà mesurés séparément, pour deux constantes qui ne bougent pas.
 * Même arbitrage que `FLOATING_SIDE`/`--float-side` (`floating-pose.ts:88-98`).
 */
const FLOATING_DISC_CORRIDOR_BOTTOM = 178;

/**
 * **LA HAUTEUR DE `<FeedHeader>`**, mesurée à 390×844 (revue-correction de
 * #5893/#6104, Playwright + `getBoundingClientRect`) : `pt-3` (12) + `pb-2`
 * (8) + la ligne bouton-retour/titre, où l'icône `size-11` (44) domine.
 */
const FEED_HEADER_HEIGHT = 65;

/**
 * **LA BANDE QUI MANQUAIT** — le rail de stories et le placeholder de
 * composeur occupent exactement ce corridor sur iOS (`FeedView.swift:
 * 1124-1130`) et ne sont PAS repris ce lot (doc-comment ci-dessus) : sans
 * eux, les deux disques flottants (`lib/view/floating-gate.ts`) recouvraient
 * le texte et la rangée d'actions de la PREMIÈRE carte. Mesuré avant ce
 * correctif : disques à 126-178, première carte dès 65, son texte à 137, sa
 * rangée d'actions à 178 — 113 px de la carte sous le corridor.
 *
 * Cette bande est DÉCORATIVE (`aria-hidden`, aucun geste, ce n'est donc pas
 * un contrôle inerte au sens de la loi 4) et vit DANS le scrollport, comme
 * l'aurait fait le rail : elle défile normalement dès le premier geste, elle
 * ne fige rien au-dessus du contenu.
 */
const FEED_TOP_CLEARANCE = Math.max(0, FLOATING_DISC_CORRIDOR_BOTTOM - FEED_HEADER_HEIGHT);

/** Composant à part pour que la revue et le témoin en isolent la valeur —
 * même découpage que `FeedHeader`/`FeedEmpty` ci-dessus. */
export function FeedTopClearance() {
  return <li aria-hidden="true" style={{ height: FEED_TOP_CLEARANCE, flexShrink: 0 }} />;
}

const SKELETON_CARDS = [0, 1, 2] as const;

/** Le squelette au démarrage à froid SEUL (cache vide, requête en vol) —
 * jamais sur un rafraîchissement de fond (§ Instant App Principles). */
export function FeedSkeleton() {
  return (
    /* AUCUN `aria-busy` ICI — le scrollport qui PORTE ce squelette l'annonce
       déjà (`FeedScreen`) ; le poser deux fois faisait lire « Chargement du
       fil » deux fois de suite (revue-correction #5893). */
    <div aria-hidden="true" className="flex flex-col gap-3">
      {SKELETON_CARDS.map((i) => (
        <div key={i} className="flex flex-col gap-2 p-3" style={{ backgroundColor: 'var(--color-ios-card)', borderRadius: 18 }}>
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 rounded-full" style={{ width: 40, height: 40, backgroundColor: 'var(--color-edge)' }} />
            <div className="flex flex-col gap-1.5">
              <div className="rounded-chip" style={{ width: 120, height: 12, backgroundColor: 'var(--color-edge)' }} />
              <div className="rounded-chip" style={{ width: 80, height: 10, backgroundColor: 'var(--color-edge)' }} />
            </div>
          </div>
          <div className="rounded-card" style={{ height: 200, backgroundColor: 'var(--color-edge)' }} />
        </div>
      ))}
    </div>
  );
}

export default function FeedScreen() {
  const frame = useRef<HTMLUListElement | null>(null);
  /** LE RETOUR RAMÈNE À LA MÊME POSITION (§ 0 de la spécification) — même
   * dispositif que la Lentille (`routes/conversations.tsx`). */
  useScrollportMemory(frame);
  const online = useOnline();
  const feed = useFeed();
  const { languages: readerLanguages } = useReaderLanguages();
  /** `minute` force le recalcul de l'heure relative à chaque minute — même
   * discipline que la Lentille (`useMinute`, `conversations.tsx`). */
  const minute = useMinute();

  const loading = feed.data === undefined && !feed.isError;
  const paginationState = paginationStateOf(feed);
  const pull = usePullToRefresh({ root: frame, onRefresh: refreshFeedAction, threshold: PULL_THRESHOLD });
  const posts = feed.data ?? EMPTY_POSTS;

  const models = useMemo(
    () => posts.map((post) => resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() })),
    // `minute` n'entre dans AUCUNE expression du calcul : c'est volontaire —
    // elle y est la clé qui fait réévaluer `new Date()` (même motif que
    // `conversations.tsx`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, readerLanguages, minute],
  );

  /** LE DÉFILEMENT INFINI (miroir de la Lentille, `lib/view/use-load-more-sentinel.ts`
   * — « le fil réutilisera ce hook tel quel »). ARMÉ au seul état `idle`, et
   * seulement s'il y a déjà des cartes : une liste vide ne doit rien charger
   * en boucle (même garde que `conversations.tsx`). */
  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(FEED_ROW_HEIGHT_ESTIMATE),
    enabled: paginationState === 'idle' && models.length > 0,
    onReach: () => void feed.fetchNextPage(),
  });

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <FeedHeader />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <ul
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(loading ? { 'aria-busy': true, 'aria-label': 'Chargement du fil' } : {})}
      >
        <FeedTopClearance />
        {feed.data === undefined && feed.isError ? (
          <FeedError online={online} onRetry={() => void feed.refetch()} />
        ) : loading ? (
          <li>
            <FeedSkeleton />
          </li>
        ) : models.length === 0 ? (
          <FeedEmpty />
        ) : (
          <>
            {models.map((model) => (
              <li key={model.id}>
                <FeedPostCard model={model} />
              </li>
            ))}
            <LensPaginationFooter
              state={paginationState}
              showsAllLoadedHint={showsAllLoadedHint(posts.length, FEED_PAGE_SIZE)}
              exhaustedLabel="Toutes les publications sont chargées"
              onRetry={() => void feed.fetchNextPage()}
              sentinelRef={observeTail}
            />
          </>
        )}
      </ul>
    </div>
  );
}
