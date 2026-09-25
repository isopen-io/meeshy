import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { CommentsSheetPortal } from '@/components/publication-comments-sheet-lazy';
import { ReelPage } from '@/components/reel-page';
import { cachedCardSeed } from '@/lib/api/card-caches';
import { apiDeps } from '@/lib/api/deps';
import { feedQuery } from '@/lib/api/feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { postQueryOptions } from '@/lib/api/publication-detail';
import { reelsQuery } from '@/lib/api/reels';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { currentHistory, reelsExitOf } from '@/lib/reels/exit';
import { activeIndexOf, composeReelThread, entryReelIds, neighborIndex, pageModeOf, reelSeedOf, shouldLoadMoreReels } from '@/lib/reels/thread';
import { useRoute } from '@/lib/router';
import { REEL_COLUMN_STYLE } from '@/lib/view/reading-column';
import { screenGestureYields, shortcutYieldsToTarget } from '@/lib/view/shortcut-scope';
import { useCommentsSheetHost } from '@/lib/view/use-comments-sheet-host';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { usePublicationRoom } from '@/lib/view/use-publication-room';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useSettled } from '@/lib/view/use-settled';
import { useViewer } from '@/lib/view/use-viewer';
import { href, navigate } from '@/routes/route-table';

/**
 * LES RÉELS (#6457) — miroir de `ReelsPlayerView` et `ReelsViewModel` (iOS) :
 * un pager VERTICAL plein écran, un réel à la fois.
 *
 * - **Ouverture instantanée** : les réels déjà reçus par le Flux, et la graine
 *   dès qu'une caisse du registre la porte (`card-caches.ts` : hashtag, profil,
 *   enregistrées, fiche — #7384), se peignent au premier rendu ; le fil de la
 *   passerelle (`scope=reels`, affinité à la graine) s'ajoute DERRIÈRE. Un
 *   squelette n'apparaît qu'à cache vide, ou le temps de lire une graine
 *   inconnue (lien profond) — la poser après coup en tête déplacerait le réel
 *   regardé.
 * - **Le défilement est celui du navigateur** : `scroll-snap` obligatoire, un
 *   arrêt par réel (`snap-always`). Le geste reste sur le compositeur — aucun
 *   suivi du doigt réécrit en JavaScript, aucune transition qui l'amortit. Le
 *   réel visible se lit sur la position (`activeIndexOf`), une fois par image.
 * - **Au clavier**, flèches et Page haut/bas valent le balayage ; le défilement
 *   est instantané sous `prefers-reduced-motion`. Échap referme.
 * - **La sortie est l'historique** : `/reels` est une adresse, le retour du
 *   navigateur comme le retour matériel d'Android (qui recule l'historique de la
 *   WebView) la quittent. Le bouton recule seulement vers une entrée de Meeshy
 *   et remplace l'adresse par le Flux sinon (`lib/reels/exit.ts`, #6498) :
 *   `history.length` compte aussi les pages des autres sites.
 * - **Les disques flottants n'y sont pas** (`floating-gate.ts`, liste fermée) :
 *   iOS présente les Réels par-dessus toute la navigation.
 * - **Hors ligne avec des réels, la coquille le dit** : la pastille de
 *   synchronisation (`components/sync-pill.tsx`) est le signal de coupure de
 *   TOUTE l'application, posée en haut au centre. Une seconde annonce propre à
 *   cet écran s'y superposait (mesuré à la capture, 320 × 568) : un même état
 *   ne se dit qu'une fois, au même endroit que partout ailleurs. Seul le cache
 *   FROID a son état dessiné ici, parce qu'il n'y a alors rien d'autre à voir.
 * - **UNE salle de publication, celle du réel où le lecteur S'ARRÊTE** (#7395,
 *   #6485) — miroir de `ReelsViewModel.currentId` (iOS : quitter l'ancienne,
 *   rejoindre la nouvelle, aucune pour les voisins préchargés). C'est elle qui
 *   apporte au lecteur non ami de l'auteur la traduction du texte et les
 *   comptes en direct. Un défilement d'un trait traverse plusieurs pages sans
 *   s'y poser (`scroll-snap`, une image par page lue) : la salle attend que le
 *   réel visible soit POSÉ (`REEL_ROOM_SETTLE_MS`). Chaque `post:join` et
 *   `post:leave` puise dans le seau par utilisateur de la passerelle
 *   (`PostReactionHandler`, 30 par minute, partagé avec les réactions) —
 *   rejoindre les réels traversés le viderait pour rien.
 */
