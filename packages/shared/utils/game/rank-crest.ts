/**
 * LE BLASON D'UN RANG — SA GÉOMÉTRIE (#9636). Une TABLE, pas du dessin : le web
 * la peint en SVG (`apps/web/src/components/game/rank-blason.tsx`), l'app iOS la
 * recopie forme pour forme. Même principe que la Signature unique d'un Mythe
 * (`mythic-signature.ts`), qu'elle pose en halo.
 *
 * Repère : le cadre du blason, 200 × 184 ; l'écu y occupe x 64 → 136, y 36 → 119
 * (sa pointe en (100, 119)). Les angles se comptent en degrés depuis MIDI, dans
 * le sens horaire (x = cx + r·sin θ, y = cy − r·cos θ) — la convention de la
 * Signature unique.
 *
 * ## La décoration de chaque rang, à la Signature
 *
 * Chaque rang porte une décoration PROPRE, faite de traits à bouts ronds comme
 * les trois traits de Meeshy, de plus en plus riche (le nombre de pièces ne
 * descend jamais d'un rang au suivant) :
 *
 *   · Murmure     — un trait ;
 *   · Écho        — deux arcs ;
 *   · Voix        — trois traits en éventail ;
 *   · Conteur     — la feuille (une feuille nervurée, deux feuilles d'appui) ;
 *   · Passeur     — l'arche (deux arcs, la clé, les deux piles) ;
 *   · Polyglotte  — les fils tressés (deux fils qui se croisent, un fil droit, trois nœuds) ;
 *   · Ambassadeur — la couronne de laurier (deux tiges, cinq feuilles chacune) ;
 *   · Orateur     — le laurier et les rayons (sept autour de (100, 46), de −54° à 54°
 *                   par pas de 18° ; les impairs longs, 20 → 34, les pairs courts, 22 → 30) ;
 *   · Oracle      — le laurier et l'étoile (trois traits croisés, un cœur, quatre éclats) ;
 *   · Légende     — le laurier et la couronne de traits (une base, cinq traits, trois joyaux) ;
 *   · Mythe       — le halo prismatique : la Signature unique de son ÉMISSION
 *                   (`mythicHalo`), son numéro gravé sous l'écu.
 *
 * Les pièces ne disent AUCUNE couleur : `tone` nomme un rôle, que chaque client
 * traduit dans ses jetons — `metal` (la matière du rang), `gold` (l'or), `ink`
 * (l'encre de la matière, posée SUR une pièce, jamais sur le fond de la page).
 * Un trait se peint d'une couleur pleine ; une forme pleine (feuille, point) peut
 * prendre le dégradé de la matière.
 *
 * ## Ce qui se lit sur le blason
 *
 *   · le NIVEAU du joueur, gravé dans la pointe de l'écu (`BLASON_LEVEL_ENGRAVING`) ;
 *   · la DIVISION, en encoches sous la pointe : V = 1 encoche … I = 5
 *     (`divisionNotches`) — les emplacements vides restent tracés, en creux ;
 *   · pour le Mythe, le numéro d'ÉMISSION gravé à la place des encoches.
 *
 * ## Petit format
 *
 * Sous 60 px, le blason se recadre sur l'écu et sa décoration (`BLASON_COMPACT_FRAME`,
 * même proportion que le cadre entier) : les tenants, le ruban et les chiffres
 * gravés se taisent, illisibles à cette taille.
 */

import type { GloryDivision5, GloryRankOrMythic } from './glory.js';
import { MYTHIC_SIGNATURE_BOX, mythicSignature } from './mythic-signature.js';

export const BLASON_FRAME = { width: 200, height: 184 } as const;

export type BlasonViewport = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Le cadre entier, puis les cadres resserrés du petit format — même proportion (200 : 184). */
export const BLASON_FULL_FRAME: BlasonViewport = { x: 0, y: 0, width: 200, height: 184 };
export const BLASON_COMPACT_FRAME: BlasonViewport = { x: 30, y: 6, width: 140, height: 128.8 };
export const BLASON_COMPACT_MYTHIC_FRAME: BlasonViewport = { x: 14, y: 5, width: 172, height: 158.24 };
/** En dessous de cette largeur (px), le blason se dessine en petit format. */
export const BLASON_COMPACT_BELOW = 60;

