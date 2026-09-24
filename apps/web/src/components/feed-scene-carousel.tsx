import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { fitScene } from '@/lib/canvas/fit';
import { carouselAspect, clampedCardAspect } from '@/lib/feed/scene-framing';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useElementSize } from '@/lib/view/use-element-size';

import { FeedCarouselChrome, FeedCarouselDots } from './feed-carousel-chrome';
import { FeedSceneSurface } from './feed-scene-surface';

/**
 * `FeedSceneCarousel` — LE CARROUSEL DE SCÈNES, agencement PAR DÉFAUT d'une
 * publication v:3 (#6898, § 1.3.1 : ADAPTATION au web de `TabView.page`
 * iOS). TOUTES les pages sont montées dans une piste `scroll-snap`
 * horizontale (swipe natif au doigt), les flèches et le clavier couvrent le
 * reste.
 *
 * **LA BOÎTE PLAFONNE, LE CARROUSEL S'Y CENTRE ENTIER** — miroir
 * `SceneCardHeightCap(naturalAspect: boxAspect) { pages }`
 * (`PostSceneMosaic.swift:194-218`) : la boîte (`[data-feed-scene-box]`, rayon
 * 16) prend le rapport PLAFONNÉ, et la zone des pages
 * (`[data-feed-scene-frame]`) — piste, flèches et compteur — prend le rapport
 * NATUREL (la page la plus haute), ajusté et centré dedans. Quand le plafond
 * retranche, les bandes sont LATÉRALES et le chrome suit la zone, jamais les
 * bords de la boîte. La première forme posait la piste à pleine largeur de
 * boîte : chaque page s'y ajustait à la boîte plafonnée, donc plus large que
 * la cible iOS, et le compteur flottait au-dessus d'une bande vide
 * (revue-correction #6898).
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `scrollLeft` est NÉGATIF sous `dir="rtl"` (Chromium, WebKit, Gecko
 * aujourd'hui) : la page se lit sur sa valeur absolue et la cible se pose
 * avec le signe de la direction — sinon, en arabe, `scrollTo({ left: +n })`
 * se borne à 0 et les flèches deviennent INERTES. */
function directionSign(element: Element): 1 | -1 {
  return typeof window !== 'undefined' && window.getComputedStyle(element).direction === 'rtl' ? -1 : 1;
}

const supportsScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

/** Le délai sans `scroll` après lequel un navigateur SANS `scrollend`
 * (Safari, dont la WebView iOS de la coque) considère le geste terminé. */
const SCROLL_SETTLE_MS = 120;

/** Tant que ce délai court après un défilement PROGRAMMATIQUE (flèche,
 * clavier), les `scroll`/`scrollend` intermédiaires d'une animation `smooth`
 * ne recalculent RIEN : un `Math.round` sur un `scrollLeft` encore PARTIEL
 * retomberait sur la page de départ, écrasant le `setPage(target)` déjà posé. */
const PROGRAMMATIC_GRACE_MS = 500;

export type FeedSceneCarouselProps = {
  readonly document: CanvasDocument;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly accent: string;
  /** Cette CARTE est-elle l'élue de l'autoplay (#6898 § 5.3) — seule la page
   * COURANTE en tient compte, jamais les autres. */
  readonly active: boolean;
  readonly authorName?: string;
  /** L'index VOYAGE avec le POST — même convention que `FeedSceneMosaic`. */
  readonly onOpenScene?: (postId: string, sceneIndex: number) => void;
  /** La réf de rappel de `useFeedAutoplayRoot` (#6898 § 5.3), posée sur la
   * boîte — STABLE (voir le doc-comment du hook). */
  readonly registerRef?: (node: Element | null) => void;
};

