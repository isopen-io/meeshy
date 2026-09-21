import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { ReelPage } from '@/components/reel-page';
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
import { shortcutYieldsToTarget } from '@/lib/view/shortcut-scope';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { href, navigate } from '@/routes/route-table';

/**
 * LES RÉELS (#6457) — miroir de `ReelsPlayerView` et `ReelsViewModel` (iOS) :
 * un pager VERTICAL plein écran, un réel à la fois.
 *
 * - **Ouverture instantanée** : les réels déjà reçus par le Flux (et la graine,
 *   si le détail d'une publication l'a déjà lue) se peignent au premier rendu,
 *   sans requête ; le fil de la passerelle (`scope=reels`, affinité à la graine)
 *   s'ajoute DERRIÈRE. Un squelette n'apparaît qu'à cache vide, ou le temps de
 *   lire une graine inconnue (lien profond) — la poser après coup en tête
 *   déplacerait le réel regardé.
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
 */
const EMPTY_POSTS: readonly FeedPost[] = [];

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
  const { announcement, onGesture, onShare } = usePostGesture();
  const [soundOn, setSoundOn] = useState(hasUserActivation);

  /* Le Flux est OBSERVÉ, jamais rechargé d'ici : ses réels ouvrent le lecteur,
     et ses bascules (aimer, enregistrer) s'y reflètent. */
  const feed = useInfiniteQuery({ ...feedQuery(apiDeps), enabled: false });
  const feedPosts = feed.data ?? EMPTY_POSTS;
  const [entryIds] = useState(() => entryReelIds({ ...(seed !== undefined ? { seedId: seed } : {}), feedPosts }));
  const seedCached = seed !== undefined && feedPosts.some((post) => post.id === seed);
  const seedPost = useQuery({
    ...postQueryOptions({ ...apiDeps, postId: seed ?? '' }),
    enabled: seed !== undefined && !seedCached,
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
  }, [close, count]);

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
    <div
      ref={scroller}
      id="contenu"
      role="feed"
      aria-label={translate(language, 'reels.title')}
      aria-busy={isFetchingNextPage}
      data-reels-pager
      onScroll={onScroll}
      className="scrollbar-none h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
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
        />
      ))}
    </div>
  );

  return (
    <ReelsFrame language={language} onBack={close} announcement={announcement}>
      {body}
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
    <div data-reels className="relative h-dvh overflow-hidden bg-black text-white">
      {/* « Retour » EN TÊTE du document (#6498) : sa place à l'écran est
          absolue, mais le clavier et le lecteur d'écran suivent l'ordre du
          document — après le fil, il fallait traverser chaque réel monté. */}
      <ReelsBackButton language={language} onBack={onBack} />
      {children}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
