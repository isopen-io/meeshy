/**
 * LA SIGNATURE UNIQUE D'UN MYTHE (#9636) — cent variantes, une par numéro,
 * déterministes, toutes différentes. Une TABLE DE GÉOMÉTRIE, pas du dessin :
 * le web la peint en SVG, l'app iOS la recopie forme pour forme (même principe
 * que les emblèmes des concepts, `apps/web/src/lib/game/concept-emblems.ts`).
 *
 * Repère : le carré de 1 024 de la Signature Meeshy (`BRAND_DASH_BOX`), centre
 * (512, 512). La Signature elle-même — les trois traits 500 · 400 · 300 — n'est
 * JAMAIS déformée : ce qui rend un Mythe unique est ce qui l'ENTOURE.
 *
 *   · le HALO       — `rays.length` rayons à bouts ronds, de `halo.inner` à
 *                     `halo.outer` du centre, épaisseur `halo.strokeWidth`, le
 *                     premier à midi, les suivants à pas égal dans le sens horaire.
 *                     12 à 30 rayons, par pas de 2 : la DIZAINE du numéro ;
 *   · la GEMME      — un losange plein de demi-diagonale `gem.r`, centré sur
 *                     l'orbite `gem.orbit`, à `gem.angle` degrés de midi (sens
 *                     horaire) : l'UNITÉ du numéro, de 18° à 342° par pas de 36°.
 *                     L'orbite passe AU-DELÀ des rayons (bouts ronds compris) :
 *                     la gemme ne touche jamais le halo, quel que soit l'angle ;
 *   · le PRISME     — `hue`, la teinte de départ du dégradé prismatique (0–359),
 *                     avancée de l'angle d'or (137,508°) à chaque numéro : cent
 *                     teintes distinctes ;
 *   · le NUMÉRO     — `numeral`, gravé sous la Signature en chiffres arabes, au
 *                     point `engraving` (centre de la ligne de base).
 *
 * Dizaine × unité : deux numéros n'ont jamais à la fois le même nombre de rayons
 * et la même position de gemme — l'unicité tient à la construction, la table
 * de témoins la vérifie quand même.
 *
 * Arithmétique : la teinte se calcule en ENTIERS (aucun arrondi flottant à la
 * frontière) ; les coordonnées des rayons et de la gemme sont arrondies au
 * dixième. Les vecteurs `mythic-signature` en figent des cas pour iOS.
 *
 * Calculée À L'APPEL : ce module ne pèse rien tant qu'aucun Mythe n'est dessiné.
 */

import { MYTHE_SIZE, isMythicNumber } from './glory.js';

export const MYTHIC_SIGNATURE_BOX = 1024;

const CENTER = 512;
const HALO = { inner: 380, outer: 430, strokeWidth: 28 } as const;
const GEM = { orbit: 478, r: 30 } as const;
const ENGRAVING = { x: 512, y: 830 } as const;

export type MythicSignatureLine = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

export type MythicSignatureDesign = {
  readonly number: number;
  /** Teinte de départ du prisme, en degrés entiers (0–359). */
  readonly hue: number;
  readonly halo: { readonly cx: number; readonly cy: number; readonly inner: number; readonly outer: number; readonly strokeWidth: number };
  /** Les rayons du halo, coordonnées explicites (le premier à midi). */
  readonly rays: readonly MythicSignatureLine[];
  /** La gemme : son centre, sa demi-diagonale, son angle depuis midi. */
  readonly gem: { readonly cx: number; readonly cy: number; readonly r: number; readonly orbit: number; readonly angle: number };
  /** Le numéro gravé et le centre de sa ligne de base. */
  readonly numeral: string;
  readonly engraving: { readonly x: number; readonly y: number };
};

const tenth = (value: number): number => Math.round(value * 10) / 10;

/** Le point à `radius` du centre, à `degrees` de midi dans le sens horaire. */
const polar = (radius: number, degrees: number): { readonly x: number; readonly y: number } => {
  const radians = (degrees * Math.PI) / 180;
  return { x: tenth(CENTER + radius * Math.sin(radians)), y: tenth(CENTER - radius * Math.cos(radians)) };
};

/** Le nombre de rayons d'un numéro : 12 pour 1–10, 14 pour 11–20 … 30 pour 91–100. */
export const mythicRayCount = (number: number): number => 12 + 2 * Math.floor((number - 1) / 10);

/** L'angle de la gemme d'un numéro : 18° pour 1, 11, 21 … ; 342° pour 10, 20, 30 … */
export const mythicGemAngle = (number: number): number => 18 + 36 * ((number - 1) % 10);

/** La teinte de départ du prisme : ⌊(n − 1) × 137,508 + ½⌋ mod 360, en entiers. */
export const mythicHue = (number: number): number => Math.floor(((number - 1) * 137_508 + 500) / 1000) % 360;

/** La Signature unique du Mythe n° `number` (1 à 100) ; `null` pour un numéro hors des cent places. */
export function mythicSignature(number: number): MythicSignatureDesign | null {
  if (!isMythicNumber(number)) return null;
  const count = mythicRayCount(number);
  const rays = Array.from({ length: count }, (_, k) => {
    const degrees = (360 * k) / count;
    const from = polar(HALO.inner, degrees);
    const to = polar(HALO.outer, degrees);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
  const angle = mythicGemAngle(number);
  const gemCenter = polar(GEM.orbit, angle);
  return {
    number,
    hue: mythicHue(number),
    halo: { cx: CENTER, cy: CENTER, inner: HALO.inner, outer: HALO.outer, strokeWidth: HALO.strokeWidth },
    rays,
    gem: { cx: gemCenter.x, cy: gemCenter.y, r: GEM.r, orbit: GEM.orbit, angle },
    numeral: String(number),
    engraving: { x: ENGRAVING.x, y: ENGRAVING.y },
  };
}

/** Les cent Signatures, du n° 1 au n° 100 — calculées à l'appel. */
export const mythicSignatures = (): readonly MythicSignatureDesign[] =>
  Array.from({ length: MYTHE_SIZE }, (_, i) => mythicSignature(i + 1)!);