const EMPTY_POSTS: readonly FeedPost[] = [];

/** Assez long pour qu'un défilement d'un trait ne se pose sur aucune des pages
 * qu'il traverse, assez court pour que la salle soit tenue bien avant la fin
 * d'un réel. */
const REEL_ROOM_SETTLE_MS = 400;

const KEY_DIRECTION: Readonly<Record<string, 'next' | 'previous'>> = {
  ArrowDown: 'next',
  PageDown: 'next',
  ArrowUp: 'previous',
  PageUp: 'previous',
};

/** Le son d'abord COUPÉ tant que la page n'a reçu aucune activation : un
 * navigateur refuse une lecture sonore sans geste préalable (lien profond),
 * jamais une lecture muette. Venu d'un tap dans le Flux, le son est ouvert. */
function hasUserActivation(): boolean {
  if (typeof navigator === 'undefined') return false;
  const activation = (navigator as Navigator & { readonly userActivation?: { readonly hasBeenActive?: boolean } }).userActivation;
  return activation?.hasBeenActive === true;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ReelsBackButton({ language, onBack }: { readonly language: InterfaceLanguage; readonly onBack: () => void }) {
  return (
    <button
      type="button"
      data-reels-back
      aria-label={translate(language, 'reels.back')}
      onClick={onBack}
      className="absolute start-3 z-10 grid size-11 place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', backgroundColor: 'rgba(0,0,0,0.42)', outlineColor: 'white' }}
    >
      <Glyph name="caretLeft" size={20} />
    </button>
  );
}

/** Le démarrage à froid SEUL — jamais sur un rafraîchissement de fond. */
export function ReelsSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" aria-busy="true" data-reels-skeleton className="absolute inset-0 bg-black">
      <span className="sr-only">{translate(language, 'reels.loading')}</span>
      <div aria-hidden="true" className="absolute inset-x-4 flex flex-col gap-2.5" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
        <div className="rounded-chip" style={{ width: 150, height: 14, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <div className="rounded-chip" style={{ width: 230, height: 12, backgroundColor: 'rgba(255,255,255,0.14)' }} />
      </div>
    </div>
  );
}

function StateFrame({ children, ...rest }: { readonly children: React.ReactNode } & Readonly<Record<`data-${string}`, string>> & { readonly role?: string }) {
  return (
    <div {...rest} className="absolute inset-0 grid content-center justify-items-center gap-3 bg-black px-8 text-center">
      {children}
    </div>
  );
}

export function ReelsEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <StateFrame data-reels-empty="">
      <GlyphSvg glyph={FEED_GLYPHS.monitorPlay} size={44} style={{ color: 'rgba(255,255,255,0.72)' }} />
      <p className="text-body font-semibold text-white">{translate(language, 'reels.empty')}</p>
      <p className="text-caption" style={{ color: 'rgba(255,255,255,0.78)' }}>
        {translate(language, 'reels.empty.hint')}
      </p>
    </StateFrame>
  );
}

/** `online` faux ⇒ la coupure, sans promettre des réels déjà chargés : cet état
 * n'existe qu'à cache vide. */
