/**
 * LE RENDU DE RÉFÉRENCE D'UN CADRE DE BANNIÈRE (#10935) — fonctions PURES, sans
 * DOM : `BannerFrameDesign` (#10932) → texte SVG / HTML. Le cadre se pose PAR-
 * DESSUS la photo de bannière (ou le fond) : il ne peint jamais son centre.
 *
 * Gabarit 0 0 300 100, hauteur = échelle : à la largeur LOGIQUE `W = largeur ×
 * 100 / hauteur`, la bordure et ses filets se tracent à `W` (jamais un chemin
 * étiré), les pièces restent fixes à leur ancrage (`start` à gauche, `end` à
 * droite, `center` au milieu), les frises répètent leur module entre `from` et
 * `W − to` — `repeat` pose des modules entiers (centrés dans l'espace), `justify`
 * recalcule le module pour tomber juste.
 *
 * Le centre transparent est garanti par la DÉCOUPE, jamais par la donnée : tout
 * ce que le cadre dessine passe sous `bannerFrameClipPath`, la région de
 * `bannerFrameDrawableRegion` (pourtour + coins + cartouche) en un seul chemin à
 * enroulement non nul. Un chemin posé au milieu du trou ne s'y peint donc pas.
 *
 * iOS reproduit la même géométrie (`BannerFrameView`, MeeshyUI) depuis la MÊME
 * donnée.
 */
import { bannerFrameDrawableRegion, type BannerFrameDesign, type BannerFramePath, type FrameRect } from '../types/banner-frame-design.js';
import { frameMotionLayers, linearGradientMarkup, motionLayerMarkup, num, pathBounds, scopeId, sweepLayerMarkup, type Bounds, type MotionPlan } from './frame-motion-svg.js';

const TEMPLATE_WIDTH = 300;
const HEIGHT = 100;
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

export type FrameInstance = { readonly tx: number; readonly sx: number };

export type BannerFrameElement = {
  readonly path: BannerFramePath;
  /** `x' = tx + sx × x` : l'ancrage d'une pièce, la place (et l'échelle) d'un module de frise. */
  readonly transform: FrameInstance;
  readonly bounds: Bounds | null;
  readonly group?: string | undefined;
};

/** La largeur logique d'une bannière de `width × height` pixels. */
export const bannerFrameLogicalWidth = (width: number, height: number): number => (height > 0 ? (width * HEIGHT) / height : TEMPLATE_WIDTH);

const placed = (bounds: Bounds | null, { tx, sx }: FrameInstance): Bounds | null =>
  bounds === null ? null : { minX: tx + sx * bounds.minX, minY: bounds.minY, maxX: tx + sx * bounds.maxX, maxY: bounds.maxY };

const element = (path: BannerFramePath, transform: FrameInstance): BannerFrameElement => ({ path, transform, bounds: placed(pathBounds(path.d), transform), group: path.group });

const anchorShift = (anchor: 'start' | 'center' | 'end', width: number): number => {
  if (anchor === 'end') return width - TEMPLATE_WIDTH;
  if (anchor === 'center') return (width - TEMPLATE_WIDTH) / 2;
  return 0;
};

/** Les instances d'une frise à la largeur logique `width`. */
const friezeInstances = (frieze: NonNullable<BannerFrameDesign['friezes']>[number], width: number): readonly FrameInstance[] => {
  const span = width - frieze.from - frieze.to;
  if (span < frieze.module) return [];
  if (frieze.fit === 'repeat') {
    const count = Math.floor(span / frieze.module);
    const offset = (span - count * frieze.module) / 2;
    return Array.from({ length: count }, (_, index) => ({ tx: offset + index * frieze.module, sx: 1 }));
  }
  const count = Math.max(1, Math.round(span / frieze.module));
  const scale = span / (count * frieze.module);
  return Array.from({ length: count }, (_, index) => ({ tx: frieze.from + index * frieze.module * scale - frieze.from * scale, sx: scale }));
};

/**
 * Ce que le cadre dessine à la largeur logique `width` : les FRISES d'abord, les PIÈCES
 * ensuite (#10936) — un coin et un cartouche se posent PAR-DESSUS la frise qui court
 * dessous, à toutes les largeurs ; chaque liste dans l'ordre du document.
 */
