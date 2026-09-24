import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';

/**
 * `FeedCarouselChrome` — LE CHROME D'UN CARROUSEL DE FIL (#6898, § 5.4) :
 * compteur en haut à la fin de ligne, flèche(s) `backward`/`forward` (jamais
 * left/right — RTL), et `FeedCarouselDots` SOUS la boîte. Miroir
 * `PostSceneMosaic.swift:259-330` — les flèches ne se posent QUE là où elles
 * ont un effet (aucune « précédente » en page 1, aucune « suivante » en
 * dernière page).
 *
 * PARTAGÉ par les DEUX carrousels du fil, celui des SCÈNES
 * (`feed-scene-carousel.tsx`) et celui des MÉDIAS
 * (`feed-post-card.tsx#FeedMediaCarousel`) : « que ce soit mosaïque de média
 * ou de scène c'est la même chose » (`PostSceneMosaic.swift`, `fleches`). La
 * première forme de ce lot laissait au carrousel des médias son chrome propre
 * — bandes de 44 sans cercle, compteur et pastilles d'une autre géométrie —
 * et deux carrousels voisins du même fil se lisaient donc comme deux
 * applications (revue-correction #6898).
 *
 * Le chrome se pose À L'INTÉRIEUR d'un conteneur `relative` fourni par
 * l'hôte ; les positions sont LOGIQUES (`start`/`end`) et le glyphe se
 * retourne sous `dir="rtl"`, où « suivant » est à gauche.
 */
export type FeedCarouselChromeLabels = {
  readonly previous: string;
  readonly next: string;
};

export function FeedCarouselChrome({
  page,
  count,
  labels,
  onPrevious,
  onNext,
}: {
  readonly page: number;
  readonly count: number;
  readonly labels: FeedCarouselChromeLabels;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  if (count <= 1) return null;
  return (
    <>
      <span
        data-feed-media-counter
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 end-2.5 rounded-full px-2.5 py-1.25 font-mono text-[12px] font-bold text-white"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        {page + 1} / {count}
      </span>
      {page > 0 ? <CarouselArrow direction="backward" label={labels.previous} onPress={onPrevious} /> : null}
      {page < count - 1 ? <CarouselArrow direction="forward" label={labels.next} onPress={onNext} /> : null}
    </>
  );
}

/** Une flèche : cible 44 transparente, cercle de 34 peint dedans — la cible
 * tactile ne grossit jamais le disque (`fleche`, `PostSceneMosaic.swift`). */
function CarouselArrow({ direction, label, onPress }: { readonly direction: 'backward' | 'forward'; readonly label: string; readonly onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-feed-carousel-arrow={direction}
      onClick={onPress}
      className={`absolute inset-y-0 my-auto grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 ${direction === 'backward' ? 'start-2.5' : 'end-2.5'}`}
      style={{ outlineColor: 'white' }}
    >
      <span className="grid size-[34px] place-items-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <GlyphSvg
          glyph={FEED_GLYPHS.caretRight}
          size={14}
          className={direction === 'backward' ? '-scale-x-100 rtl:scale-x-100' : 'rtl:-scale-x-100'}
          style={{ color: 'white' }}
        />
      </span>
    </button>
  );
}

/**
 * `FeedCarouselDots` — les pastilles de pagination, SOUS la boîte
 * (`PostSceneMosaic.swift:194-218` et `:318-330` : `pastilles` posées APRÈS
 * la boîte, espacées de 8 au-dessus, 6 entre elles — posées dedans, elles se
 * disputeraient le bas avec la légende).
 */
export function FeedCarouselDots({ page, count, accent }: { readonly page: number; readonly count: number; readonly accent: string }) {
  if (count <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true" data-feed-carousel-dots>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="rounded-full transition-[width] motion-reduce:transition-none"
          style={{ width: i === page ? 18 : 6, height: 6, backgroundColor: accent, opacity: i === page ? 1 : 0.28 }}
        />
      ))}
    </div>
  );
}
