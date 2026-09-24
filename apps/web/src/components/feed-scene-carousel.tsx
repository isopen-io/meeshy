import { useCallback, type KeyboardEvent } from 'react';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { fitScene } from '@/lib/canvas/fit';
import { carouselAspect, clampedCardAspect } from '@/lib/feed/scene-framing';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useElementSize } from '@/lib/view/use-element-size';
import { useSnapCarousel } from '@/lib/view/use-snap-carousel';

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
  const language = currentInterfaceLanguage();
  const count = document.scenes.length;
  const { current, trackRef, scrollTo, step, trackHandlers } = useSnapCarousel<HTMLDivElement>(count);
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

  // `backward`/`forward` gardent leur nom ; sous `dir="rtl"`, ← avance.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1, event.currentTarget);
    },
    [step],
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
            {...trackHandlers}
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