export function bannerFrameElements(frame: BannerFrameDesign, width: number): readonly BannerFrameElement[] {
  const friezes = (frame.friezes ?? []).flatMap((frieze) => friezeInstances(frieze, width).flatMap((instance) => frieze.paths.map((path) => element(path, instance))));
  const pieces = (frame.pieces ?? []).flatMap((piece) => piece.paths.map((path) => element(path, { tx: anchorShift(piece.anchor, width), sx: 1 })));
  return [...friezes, ...pieces];
}

const rectPath = (rect: FrameRect): string =>
  `M${num(rect.x)} ${num(rect.y)}H${num(rect.x + rect.width)}V${num(rect.y + rect.height)}H${num(rect.x)}Z`;

/**
 * LA DÉCOUPE : la région où le cadre peint, en un chemin à enroulement NON NUL —
 * le pourtour dans le sens horaire, le trou dans l'autre (il s'annule), les coins
 * et le cartouche dans le sens horaire (ils rajoutent). `scale` passe du repère du
 * dessin aux pixels (`clip-path: path()` d'un client).
 */
export function bannerFrameClipPath(frame: Pick<BannerFrameDesign, 'border' | 'reach'>, width: number, scale = 1): string {
  const region = bannerFrameDrawableRegion(frame, width);
  const s = (rect: FrameRect): FrameRect => ({ x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale });
  const outer = s(region.outer);
  const hole = s(region.hole);
  const holePath = `M${num(hole.x)} ${num(hole.y)}V${num(hole.y + hole.height)}H${num(hole.x + hole.width)}V${num(hole.y)}Z`;
  return [rectPath(outer), holePath, ...region.reserved.map((rect) => rectPath(s(rect)))].join('');
}

type Paint = { readonly color: number; readonly gradient?: number | undefined };

const paintOf = (frame: BannerFrameDesign, paint: Paint, gradientIds: readonly string[]): string => {
  const id = paint.gradient === undefined ? undefined : gradientIds[paint.gradient];
  return id === undefined ? (frame.palette[paint.color] ?? '#000000') : `url(#${id})`;
};

const pathMarkup = (path: BannerFramePath, color: string): string => {
  const rule = path.fillRule === undefined ? '' : ` fill-rule="${path.fillRule}"`;
  return path.width === undefined
    ? `<path d="${path.d}" fill="${color}" fill-opacity="${num(path.opacity)}"${rule}/>`
    : `<path d="${path.d}" fill="none" stroke="${color}" stroke-width="${num(path.width)}" stroke-opacity="${num(path.opacity)}"/>`;
};

const placedMarkup = (item: BannerFrameElement, body: string): string =>
  item.transform.tx === 0 && item.transform.sx === 1 ? body : `<g transform="translate(${num(item.transform.tx)} 0)${item.transform.sx === 1 ? '' : ` scale(${item.transform.sx} 1)`}">${body}</g>`;

const elementMarkup = (frame: BannerFrameDesign, item: BannerFrameElement, gradientIds: readonly string[]): string =>
  placedMarkup(item, pathMarkup(item.path, paintOf(frame, item.path, gradientIds)));

const gradientDefs = (frame: BannerFrameDesign, scope: string): { readonly ids: readonly string[]; readonly defs: string } => {
  const gradients = frame.gradients ?? [];
  const ids = gradients.map((_, index) => `fg${index}-${scope}`);
  return { ids, defs: gradients.map((gradient, index) => linearGradientMarkup(ids[index]!, gradient, frame.palette)).join('') };
};

const borderMarkup = (frame: BannerFrameDesign, width: number, gradientIds: readonly string[]): string => {
  const border = frame.border;
  const b = border.width;
  const band = `<path d="M0 0H${num(width)}V100H0ZM${num(b)} ${num(b)}V${num(HEIGHT - b)}H${num(width - b)}V${num(b)}Z" fill="${paintOf(frame, border, gradientIds)}" fill-opacity="${num(border.opacity)}" fill-rule="evenodd"/>`;
  const filets = (border.filets ?? [])
    .map(
      (filet) =>
        `<rect x="${num(filet.inset)}" y="${num(filet.inset)}" width="${num(width - 2 * filet.inset)}" height="${num(HEIGHT - 2 * filet.inset)}" fill="none" stroke="${paintOf(frame, filet, gradientIds)}" stroke-width="${num(filet.width)}" stroke-opacity="${num(filet.opacity)}"/>`,
    )
    .join('');
  return band + filets;
};