export type CrestTone = 'metal' | 'gold' | 'ink';

export type CrestLine = {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly tone: CrestTone;
};

/** Un arc de cercle tracé de `from` à `to` (degrés depuis midi, sens horaire). */
export type CrestArc = {
  readonly kind: 'arc';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly from: number;
  readonly to: number;
  readonly width: number;
  readonly tone: CrestTone;
};

export type CrestCubic = { readonly c1x: number; readonly c1y: number; readonly c2x: number; readonly c2y: number; readonly x: number; readonly y: number };

/** Un trait courbe : un point de départ, puis des segments de Bézier cubiques. */
export type CrestCurve = {
  readonly kind: 'curve';
  readonly x: number;
  readonly y: number;
  readonly segments: readonly CrestCubic[];
  readonly width: number;
  readonly tone: CrestTone;
};

/**
 * Une feuille pleine entre deux pointes. Ses deux bords sont des Bézier
 * quadratiques dont le point de contrôle s'écarte de 2 × `bulge` du milieu,
 * perpendiculairement à l'axe : la feuille est large de `bulge` de chaque côté.
 */
export type CrestLeaf = {
  readonly kind: 'leaf';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly bulge: number;
  readonly tone: CrestTone;
};

export type CrestDot = { readonly kind: 'dot'; readonly cx: number; readonly cy: number; readonly r: number; readonly tone: CrestTone };

export type CrestPiece = CrestLine | CrestArc | CrestCurve | CrestLeaf | CrestDot;

const line = (x1: number, y1: number, x2: number, y2: number, width: number, tone: CrestTone): CrestLine => ({ kind: 'line', x1, y1, x2, y2, width, tone });
const arc = (cx: number, cy: number, r: number, from: number, to: number, width: number, tone: CrestTone): CrestArc => ({ kind: 'arc', cx, cy, r, from, to, width, tone });
const leaf = (x1: number, y1: number, x2: number, y2: number, bulge: number, tone: CrestTone): CrestLeaf => ({ kind: 'leaf', x1, y1, x2, y2, bulge, tone });
const dot = (cx: number, cy: number, r: number, tone: CrestTone): CrestDot => ({ kind: 'dot', cx, cy, r, tone });

const LAUREL: readonly CrestPiece[] = [
  { kind: 'curve', x: 62, y: 131, segments: [{ c1x: 48, c1y: 123.7, c2x: 42.3, c2y: 110, x: 45, y: 90 }], width: 3, tone: 'gold' },
  { kind: 'curve', x: 138, y: 131, segments: [{ c1x: 152, c1y: 123.7, c2x: 157.7, c2y: 110, x: 155, y: 90 }], width: 3, tone: 'gold' },
  leaf(54.6, 125.8, 45.9, 128, 3.2, 'gold'),
  leaf(49.2, 119.2, 53.1, 111.1, 3.2, 'gold'),
  leaf(45.8, 111, 37.3, 108.1, 3.2, 'gold'),
  leaf(44.4, 101.2, 51.7, 96, 3.2, 'gold'),
  leaf(45, 90, 46.2, 81.1, 3.2, 'gold'),
  leaf(145.4, 125.8, 154.1, 128, 3.2, 'gold'),
  leaf(150.8, 119.2, 146.9, 111.1, 3.2, 'gold'),
  leaf(154.2, 111, 162.7, 108.1, 3.2, 'gold'),
  leaf(155.6, 101.2, 148.3, 96, 3.2, 'gold'),
  leaf(155, 90, 153.8, 81.1, 3.2, 'gold'),
];

