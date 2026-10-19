/**
 * LE RENDU DE RÉFÉRENCE de l'apparence (#10632, § 5.1–5.2) — fonctions PURES,
 * sans DOM : `AppearanceDesign` / `AvatarRingDesign` → texte SVG. C'est la
 * référence visuelle : la passerelle s'en sert pour rasteriser les
 * couvertures, le web pour peindre, iOS la reproduit en `Canvas` depuis la
 * MÊME donnée.
 *
 * Tout ce qui entre dans le texte vient de champs déjà validés (hex
 * majuscules, chemins aux seules commandes SVG, nombres) : aucun balisage
 * reçu n'est jamais interprété. Les nombres sont arrondis à 2 décimales pour
 * une sortie stable, testable par égalité.
 */
import type { AppearanceDesign, DesignStroke, PaintRole } from '../types/appearance-design.js';
import type { AvatarRingDesign } from '../types/avatar-ring-design.js';
import { conversationAccentPaletteFromPrimary } from './conversation-colors.js';
import { frameMotionLayers, linearGradientMarkup, motionLayerMarkup, pathBounds, scopeId, sweepLayerMarkup } from './frame-motion-svg.js';

export type AppearanceScheme = 'light' | 'dark';

export type DesignRenderArgs = {
  readonly design: AppearanceDesign;
  readonly scheme: AppearanceScheme;
  /** L'accent EFFECTIF du lecteur (personnel ou calculé), `#RRGGBB`. */
  readonly accent: string;
};

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const num = (value: number): string => String(round2(value));

/** L'accent tombe sur Indigo Meeshy s'il n'est pas un `#RRGGBB` : rien de non validé n'entre dans le texte. */
const FALLBACK_ACCENT = '#6366F1';
const ACCENT_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const safeAccent = (accent: string): string => (ACCENT_PATTERN.test(accent) ? accent.toUpperCase() : FALLBACK_ACCENT);

const roleColor = ({ design, scheme, accent }: DesignRenderArgs, role: PaintRole): string => {
  const palette = design.palettes[scheme];
  const effective = palette.accent ?? safeAccent(accent);
  switch (role) {
    case 'ink':
      return palette.ink;
    case 'soft':
      return palette.soft;
    case 'base':
      return palette.base;
    case 'accent':
      return effective;
    case 'accent-next':
      return conversationAccentPaletteFromPrimary(effective).secondary;
    case 'accent-prev':
      return conversationAccentPaletteFromPrimary(effective).accent;
  }
};

const pathMarkup = (d: string, color: string, opacity: number, width: number | undefined): string =>
  width === undefined
    ? `<path d="${d}" fill="${color}" fill-opacity="${num(opacity)}"/>`
    : `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(width)}" stroke-opacity="${num(opacity)}"/>`;

const strokeMarkup = (args: DesignRenderArgs, stroke: DesignStroke): string =>
  pathMarkup(stroke.d, roleColor(args, stroke.role), stroke.opacity, stroke.width);

const svgOpen = (width: number, height: number, viewBox: string): string =>
  `<svg ${XMLNS} width="${num(width)}" height="${num(height)}" viewBox="${viewBox}">`;

const baseRect = (args: DesignRenderArgs, width: number, height: number): string =>
  `<rect width="${num(width)}" height="${num(height)}" fill="${roleColor(args, 'base')}"/>`;

/** La tuile d'un motif à sa taille naturelle (le client applique `scale` et `rotation`). Vide hors motif. */
export function designTileSvg(args: DesignRenderArgs): string {
  const tile = args.design.tile;
  if (tile === undefined) return '';
  const body = tile.paths.map((stroke) => strokeMarkup(args, stroke)).join('');
  return `${svgOpen(tile.width, tile.height, `0 0 ${num(tile.width)} ${num(tile.height)}`)}${baseRect(args, tile.width, tile.height)}${body}</svg>`;
}

/**
 * La portée des identifiants d'un rendu : tout ce dont sa sortie dépend. Deux
 * fonds posés dans la même page (galerie, aperçus) ne se volent jamais leur
 * `url(#…)` ; deux rendus de même portée sont identiques, donc les partager
 * est sans effet.
 */
const idScope = (args: DesignRenderArgs, width: number, height: number): string =>
  `${args.design.key}-${args.scheme}-${safeAccent(args.accent).slice(1)}-${num(width)}x${num(height)}`.replace(/\./g, '_');

const patternMarkup = (args: DesignRenderArgs, width: number, height: number): string => {
  const tile = args.design.tile;
  if (tile === undefined) return '';
  const id = `t-${idScope(args, width, height)}`;
  const paths = tile.paths.map((stroke) => strokeMarkup(args, stroke)).join('');
  const scaled = tile.scale === 1 ? paths : `<g transform="scale(${num(tile.scale)})">${paths}</g>`;
  const turn = tile.rotation === 0 ? '' : ` patternTransform="rotate(${num(tile.rotation)})"`;
  return (
    `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${num(tile.width * tile.scale)}" height="${num(tile.height * tile.scale)}"${turn}>${scaled}</pattern></defs>` +
    `<rect width="${num(width)}" height="${num(height)}" fill="url(#${id})"/>`
  );
};

