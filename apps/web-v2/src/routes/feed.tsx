import { useCallback, useMemo, useRef } from 'react';
import { useStore } from 'zustand/react';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import { RailTitleSlot } from '@/components/rail-title-slot';
import { SceneFullscreenGallery } from '@/components/scene-fullscreen-gallery';
import { StoryRail, type StoryRailProps } from '@/components/story-rail';
import { apiDeps } from '@/lib/api/deps';
import { FEED_PAGE_SIZE } from '@/lib/api/feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { refreshFeedAction, useFeed } from '@/lib/api/query';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { useFeedAutoplayRoot } from '@/lib/feed/use-feed-autoplay';
import { useSceneGallery } from '@/lib/feed/use-scene-gallery';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { PINNED_RAIL_RELEASE_RATIO, PINNED_RAIL_REVEAL_RATIO } from '@/lib/lens/pinned-rail';
import { useOnline } from '@/lib/net/online';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { FeedNewPostsBanner } from '@/components/feed-new-posts-banner';
import { FEED_NEW_COUNT_KEY, clearNewPostCount } from '@/lib/api/feed-new-count';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { useOutOfView } from '@/lib/view/use-out-of-view';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { useStoryRailProps } from '@/lib/view/use-story-rail';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * LE FIL DES PUBLICATIONS (#5893, #6104, #6277) — destination du bouton
 * flottant de GAUCHE, miroir réduit de `FeedView.swift` (D-1) : le plateau des
 * stories en tête du contenu défilant, un en-tête qui s'escamote, puis les
 * cartes — auteur + heure relative sur la même ligne, corps via le Prisme
 * (`resolveFeedCardModel`, `lib/feed/card-model.ts` — JAMAIS de descente
 * réécrite ici, D-14), média avec placeholder ThumbHash puis chargement
 * paresseux, pagination par curseur. LES GESTES (#6278, D-47, D-48) : aimer,
 * enregistrer et partager écrivent — commenter et repartager restent des
 * statistiques tant qu'ils n'ont pas d'effet (loi 4).
 *
 * LE PLATEAU ET L'EN-TÊTE ESCAMOTABLE SONT CEUX DE LA LISTE (#6277) — iOS
 * monte le même `StoryTrayView` et la même `PinnedStoryTrailBand` sur les deux
 * écrans (`FeedView.swift:1124-1126`, `:610-634`). Ici aussi : `StoryRail`,
 * `RailTitleSlot` et `useStoryRailProps`, les MÊMES composants avec la MÊME
 * cote (#6133) — jamais une seconde tuile ni une seconde bascule.
 *
 * CE QUI N'EST PAS REPRIS, ASSUMÉ (§ 1.5 de la spécification) : le placeholder
 * de composeur, le bouton rond « À proximité » de l'en-tête (celui des Réels
 * l'a rejoint avec son lecteur, #6457), le menu « Plus d'options », le panneau de traduction secondaire et la bannière
 * temps réel « N nouveaux posts » — chacun un contrôle qui ouvrirait une route
 * ou un geste absent (loi 4), ou un compagnon de temps réel hors périmètre
 * lecture seule. Le bouton retour, lui, reste : iOS ferme le fil par le disque
 * qui l'a ouvert, le web a une adresse et doit pouvoir la quitter.
 */
const EMPTY_POSTS: readonly FeedPost[] = [];

/** L'estimation de hauteur d'une carte — une carte texte+média occupe bien
 * plus que la rangée de 88 px de la Lentille ; la marge de chargement du
 * défilement infini (`loadMoreRootMargin`) suit cette échelle. */
const FEED_ROW_HEIGHT_ESTIMATE = 420;

/**
 * **LA HAUTEUR DE L'EN-TÊTE, DÉCLARÉE** — `CollapsibleHeaderMetrics.
 * expandedHeight` (64). La réserve du couloir ci-dessous se calcule depuis
 * elle : mesurée, elle aurait dépendu de la hauteur de ligne d'un titre, et la
 * première écriture de ce fichier l'avait relevée à 65 au navigateur.
 */
export const FEED_HEADER_HEIGHT = 64;

/**
 * **LA RÉSERVE DU COULOIR DES DISQUES FLOTTANTS** (#6277) — la loi d'iOS, jamais
 * une cote magique.
 *
 * iOS pose les disques sous `FloatingButtonSafeZone.top` et ouvre son fil par
 * un plateau de hauteur FIXE (`StoryTrayView.frame(height: 120)`, présent même
 * sans story puisqu'il porte « Moi ») : la première carte commence toujours
 * sous le couloir. Le rail du web ne peint RIEN sans corpus (`StoryRail`) —
 * la loi se porte donc par un PLANCHER sur le chrome qui le contient : le bas du
 * couloir (`FLOATING_CORRIDOR_BOTTOM`, `lib/view/floating-corridor.ts`) moins
 * la hauteur de l'en-tête. L'encoche s'annule dans la soustraction : elle
 * décale à la fois le couloir (`env(safe-area-inset-top)`) et l'écran (`pt-safe`).
 *
 * Avec des stories, le plateau (anneau de 94 + libellé) dépasse le plancher et
 * c'est lui qui occupe le couloir — le disque du Flux survole alors sa première
 * tuile, exactement comme la cible `targets/feed.*.png`, qui y garde une cible
 * de 44 px atteignable (`check-floating-clearance.mjs`).
 */
export const FEED_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - FEED_HEADER_HEIGHT;

export function FeedHeader({ pinned, railProps }: { readonly pinned: boolean; readonly railProps: StoryRailProps }) {
  const language = currentInterfaceLanguage();
  return (
    <header className="flex shrink-0 items-center gap-2 px-3" style={{ height: FEED_HEADER_HEIGHT }}>
      <Link
        to="list"
        aria-label={translate(language, 'pending.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <RailTitleSlot title="Meeshy Feed" pinned={pinned} railProps={railProps} />
      {/* LANCER LES RÉELS (#6457) — la première action de l'en-tête d'iOS
          (`FeedView.swift`, `reelsButton` ⇒ `ReelsPresenter.presentFresh()`),
          en haut à droite, sans graine. Le disque flottant de droite se pose
          SOUS l'en-tête (`FLOATING_TOP`) : il ne couvre pas ce bouton. */}
      <Link
        to="reels"
        aria-label={translate(language, 'feed.header.reels')}
        draggable={false}
        data-feed-reels
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <GlyphSvg glyph={FEED_GLYPHS.monitorPlay} size={22} />
      </Link>
    </header>
  );
}

/**
 * LE CHROME HAUT DU CONTENU DÉFILANT — le grand plateau, qui SORT du champ au
 * défilement comme tout contenu (#6103), posé sur la réserve du couloir.
 * `-mx-3` neutralise le `px-3` du scrollport : le plateau court de bord à bord,
 * comme sur la liste. `observe` est la réf de rappel de `useOutOfView` ; `inert`
 * retire le plateau des deux arbres pendant que la bande de l'en-tête le
 * remplace (voir `StoryRail`).
 */
export function FeedTopChrome({
  railProps,
  inert,
  observe,
}: {
  readonly railProps: StoryRailProps;
  readonly inert: boolean;
  readonly observe?: (node: Element | null) => void;
}) {
  return (
    /* `pt-3` — l'air d'iOS au-dessus du plateau (`FeedView`, `LazyVStack
       .padding(.top, 12)`) : sans lui, le libellé de la première tuile passait
       sous le bas du disque du Flux (mesuré à la capture). `border-box` : le
       plancher COMPTE cet air, la loi du couloir reste exacte. */
    <li className="-mx-3 shrink-0 pt-3" style={{ minHeight: FEED_TOP_RESERVE }}>
      <StoryRail ref={observe} variant="grande" inert={inert} {...railProps} />
    </li>
  );
}

/** `status === 'error'`, à CACHE VIDE — miroir `ListError` (`conversations.tsx`). */
export function FeedError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  const language = currentInterfaceLanguage();
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, online ? 'feed.error.title' : 'feed.offline.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, online ? 'feed.error.body' : 'feed.offline.body')}
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

export function FeedEmpty() {
  const language = currentInterfaceLanguage();
  return (
    <li className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <Glyph name="image" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'feed.empty.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'feed.empty.subtitle')}
      </p>
    </li>
  );
}

const SKELETON_CARDS_COLD_START = 3;
/** Pendant que la page SUIVANTE arrive (#6987) : deux cartes — assez pour
 * couvrir ce que le défilement découvre, pas de quoi promettre une page. */
const SKELETON_CARDS_LOAD_MORE = 2;

/** Le squelette au démarrage à froid (cache vide, requête en vol) — jamais sur
 * un rafraîchissement de fond (§ Instant App Principles) — et, à `count: 2`,
 * ce qui tient la place de la page suivante sous le dernier post (#6987) :
 * la MÊME carte fantôme, jamais un indicateur sur du fond nu. */
export function FeedSkeleton({ count = SKELETON_CARDS_COLD_START }: { readonly count?: number } = {}) {
  return (
    /* AUCUN `aria-busy` ICI — le scrollport qui PORTE ce squelette l'annonce
       déjà (`FeedScreen`) ; le poser deux fois faisait lire « Chargement du
       fil » deux fois de suite (revue-correction #5893). */
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => i).map((i) => (
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

  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const railProps = useStoryRailProps(viewer.id ?? undefined, viewer.avatar);
  /** La bande de l'en-tête prend la place du titre quand le grand plateau est
   * SORTI du scrollport — mêmes seuils que la liste (`lib/lens/pinned-rail.ts`). */
  const { pinned, observe: observeGrandRail } = useOutOfView({
    root: frame,
    revealRatio: PINNED_RAIL_REVEAL_RATIO,
    releaseRatio: PINNED_RAIL_RELEASE_RATIO,
  });

  const loading = feed.data === undefined && !feed.isError;
  const paginationState = paginationStateOf(feed);
  const pull = usePullToRefresh({ root: frame, onRefresh: refreshFeedAction, threshold: PULL_THRESHOLD });
  const posts = feed.data ?? EMPTY_POSTS;
  /**
   * CE QUI EST ARRIVÉ PENDANT QU'ON LISAIT (#7182) — le compte que
   * `applyPostCreated` tient sur l'écoute de `post:created`. Il vit dans le
   * cache de requêtes parce que c'est le canal que la socket et cet écran
   * partagent déjà ; `enabled` reste vrai mais `staleTime: Infinity` garantit
   * que la `queryFn` ne sert QUE de valeur initiale — ce compte n'a aucune
   * source serveur, il naît et meurt avec l'onglet.
   */
  const queryClient = useQueryClient();
  const newPosts = useQuery({ queryKey: FEED_NEW_COUNT_KEY, queryFn: () => 0, staleTime: Infinity, gcTime: Infinity });
  const onSeeNewPosts = useCallback(() => {
    frame.current?.scrollTo({ top: 0, behavior: 'smooth' });
    clearNewPostCount(queryClient);
  }, [queryClient]);


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
  const { announcement, onGesture, onShare } = usePostGesture();
  /* COMMENTER DEPUIS LE FIL — le compteur conduit au DÉTAIL de la
     publication, à son ancre de commentaires (`routes/post.tsx`
     § `#commentaires`). iOS ouvre une couche (`FeedCommentsSheet`) ; le web
     a déjà une route pour cette publication, et y mener garde UNE adresse
     partageable pour un fil — jamais un état modal sans URL. */
  const openComments = useCallback((postId: string) => {
    navigate(`${href('post', { post: postId })}#commentaires`);
  }, []);

  // L'ÉLECTION DE LA SCÈNE QUI JOUE (#6898 § 5.3) — UN SEUL
  // `IntersectionObserver`, posé ici, pour toutes les cartes du fil.
  const { registerScene } = useFeedAutoplayRoot(frame);
  // LE PLEIN ÉCRAN D'UNE SCÈNE (#6902) — EN PLACE, jamais une navigation vers
  // le détail (§ 0 de la spécification `scenes-plein-ecran`) : `useSceneGallery`
  // est le MÊME hôte que `routes/post.tsx`, `SceneFullscreenGallery` compose
  // le lot depuis les modèles déjà résolus par CE fil (jamais une seconde
  // résolution, D-14).
  const sceneGallery = useSceneGallery();

  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(FEED_ROW_HEIGHT_ESTIMATE),
    enabled: paginationState === 'idle' && models.length > 0,
    onReach: () => void feed.fetchNextPage(),
  });

  const language = currentInterfaceLanguage();

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <FeedHeader pinned={pinned} railProps={railProps} />
      {/* ELLE FLOTTE — exception à D-50 arbitrée par le porteur le 2026-09-20 :
          dans le flux, elle n'aurait été visible qu'en haut du fil, là où son
          information est déjà sous les yeux et son geste sans objet. */}
      <FeedNewPostsBanner count={newPosts.data ?? 0} topPx={FEED_HEADER_HEIGHT + 8} onTap={onSeeNewPosts} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <ul
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(loading ? { 'aria-busy': true, 'aria-label': translate(language, 'feed.loading') } : {})}
      >
        <FeedTopChrome railProps={railProps} inert={pinned} observe={observeGrandRail} />
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
                <FeedPostCard
                  model={model}
                  onGesture={onGesture}
                  onShare={onShare}
                  onComment={openComments}
                  preferredLanguages={readerLanguages}
                  onOpenScene={sceneGallery.onOpenScene}
                  registerScene={registerScene}
                />
              </li>
            ))}
            <LensPaginationFooter
              state={paginationState}
              showsAllLoadedHint={showsAllLoadedHint(posts.length, FEED_PAGE_SIZE)}
              exhaustedLabel={translate(language, 'feed.allLoaded')}
              loadingMoreContent={<FeedSkeleton count={SKELETON_CARDS_LOAD_MORE} />}
              onRetry={() => void feed.fetchNextPage()}
              sentinelRef={observeTail}
            />
          </>
        )}
      </ul>
      <SceneFullscreenGallery
        request={sceneGallery.open}
        models={models}
        preferredLanguages={readerLanguages}
        onClose={sceneGallery.close}
      />
    </div>
  );
}