export const RANK_CRESTS: Readonly<Record<GloryRankOrMythic, readonly CrestPiece[]>> = {
  murmure: [line(90, 26, 110, 26, 6, 'metal')],
  echo: [arc(100, 40, 12, -55, 55, 4.5, 'metal'), arc(100, 40, 22, -50, 50, 4.5, 'metal')],
  voix: [
    line(91, 29.3, 82, 18.6, 5.5, 'metal'),
    line(100, 26, 100, 12, 5.5, 'metal'),
    line(109, 29.3, 118, 18.6, 5.5, 'metal'),
  ],
  conteur: [
    leaf(100, 31, 86, 22, 3.5, 'metal'),
    leaf(100, 31, 114, 22, 3.5, 'metal'),
    leaf(100, 33, 100, 10, 7, 'metal'),
    line(100, 29, 100, 15, 1.6, 'ink'),
  ],
  passeur: [
    arc(100, 44, 32, -72, 72, 6, 'metal'),
    arc(100, 44, 24, -66, 66, 3, 'metal'),
    dot(100, 12, 4.5, 'gold'),
    dot(69.6, 34.1, 3.5, 'gold'),
    dot(130.4, 34.1, 3.5, 'gold'),
  ],
  polyglotte: [
    line(72, 22, 128, 22, 3, 'metal'),
    {
      kind: 'curve',
      x: 72,
      y: 22,
      segments: [
        { c1x: 81, c1y: 11, c2x: 91, c2y: 11, x: 100, y: 22 },
        { c1x: 109, c1y: 33, c2x: 119, c2y: 33, x: 128, y: 22 },
      ],
      width: 4.5,
      tone: 'metal',
    },
    {
      kind: 'curve',
      x: 72,
      y: 22,
      segments: [
        { c1x: 81, c1y: 33, c2x: 91, c2y: 33, x: 100, y: 22 },
        { c1x: 109, c1y: 11, c2x: 119, c2y: 11, x: 128, y: 22 },
      ],
      width: 4.5,
      tone: 'gold',
    },
    dot(72, 22, 3.2, 'gold'),
    dot(100, 22, 3.2, 'gold'),
    dot(128, 22, 3.2, 'gold'),
  ],
  ambassadeur: LAUREL,
  orateur: [
    ...LAUREL,
    line(82.2, 33.1, 75.7, 28.4, 4.5, 'metal'),
    line(88.2, 29.8, 80, 18.5, 4.5, 'metal'),
    line(93.2, 25.1, 90.7, 17.5, 4.5, 'metal'),
    line(100, 26, 100, 12, 4.5, 'metal'),
    line(106.8, 25.1, 109.3, 17.5, 4.5, 'metal'),
    line(111.8, 29.8, 120, 18.5, 4.5, 'metal'),
    line(117.8, 33.1, 124.3, 28.4, 4.5, 'metal'),
  ],
  oracle: [
    ...LAUREL,
    line(100, 10, 100, 32, 5, 'metal'),
    line(109.5, 15.5, 90.5, 26.5, 5, 'metal'),
    line(109.5, 26.5, 90.5, 15.5, 5, 'metal'),
    dot(100, 21, 3, 'gold'),
    dot(85, 12, 1.8, 'gold'),
    dot(115, 12, 1.8, 'gold'),
    dot(84, 30, 1.8, 'gold'),
    dot(116, 30, 1.8, 'gold'),
  ],
  legende: [
    ...LAUREL,
    line(78, 33, 122, 33, 5, 'gold'),
    line(80, 33, 80, 23, 4.5, 'gold'),
    line(90, 33, 90, 17, 4.5, 'gold'),
    line(100, 33, 100, 12, 4.5, 'gold'),
    line(110, 33, 110, 17, 4.5, 'gold'),
    line(120, 33, 120, 23, 4.5, 'gold'),
    dot(90, 17, 3.4, 'metal'),
    dot(100, 12, 3.4, 'metal'),
    dot(110, 17, 3.4, 'metal'),
  ],
  mythe: [],
};

/** Le niveau du joueur, gravé dans la pointe de l'écu : le centre de la ligne de base et le corps. */
export const BLASON_LEVEL_ENGRAVING = { x: 100, y: 109, size: 15 } as const;

/** Les encoches de division : cinq emplacements sous la pointe de l'écu, de gauche à droite. */
export const DIVISION_NOTCHES = { cx: 100, y1: 124, y2: 131, gap: 9, width: 4, slots: 5 } as const;

export type DivisionNotch = { readonly x: number; readonly y1: number; readonly y2: number; readonly width: number; readonly on: boolean };

/** Le nombre d'encoches pleines d'une division : V (5) = 1 … I (1) = 5. */
export const divisionNotchCount = (division: GloryDivision5): number => 6 - division;

/** Les cinq encoches d'une division, pleines de gauche à droite ; `null` (le Mythe) : aucune. */
export function divisionNotches(division: GloryDivision5 | null): readonly DivisionNotch[] {
  if (division === null) return [];
  const count = divisionNotchCount(division);
  const { cx, y1, y2, gap, width, slots } = DIVISION_NOTCHES;
  return Array.from({ length: slots }, (_, k) => ({ x: cx + (k - (slots - 1) / 2) * gap, y1, y2, width, on: k < count }));
}

