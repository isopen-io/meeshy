import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { ThumbnailCache } from '@/lib/export/message-card-thumbnails';

import { CARD_PALETTES, CARD_TYPEFACES, templateOf, type CardFont, type CardLinkId, type CardPalette, type MessageCardTemplateId } from '@/lib/export/message-card-templates';

import { LINK_SKETCH_SIDE, linkSketch, sketchMarks, type SketchInk, type SketchMark } from './thread-export-link-sketch';

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

/** Une case du choix de liaison : la liaison posée sur une carte miniature de la palette choisie (#18809). */
export function LinkGlyph({ link, palette }: { readonly link: CardLinkId; readonly palette: keyof typeof CARD_PALETTES }) {
  const inks: CardPalette = CARD_PALETTES[palette];
  const ink = (role: SketchInk): string =>
    ({ accent: inks.accent, quote: inks.quoteInk, reply: inks.replyInk, quotePanel: inks.quotePanel, replyPanel: inks.replyPanel })[role];
  return (
    <span data-link-sketch={link} aria-hidden="true" className="block overflow-hidden rounded-[10px]" style={{ width: 48, height: 48, background: paletteGradient(palette) }}>
      <svg viewBox={`0 0 ${LINK_SKETCH_SIDE} ${LINK_SKETCH_SIDE}`} width={48} height={48} direction="ltr">
        {sketchMarks(linkSketch(link)).map((mark, index) => (
          <SketchShape key={index} mark={mark} color={ink(mark.ink)} />
        ))}
      </svg>
    </span>
  );
}

function SketchShape({ mark, color }: { readonly mark: SketchMark; readonly color: string }) {
  switch (mark.kind) {
    case 'line':
      return <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke={color} strokeWidth={mark.width} strokeLinecap="round" strokeDasharray={mark.dash.length > 0 ? mark.dash.join(' ') : undefined} />;
    case 'dot':
      return <circle cx={mark.x} cy={mark.y} r={mark.radius} fill={color} />;
    case 'ring':
      return <circle cx={mark.x} cy={mark.y} r={mark.radius} fill="none" stroke={color} strokeWidth={1.6} />;
    case 'panel':
      return <rect x={mark.x} y={mark.y} width={mark.width} height={mark.height} rx={mark.height / 2} fill={color} />;
    case 'diamond':
      return <path d={`M${mark.x} ${mark.y - mark.radius}L${mark.x + mark.radius} ${mark.y}L${mark.x} ${mark.y + mark.radius}L${mark.x - mark.radius} ${mark.y}Z`} fill={color} />;
    case 'arrow':
      return (
        <path
          d={`M${mark.x} ${mark.top}V${mark.bottom - 3}Q${mark.x} ${mark.bottom} ${mark.x + 3} ${mark.bottom}H${mark.end}M${mark.end - 4} ${mark.bottom - 4}L${mark.end} ${mark.bottom}L${mark.end - 4} ${mark.bottom + 4}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'glyph':
      return (
        <text x={mark.x} y={mark.y} fontSize={mark.size} fontFamily={mark.serif ? 'Prata, serif' : 'var(--font-native)'} fontWeight={700} fill={color} textAnchor="middle" dominantBaseline="central">
          {mark.text}
        </text>
      );
  }
}