type SvgArgs = { readonly frame: BannerFrameDesign; readonly width: number; readonly height: number };

const svgOpen = (width: number, height: number, logical: number): string =>
  `<svg ${XMLNS} width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(logical)} 100">`;

const NO_PLAN: MotionPlan = { layers: [], sweeps: [], animated: new Set() };

const staticSvg = ({ frame, width, height }: SvgArgs, elements: readonly BannerFrameElement[], skip: ReadonlySet<number>): string => {
  const logical = bannerFrameLogicalWidth(width, height);
  const scope = scopeId(frame.key, width, height);
  const { ids, defs } = gradientDefs(frame, scope);
  const clipId = `fc-${scope}`;
  const body = borderMarkup(frame, logical, ids) + elements.flatMap((item, index) => (skip.has(index) ? [] : [elementMarkup(frame, item, ids)])).join('');
  return `${svgOpen(width, height, logical)}<defs><clipPath id="${clipId}"><path d="${bannerFrameClipPath(frame, logical)}"/></clipPath>${defs}</defs><g clip-path="url(#${clipId})">${body}</g></svg>`;
};

/** Le cadre FIXE, tout son dessin sous la découpe : la référence visuelle, sans mouvement. */
export function bannerFrameSvg(args: SvgArgs): string {
  const logical = bannerFrameLogicalWidth(args.width, args.height);
  return staticSvg(args, bannerFrameElements(args.frame, logical), new Set());
}

const layerSvg = ({ frame, width, height }: SvgArgs, elements: readonly BannerFrameElement[], members: readonly number[], suffix: string): string => {
  const logical = bannerFrameLogicalWidth(width, height);
  const { ids, defs } = gradientDefs(frame, `${scopeId(frame.key, width, height)}-${suffix}`);
  const body = members.map((index) => elementMarkup(frame, elements[index]!, ids)).join('');
  return `${svgOpen(width, height, logical)}${defs === '' ? '' : `<defs>${defs}</defs>`}${body}</svg>`;
};

const maskSvg = ({ width, height }: SvgArgs, elements: readonly BannerFrameElement[], members: readonly number[]): string => {
  const logical = bannerFrameLogicalWidth(width, height);
  const body = members.map((index) => placedMarkup(elements[index]!, pathMarkup({ ...elements[index]!.path, opacity: 1 }, '#FFFFFF'))).join('');
  return `${svgOpen(width, height, logical)}${body}</svg>`;
};

/**
 * Le cadre pour un client : un `<span>` découpé (`clip-path: path()`, en pixels) qui
 * porte le dessin fixe, puis une couche composée par mouvement (`frame-motion-svg.ts`).
 * `animated: false` (mouvement réduit, aperçu) ⇒ le seul dessin fixe, complet.
 */
export function bannerFrameMarkup(args: SvgArgs & { readonly animated: boolean }): string {
  const { frame, width, height } = args;
  const logical = bannerFrameLogicalWidth(width, height);
  const elements = bannerFrameElements(frame, logical);
  const plan = args.animated && (frame.motion?.length ?? 0) > 0 ? frameMotionLayers({ elements, motions: frame.motion ?? [], center: { x: logical / 2, y: HEIGHT / 2 } }) : NO_PLAN;
  const scale = height / HEIGHT;
  const layers = plan.layers.map((layer, index) => motionLayerMarkup(layer.chain, scale, layerSvg(args, elements, layer.elements, `L${index}`))).join('');
  const sweeps = plan.sweeps.map((sweep) => sweepLayerMarkup({ sweep, maskSvg: maskSvg(args, elements, sweep.elements), width, height })).join('');
  const clip = bannerFrameClipPath(frame, logical, scale);
  return `<span data-banner-frame-art="${frame.key}" style="position:absolute;inset:0;clip-path:path('${clip}');pointer-events:none">${staticSvg(args, elements, plan.animated)}${layers}${sweeps}</span>`;
}