/** Où la Signature unique se pose en halo : son centre et l'échelle de son carré de 1 024. */
export const MYTHIC_HALO_PLACEMENT = { cx: 100, cy: 84, scale: 0.155 } as const;
/** Sans émission servie (un ancien serveur) : un halo de douze rayons, sans gemme, sans perle, sans numéro. */
export const MYTHIC_HALO_DEFAULT_RAYS = 12;

export type MythicHalo = {
  /** L'émission dessinée, `null` pour le halo par défaut. */
  readonly edition: number | null;
  /** Teinte de départ du prisme (0–359) ; `null` : le client prend son dégradé prismatique. */
  readonly hue: number | null;
  readonly rays: readonly { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }[];
  readonly rayWidth: number;
  /** La gemme : les quatre sommets du losange, de la pointe tournée vers l'extérieur, dans le sens horaire. */
  readonly gem: readonly { readonly x: number; readonly y: number }[] | null;
  readonly beads: readonly { readonly cx: number; readonly cy: number; readonly r: number }[];
  readonly numeral: { readonly text: string; readonly x: number; readonly y: number; readonly size: number } | null;
};

const tenth = (value: number): number => Math.round(value * 10) / 10;

const place = (x: number, y: number): { readonly x: number; readonly y: number } => {
  const { cx, cy, scale } = MYTHIC_HALO_PLACEMENT;
  const half = MYTHIC_SIGNATURE_BOX / 2;
  return { x: tenth(cx + (x - half) * scale), y: tenth(cy + (y - half) * scale) };
};

const DEFAULT_HALO = { inner: 380, outer: 430, strokeWidth: 28 } as const;

/**
 * La Signature unique d'une émission, posée en HALO autour de l'écu : la table
 * de `mythicSignature` ramenée au cadre du blason (`MYTHIC_HALO_PLACEMENT`). La
 * Signature elle-même reste celle gravée sur l'écu ; ce qui fait l'unicité —
 * rayons, gemme, perles, teinte, numéro — l'entoure.
 */
export function mythicHalo(edition: number | null): MythicHalo {
  const design = edition === null ? null : mythicSignature(edition);
  const scale = MYTHIC_HALO_PLACEMENT.scale;
  if (design === null) {
    const rays = Array.from({ length: MYTHIC_HALO_DEFAULT_RAYS }, (_, k) => {
      const radians = (2 * Math.PI * k) / MYTHIC_HALO_DEFAULT_RAYS;
      const at = (radius: number) => place(512 + radius * Math.sin(radians), 512 - radius * Math.cos(radians));
      const from = at(DEFAULT_HALO.inner);
      const to = at(DEFAULT_HALO.outer);
      return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    });
    return { edition: null, hue: null, rays, rayWidth: tenth(DEFAULT_HALO.strokeWidth * scale), gem: null, beads: [], numeral: null };
  }
  const rays = design.rays.map((ray) => {
    const from = place(ray.x1, ray.y1);
    const to = place(ray.x2, ray.y2);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
  const radians = (design.gem.angle * Math.PI) / 180;
  const along = { x: Math.sin(radians), y: -Math.cos(radians) };
  const across = { x: -along.y, y: along.x };
  const r = design.gem.r;
  const gem = [
    place(design.gem.cx + along.x * r, design.gem.cy + along.y * r),
    place(design.gem.cx + across.x * r, design.gem.cy + across.y * r),
    place(design.gem.cx - along.x * r, design.gem.cy - along.y * r),
    place(design.gem.cx - across.x * r, design.gem.cy - across.y * r),
  ];
  const beads = design.beads.map((bead) => {
    const at = place(bead.cx, bead.cy);
    return { cx: at.x, cy: at.y, r: tenth(bead.r * scale) };
  });
  const engraving = place(design.engraving.x, design.engraving.y);
  return {
    edition: design.edition,
    hue: design.hue,
    rays,
    rayWidth: tenth(design.halo.strokeWidth * scale),
    gem,
    beads,
    numeral: { text: design.numeral, x: engraving.x, y: engraving.y, size: tenth(design.engraving.size * scale) },
  };
}