export function FeedSceneCarousel({ document, carrier, preferredLanguages, accent, active, authorName, onOpenScene, registerRef }: FeedSceneCarouselProps) {
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const language = currentInterfaceLanguage();
  const count = document.scenes.length;
  const current = Math.min(page, Math.max(0, count - 1));
  const naturalAspect = carouselAspect(document.scenes);
  const boxAspect = clampedCardAspect(naturalAspect);

  const [observeBox, box] = useElementSize();
  const boxRef = useCallback(
    (node: Element | null) => {
      observeBox(node);
      registerRef?.(node);
    },
    [observeBox, registerRef],
  );
  const frame = fitScene({ viewport: box, ratio: naturalAspect });

  const programmaticUntil = useRef(0);

  const scrollTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const target = Math.min(Math.max(index, 0), count - 1);
      if (track !== null && track.clientWidth > 0) {
        const reduced = prefersReducedMotion();
        programmaticUntil.current = performance.now() + (reduced ? 0 : PROGRAMMATIC_GRACE_MS);
        track.scrollTo({ left: directionSign(track) * target * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      }
      setPage(target);
    },
    [count],
  );

  const settle = useCallback(() => {
    if (performance.now() < programmaticUntil.current) return;
    const track = trackRef.current;
    if (track === null || track.clientWidth === 0) return;
    setPage(Math.min(Math.max(Math.round(Math.abs(track.scrollLeft) / track.clientWidth), 0), count - 1));
  }, [count]);

  // Repli SEULEMENT là où `scrollend` n'existe pas : un délai relancé à
  // chaque `scroll`, qui ne tire qu'une fois le geste arrêté — jamais un
  // calcul par trame pendant le glissement.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrollWithoutScrollEnd = useCallback(() => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      settle();
    }, SCROLL_SETTLE_MS);
  }, [settle]);
  useEffect(
    () => () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    },
    [],
  );

  // `backward`/`forward` gardent leur nom ; sous `dir="rtl"`, ← avance.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const toward = event.key === 'ArrowRight' ? 1 : -1;
      scrollTo(current + toward * directionSign(event.currentTarget));
    },
    [current, scrollTo],
  );

  const labels = { previous: translate(language, 'feed.scene.carousel.previous'), next: translate(language, 'feed.scene.carousel.next') };

  return (
    <div>
      <div ref={boxRef} data-feed-scene-box className="relative overflow-hidden" style={{ aspectRatio: String(boxAspect), borderRadius: 16 }}>
        <div
          data-feed-scene-frame
          className="absolute inset-0 m-auto"
          style={frame.width > 0 && frame.height > 0 ? { width: frame.width, height: frame.height } : { width: '100%', height: '100%' }}
        >
          <div
            ref={trackRef}
            data-feed-scene-track
            tabIndex={0}
            role="group"
            aria-label={translate(language, 'feed.scene.count', { count: String(count) })}
            onKeyDown={onKeyDown}
            {...(supportsScrollEnd ? { onScrollEnd: settle } : { onScroll: onScrollWithoutScrollEnd })}
            className="scrollbar-none flex size-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={{ scrollSnapType: 'x mandatory', outlineColor: 'var(--color-ios-brand)' }}
          >
            {document.scenes.map((_, index) => (
              <div
                key={index}
                className="size-full shrink-0"
                style={{ scrollSnapAlign: 'start' }}
                {...(index === current ? { 'aria-current': 'true' } : { inert: true })}
              >
                <FeedSceneSurface
                  document={document}
                  sceneIndex={index}
                  carrier={carrier}
                  preferredLanguages={preferredLanguages}
                  active={active && index === current}
                  frame="page"
                  {...(authorName !== undefined ? { authorName } : {})}
                  {...(onOpenScene !== undefined ? { onOpen: (openedIndex: number) => onOpenScene(carrier.postId, openedIndex) } : {})}
                />
              </div>
            ))}
          </div>
          <FeedCarouselChrome page={current} count={count} labels={labels} onPrevious={() => scrollTo(current - 1)} onNext={() => scrollTo(current + 1)} />
        </div>
      </div>
      <FeedCarouselDots page={current} count={count} accent={accent} />
    </div>
  );
}
