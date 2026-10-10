import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { ThumbnailCache } from '@/lib/export/message-card-thumbnails';
import { CARD_PALETTES, CARD_TYPEFACES, templateOf, type CardFont, type CardLinkId, type MessageCardTemplateId } from '@/lib/export/message-card-templates';

/**
 * **UNE VIGNETTE DE TEMPLATE** — la carte réelle, réduite, dès qu'elle entre à
 * l'écran ; en attendant, le fond de sa palette et un « Aa » dans sa police :
 * jamais un carré vide, jamais un saut quand l'image arrive (même format).
 */

export type ThumbSource = {
  readonly cache: ThumbnailCache;
  /** La clé de la vignette d'un template dans l'état courant de la carte (langue, titre, anonymat). */
  readonly keyOf: (id: MessageCardTemplateId) => string;
  readonly render: (id: MessageCardTemplateId) => Promise<Blob | null>;
};

export const paletteGradient = (id: keyof typeof CARD_PALETTES): string =>
  `linear-gradient(160deg, ${CARD_PALETTES[id].background.map(([offset, color]) => `${color} ${Math.round(offset * 100)}%`).join(', ')})`;

/** Une police de carte en CSS — la famille embarquée par `story-fonts.css`, puis la pile native. */
export const cssFontOf = (font: CardFont, sizePx: number): CSSProperties => ({
  fontFamily: font.family === null ? 'var(--font-native)' : `"${font.family}", var(--font-native)`,
  fontWeight: font.weight,
  fontStyle: font.style,
  fontSize: sizePx,
  lineHeight: 1,
});

function useVisible(ref: { readonly current: Element | null }): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    /* Sans observateur (vieux moteur), la vignette se peint tout de suite : jamais un « Aa » éternel. */
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

export function CardThumb({
  id,
  source,
  label,
  pressed,
  width,
  onPick,
  data,
}: {
  readonly id: MessageCardTemplateId;
  readonly source: ThumbSource;
  readonly label: string;
  readonly pressed: boolean;
  readonly width: number | string;
  readonly onPick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const visible = useVisible(ref);
  const key = source.keyOf(id);
  const [url, setUrl] = useState<string | null>(() => source.cache.get(key));
  const template = templateOf(id);

  useEffect(() => {
    setUrl(source.cache.get(key));
    return source.cache.subscribe(() => setUrl(source.cache.get(key)));
  }, [source, key]);

  useEffect(() => {
    if (visible) source.cache.request(key, () => source.render(id));
  }, [visible, source, key, id]);

  return (
    <button
      ref={ref}
      {...data}
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onPick}
      className="relative block shrink-0 overflow-hidden rounded-quote transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
      style={{
        width,
        aspectRatio: '1 / 1.05',
        background: paletteGradient(template.paletteId),
        outline: pressed ? '2.5px solid var(--color-ios-ink)' : undefined,
        outlineOffset: 2,
      }}
    >
      {url === null ? (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center" style={{ ...cssFontOf(CARD_TYPEFACES[template.typefaceId].replyFont, 22), color: template.palette.replyInk }}>
          Aa
        </span>
      ) : (
        /* La carte ENTIÈRE, jamais rognée (#8693) : une carte haute perdait sa liaison sous le bord de la vignette. */
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </button>
  );
}

/** Le dessin d'une liaison, en petit : ce qu'elle PEINT entre la question et la réponse. */
export function LinkGlyph({ link }: { readonly link: CardLinkId }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 50 34" width={46} height={30} aria-hidden="true" {...common}>
      {link === 'orbite' ? (
        <>
          <path d="M4 17h14M32 17h14" strokeDasharray="1 5" />
          <circle cx="25" cy="17" r="4" />
        </>
      ) : null}
      {link === 'filet' ? <path d="M6 17h16" strokeWidth={3.4} /> : null}
      {link === 'guillemets' ? (
        <text x="6" y="33" fontSize="36" fontFamily="Prata, serif" fill="currentColor" stroke="none">
          “
        </text>
      ) : null}
      {link === 'fleche' ? <path d="M12 6v8a4 4 0 0 0 4 4h14M25 13l5 5-5 5" /> : null}
      {link === 'bulles' ? (
        <>
          <rect x="3" y="4" width="28" height="11" rx="5.5" />
          <rect x="19" y="19" width="28" height="11" rx="5.5" />
        </>
      ) : null}
      {link === 'fil' ? (
        <>
          <path d="M10 3v21" />
          <circle cx="10" cy="28" r="3.2" fill="currentColor" />
        </>
      ) : null}
      {link === 'silence' ? <path d="M8 17h34" strokeDasharray="2 5" opacity={0.4} /> : null}
    </svg>
  );
}