const ANCHOR_ASPECT = { bottom: 'xMidYMax meet', center: 'xMidYMid meet', 'bottom-end': 'xMaxYMax meet' } as const;

const sceneMarkup = (args: DesignRenderArgs, width: number, height: number): string => {
  const scene = args.design.scene;
  if (scene === undefined) return '';
  const [, , sceneWidth, sceneHeight] = scene.viewBox;
  const body = scene.paths.map((stroke) => strokeMarkup(args, stroke)).join('');
  return `<svg width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(sceneWidth)} ${num(sceneHeight)}" preserveAspectRatio="${ANCHOR_ASPECT[scene.anchor]}">${body}</svg>`;
};

const gradientMarkup = (args: DesignRenderArgs, width: number, height: number): string => {
  const gradient = args.design.gradient;
  if (gradient === undefined) return '';
  const scope = idScope(args, width, height);
  const radians = (gradient.angle * Math.PI) / 180;
  const [dx, dy] = [Math.sin(radians) / 2, -Math.cos(radians) / 2];
  const stops = gradient.stops.map((stop) => `<stop offset="${num(stop.at)}" stop-color="${roleColor(args, stop.role)}"/>`).join('');
  const reach = Math.max(width, height);
  const blobDefs = gradient.blobs
    .map((blob, index) => {
      const color = roleColor(args, blob.role);
      return `<radialGradient id="b${index}-${scope}" gradientUnits="userSpaceOnUse" cx="${num(blob.x * width)}" cy="${num(blob.y * height)}" r="${num(blob.r * reach)}"><stop offset="0" stop-color="${color}" stop-opacity="${num(blob.opacity)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    })
    .join('');
  const blobs = gradient.blobs
    .map((blob, index) => `<circle cx="${num(blob.x * width)}" cy="${num(blob.y * height)}" r="${num(blob.r * reach)}" fill="url(#b${index}-${scope})"/>`)
    .join('');
  return (
    `<defs><linearGradient id="g-${scope}" x1="${num(0.5 - dx)}" y1="${num(0.5 - dy)}" x2="${num(0.5 + dx)}" y2="${num(0.5 + dy)}">${stops}</linearGradient>${blobDefs}</defs>` +
    `<rect width="${num(width)}" height="${num(height)}" fill="url(#g-${scope})"/>${blobs}`
  );
};

/** Le fond ENTIER (9:19 pour un fil, 3:1 pour une bannière) aux dimensions demandées. */
export function designToSvg(args: DesignRenderArgs & { readonly width: number; readonly height: number }): string {
  const { width, height, design } = args;
  const layer =
    design.style === 'pattern'
      ? patternMarkup(args, width, height)
      : design.style === 'illustration'
        ? sceneMarkup(args, width, height)
        : gradientMarkup(args, width, height);
  const base = design.style === 'gradient' ? '' : baseRect(args, width, height);
  return `${svgOpen(width, height, `0 0 ${num(width)} ${num(height)}`)}${base}${layer}</svg>`;
}

// ── Les contours d'avatar ───────────────────────────────────────────────

const RING_BOX = 100;
const RING_DOTS = 28;
const RING_DASHES = 36;
const RING_ARCS = 24;

const lerpHex = (from: string, to: string, t: number): string => {
  const channel = (hex: string, index: number): number => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * t).toString(16).toUpperCase().padStart(2, '0')).join('')}`;
};

/** Un dégradé cyclique : la couleur à la fraction `t` d'un tour, le dernier segment ramenant à la première couleur. */
const cyclicColor = (colors: readonly string[], t: number): string => {
  const loop = [...colors, colors[0] ?? '#000000'];
  const scaled = t * (loop.length - 1);
  const index = Math.min(Math.floor(scaled), loop.length - 2);
  return lerpHex(loop[index] ?? '#000000', loop[index + 1] ?? '#000000', scaled - index);
};

const ringCircle = (radius: number, width: number, color: string, extra = ''): string =>
  `<circle cx="50" cy="50" r="${num(radius)}" fill="none" stroke="${color}" stroke-width="${num(width)}"${extra}/>`;

const gradientRing = (radius: number, width: number, colors: readonly string[]): string =>
  Array.from({ length: RING_ARCS }, (_, index) => {
    const [from, to] = [index / RING_ARCS, (index + 1) / RING_ARCS].map((t) => t * Math.PI * 2 - Math.PI / 2) as [number, number];
    const point = (angle: number): string => `${num(50 + radius * Math.cos(angle))} ${num(50 + radius * Math.sin(angle))}`;
    return `<path d="M${point(from)} A${num(radius)} ${num(radius)} 0 0 1 ${point(to + 0.004)}" fill="none" stroke="${cyclicColor(colors, index / RING_ARCS)}" stroke-width="${num(width)}"/>`;
  }).join('');

const ringStroke = (ring: AvatarRingDesign): string => {
  const width = ring.stroke.width * RING_BOX;
  const radius = RING_BOX / 2 - width / 2;
  const [first, second] = [ring.stroke.colors[0] ?? '#000000', ring.stroke.colors[1] ?? ring.stroke.colors[0] ?? '#000000'];
  const circumference = 2 * Math.PI * radius;
  switch (ring.stroke.style) {
    case 'solid':
      return ringCircle(radius, width, first);
    case 'double':
      return ringCircle(radius, width, first) + ringCircle(radius - width * 2, width, second);
    case 'dotted':
      return ringCircle(radius, width, first, ` stroke-dasharray="0 ${num(circumference / RING_DOTS)}" stroke-linecap="round"`);
    case 'dashed':
      return ringCircle(radius, width, first, ` stroke-dasharray="${num((circumference / RING_DASHES) * 0.6)} ${num((circumference / RING_DASHES) * 0.4)}"`);
    case 'gradient':
      return gradientRing(radius, width, ring.stroke.colors);
    case 'none':
      return '';
  }
};

type RingPart = { readonly stroke: boolean; readonly include: (index: number) => boolean; readonly scope: string };

/** Le dessin d'un contour, réduit aux parties demandées : le trait, puis les chemins d'ornement retenus. */
const ringSvgOf = (ring: AvatarRingDesign, size: number, part: RingPart): string => {
  const paths = (ring.ornament?.paths ?? []).flatMap((path, index) => (part.include(index) ? [path] : []));
  const gradients = ring.gradients ?? [];
  const used = new Set(paths.flatMap((path) => (path.gradient === undefined || gradients[path.gradient] === undefined ? [] : [path.gradient])));
  const ids = gradients.map((_, index) => `rg${index}-${part.scope}`);
  const defs = [...used].sort((a, b) => a - b).map((index) => linearGradientMarkup(ids[index]!, gradients[index]!, ring.stroke.colors)).join('');
  const paint = (path: (typeof paths)[number]): string =>
    path.gradient !== undefined && used.has(path.gradient) ? `url(#${ids[path.gradient]})` : (ring.stroke.colors[path.color] ?? '#000000');
  const ornament = paths.map((path) => pathMarkup(path.d, paint(path), path.opacity, path.width)).join('');
  return `${svgOpen(size, size, `0 0 ${RING_BOX} ${RING_BOX}`)}${defs === '' ? '' : `<defs>${defs}</defs>`}${part.stroke ? ringStroke(ring) : ''}${ornament}</svg>`;
};

/** Un contour d'avatar : viewBox 0 0 100 100, l'avatar occupe le cercle de rayon 42 au centre. */
export function avatarRingSvg({ ring, size }: { readonly ring: AvatarRingDesign; readonly size: number }): string {
  return ringSvgOf(ring, size, { stroke: true, include: () => true, scope: scopeId(ring.key, size) });
}

/**
 * Le contour pour un client (#10935) : le dessin FIXE, puis une couche composée par
 * mouvement (`frame-motion-svg.ts`) — les chemins animés quittent le dessin fixe, un
 * reflet glisse sur sa cible sans l'en sortir. Sans mouvement, ou `animated: false`
 * (mouvement réduit, aperçu), c'est `avatarRingSvg` à l'octet.
 */
export function avatarRingMarkup({ ring, size, animated }: { readonly ring: AvatarRingDesign; readonly size: number; readonly animated: boolean }): string {
  const motions = ring.motion ?? [];
  if (!animated || motions.length === 0) return avatarRingSvg({ ring, size });
  const paths = ring.ornament?.paths ?? [];
  const plan = frameMotionLayers({ elements: paths.map((path) => ({ group: path.group, bounds: pathBounds(path.d) })), motions, center: { x: RING_BOX / 2, y: RING_BOX / 2 } });
  if (plan.layers.length === 0 && plan.sweeps.length === 0) return avatarRingSvg({ ring, size });
  const scope = scopeId(ring.key, size);
  const base = ringSvgOf(ring, size, { stroke: true, include: (index) => !plan.animated.has(index), scope });
  const layers = plan.layers
    .map((layer, order) => motionLayerMarkup(layer.chain, size / RING_BOX, ringSvgOf(ring, size, { stroke: false, include: (index) => layer.elements.includes(index), scope: `${scope}-L${order}` })))
    .join('');
  const sweeps = plan.sweeps
    .map((sweep) => {
      const mask = `${svgOpen(size, size, `0 0 ${RING_BOX} ${RING_BOX}`)}${sweep.elements.map((index) => pathMarkup(paths[index]!.d, '#FFFFFF', 1, paths[index]!.width)).join('')}</svg>`;
      return sweepLayerMarkup({ sweep, maskSvg: mask, width: size, height: size });
    })
    .join('');
  return base + layers + sweeps;
}