export function ReelsFailure({ language, online, onRetry }: { readonly language: InterfaceLanguage; readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <StateFrame role="alert" data-reels-failure={online ? 'error' : 'offline'}>
      <span style={{ color: online ? 'var(--color-error)' : 'rgba(255,255,255,0.72)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold text-white">{translate(language, online ? 'reels.error' : 'reels.offline')}</p>
      <p className="text-caption" style={{ color: 'rgba(255,255,255,0.78)' }}>
        {translate(language, online ? 'reels.error.hint' : 'reels.offline.cold')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'reels.retry')}
      </button>
    </StateFrame>
  );
}

export default function ReelsScreen() {
  const language = currentInterfaceLanguage();
  /* DEUX ADRESSES, UNE GRAINE (#7298) — `/reels?seed=<id>` (le Flux) et
     `/reel/<id>` (le lien que la passerelle grave à chaque partage) ouvrent le
     MÊME écran ; `reelSeedOf` est le seul endroit qui décide laquelle nomme le
     réel d'entrée. */
  const { params, search } = useRoute();
  const seed = reelSeedOf({ params, search });
  const online = useOnline();
  const { languages: readerLanguages } = useReaderLanguages();
  const minute = useMinute();
  const { announcement, onGesture, onShare, onRepost, repostConfirm } = usePostGesture();
  const [soundOn, setSoundOn] = useState(hasUserActivation);

  /* UN VISITEUR ANONYME N'A NI L'UN NI L'AUTRE (#6484) — les deux routes
     exigent un `registeredUser`, même garde que `CommentThread.canWrite`.
     `useViewer` est PARTAGÉ avec `comment-thread.tsx` (#6484,
     `lib/view/use-viewer.ts`) : aucun des deux ne le paie deux fois. */
  const viewer = useViewer();
  const canWrite = viewer.id !== null && !viewer.isAnonymous;

  /* Le Flux est OBSERVÉ, jamais rechargé d'ici : ses réels ouvrent le lecteur,
     et ses bascules (aimer, enregistrer) s'y reflètent. */
  const queryClient = useQueryClient();
  const feed = useInfiniteQuery({ ...feedQuery(apiDeps), enabled: false });
  const feedPosts = feed.data ?? EMPTY_POSTS;
  const [entryIds] = useState(() => entryReelIds({ ...(seed !== undefined ? { seedId: seed } : {}), feedPosts }));
  /* LA GRAINE EST CONNUE DE TOUTE CAISSE QUI LA PEINT (#7384) — le Flux, un
     hashtag, un profil, les enregistrées, la fiche : la MÊME recherche que la
     fiche (`cachedCardSeed`), datée de sa caisse. La requête naît alors
     réussie, et sa fraîcheur (`PUBLICATION_STALE_TIME`) juge l'âge RÉEL de la
     carte : récente, aucune relecture ; ancienne, une relecture en fond, sous
     le réel déjà peint. Une graine qu'aucune caisse ne porte (lien profond) se
     lit, et le squelette tient le temps de la lire. */
  const seedPost = useQuery({
    ...postQueryOptions({ ...apiDeps, postId: seed ?? '' }),
    ...cachedCardSeed(queryClient, seed ?? ''),
    enabled: seed !== undefined,
    retry: false,
  });
  const reels = useInfiniteQuery(reelsQuery(apiDeps, seed));

  const known = useMemo(
    () => new Map([...feedPosts, ...(seedPost.data !== undefined ? [seedPost.data] : [])].map((post) => [post.id, post] as const)),
    [feedPosts, seedPost.data],
  );
  const thread = useMemo(() => composeReelThread({ entryIds, known, served: reels.data ?? EMPTY_POSTS }), [entryIds, known, reels.data]);
  const models = useMemo(
    () => thread.map((post) => resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() })),
    // `minute` rafraîchit l'heure relative (motif `feed.tsx`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thread, readerLanguages, minute],
  );
  const count = models.length;

  const scroller = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = Math.min(activeIndex, Math.max(0, count - 1));
  const activeId = models[active]?.id ?? '';
  usePublicationRoom(useSettled(activeId, REEL_ROOM_SETTLE_MS));
  /* LA FEUILLE DE COMMENTAIRES, PARTAGÉE avec le lecteur de stories (D-89,
     #6484) — la loi d'hôte (focus, fermeture au changement de réel) vit dans
     `use-comments-sheet-host.ts`, extraite de `routes/story.tsx`. */
  const comments = useCommentsSheetHost(activeId);
  const sheetOpen = comments.postId !== null;
  const frame = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const el = scroller.current;
      if (el !== null) setActiveIndex(activeIndexOf({ scrollTop: el.scrollTop, pageHeight: el.clientHeight, count }));
    });
  }, [count]);
  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  const close = useCallback(() => {
    if (reelsExitOf(currentHistory()) === 'back') window.history.back();
    else navigate(href('feed'), true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        close();
        return;
      }
      /* LA JUMELLE DE `routes/story.tsx`, FERMÉE AVANT SON SYMPTÔME (D-91).
         Cet écran écoute lui aussi le clavier sur `window` et appelle
         `preventDefault()` ; il n'a aujourd'hui aucune zone de saisie, donc
         aucun des trois symptômes mesurés chez le lecteur de stories — mais
         c'est EXACTEMENT ce qui était vrai du lecteur avant que D-89 lui
         donne son composeur de commentaire. La cession est fine : les
         flèches ne sont jamais rendues à un bouton, le réel gardant sa
         navigation quel que soit le contrôle qui a le focus. */
      if (shortcutYieldsToTarget({ target: event.target, key: event.key })) return;
      /* LA FEUILLE OUVERTE GARDE LE CLAVIER (revue-correction #6484, D-90).
         Le pager est `inert` sous elle, mais `inert` ne retient que ce que
         l'UTILISATEUR touche : `scrollTo` le défile quand même. Mesuré au
         navigateur, une flèche dans la feuille passait au réel suivant — ce
         qui la FERMAIT (`useCommentsSheetHost`) avec le commentaire en cours.
         La loi est celle que le lecteur de stories applique déjà au doigt. */
      if (screenGestureYields({ target: event.target, layerOpen: sheetOpen })) return;
      const direction = KEY_DIRECTION[event.key];
      const el = scroller.current;
      if (direction === undefined || el === null) return;
      event.preventDefault();
      const from = activeIndexOf({ scrollTop: el.scrollTop, pageHeight: el.clientHeight, count });
      const target = neighborIndex({ index: from, direction, count });
      el.scrollTo({ top: target * el.clientHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      el.querySelector<HTMLElement>(`[data-reel-index="${target}"]`)?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, count, sheetOpen]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = reels;
  useEffect(() => {
    if (shouldLoadMoreReels({ activeIndex: active, count }) && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [active, count, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const seedPending = seed !== undefined && !known.has(seed) && seedPost.fetchStatus === 'fetching';
  const coldOffline = count === 0 && reels.data === undefined && reels.fetchStatus === 'paused';
  const failed = count === 0 && reels.data === undefined && reels.isError;
  const loading = seedPending || (count === 0 && reels.data === undefined && !reels.isError && !coldOffline);

  const body = loading ? (
    <ReelsSkeleton language={language} />
  ) : failed || coldOffline ? (
    <ReelsFailure language={language} online={online && !coldOffline} onRetry={() => void reels.refetch()} />
  ) : count === 0 ? (
    <ReelsEmpty language={language} />
  ) : (
    <>
      <div
        ref={scroller}
        id="contenu"
        role="feed"
        aria-label={translate(language, 'reels.title')}
        aria-busy={isFetchingNextPage}
        data-reels-pager
        onScroll={onScroll}
        /* LA FEUILLE RÉCLAME LE GESTE (D-90, miroir du rail `inert` de
           `routes/story.tsx`) — un sous-arbre inerte n'intercepte plus le
           doigt ni le clavier : sans elle, un balayage sous la feuille
           ferait avancer le pager derrière le fil qu'on lit. */
        inert={sheetOpen}
        /* `isolate` (revue-correction #6484) : un contexte d'empilement PROPRE
           au pager. La barre de progression d'un réel est en `z-10` pour
           passer au-dessus de son voile (#6903) ; sans lui, elle passait
           AUSSI au-dessus de la feuille de commentaires (`zIndex: 3`), en
           trait clair sur sa dernière rangée. */
        className="scrollbar-none isolate h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {models.map((model, index) => (
          <ReelPage
            key={model.id}
            model={model}
            index={index}
            count={count}
            mode={pageModeOf(index, active)}
            soundOn={soundOn}
            language={language}
            preferredLanguages={readerLanguages}
            onToggleSound={() => setSoundOn((on) => !on)}
            onGesture={onGesture}
            onShare={onShare}
            onSoundBlocked={() => setSoundOn(false)}
            {...(canWrite ? { onComment: comments.open, onRepost } : {})}
          />
        ))}
      </div>
      <CommentsSheetPortal host={comments} />
    </>
  );

  return (
    <ReelsFrame language={language} onBack={close} announcement={announcement}>
      {body}
      {repostConfirm}
    </ReelsFrame>
  );
}

export function ReelsFrame({
  language,
  onBack,
  announcement,
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly onBack: () => void;
  readonly announcement: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div data-reels className="h-dvh overflow-hidden bg-black text-white">
      {/* LA COLONNE DES RÉELS (#7449) — `REEL_COLUMN_STYLE`
          (`lib/view/reading-column.ts`) : un réel est en 9:16, sa largeur utile
          est donc `hauteur × 9/16` et tout le reste n'est que du noir — du noir
          qui éloigne le rail d'actions du regard et du pouce. Elle porte le
          `relative` : le bouton « Retour » et les états plein cadre
          (`StateFrame`, `ReelsSkeleton`) s'ancrent à la COLONNE, pas à la
          fenêtre, sinon les contrôles partiraient au bord opposé.

          Aux deux gabarits que les gates mesurent, elle ne retire rien :
          844 × 9/16 = 474 (> 390) et 568 × 9/16 = 319,5 (≈ 320). */}
      <div data-reels-column className="relative h-full" style={REEL_COLUMN_STYLE}>
        {/* « Retour » EN TÊTE du document (#6498) : sa place à l'écran est
            absolue, mais le clavier et le lecteur d'écran suivent l'ordre du
            document — après le fil, il fallait traverser chaque réel monté. */}
        <ReelsBackButton language={language} onBack={onBack} />
        {children}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
