/**
 * LA SIGNATURE UNIQUE D'UN MYTHE (#9636) — une variante par NUMÉRO D'ÉMISSION,
 * déterministe, jamais deux fois la même. Une TABLE DE GÉOMÉTRIE, pas du dessin :
 * le web la peint en SVG, l'app iOS la recopie forme pour forme (même principe
 * que les emblèmes des concepts, `apps/web/src/lib/game/concept-emblems.ts`).
 *
 * La Signature dérive de l'ÉMISSION, pas de la place (décision porteur
 * 2026-10-08) : une place libérée par la suppression d'un compte revient au
 * suivant avec une émission neuve — donc une Signature jamais vue. L'émission
 * `e` (1, 2, 3… sans fin) se lit en trois chiffres : k = e − 1,
 * unité = k mod 10, dizaine = ⌊k ÷ 10⌋ mod 10, anneau = ⌊k ÷ 100⌋.
 *
 * Repère : le carré de 1 024 de la Signature Meeshy (`BRAND_DASH_BOX`), centre
 * (512, 512). La Signature elle-même — les trois traits 500 · 400 · 300 — n'est
 * JAMAIS déformée : ce qui rend un Mythe unique est ce qui l'ENTOURE.
 *
 *   · le HALO       — `rays.length` rayons à bouts ronds, de `halo.inner` à
 *                     `halo.outer` du centre, épaisseur `halo.strokeWidth`, le
 *                     premier à midi, les suivants à pas égal dans le sens horaire.
 *                     12 à 30 rayons, par pas de 2 : la DIZAINE ;
 *   · la GEMME      — un losange plein de demi-diagonale `gem.r`, centré sur
 *                     l'orbite `gem.orbit`, à `gem.angle` degrés de midi (sens
 *                     horaire) : l'UNITÉ, de 18° à 342° par pas de 36°. L'orbite
 *                     passe AU-DELÀ des rayons (bouts ronds compris) : la gemme
 *                     ne touche jamais le halo, quel que soit l'angle ;
 *   · les PERLES    — sur l'orbite `beads.orbit`, entre la Signature et le halo,
 *                     douze emplacements à 15° + 30° × j ; une perle pleine de
 *                     rayon `beads.r` à l'emplacement j quand le bit j de
 *                     l'ANNEAU vaut 1. Émissions 1 à 100 : aucune perle ;
 *   · le PRISME     — `hue`, la teinte de départ du dégradé prismatique (0–359),
 *                     avancée de l'angle d'or (137,508°) à chaque émission ;
 *   · le NUMÉRO     — `numeral`, le numéro d'ÉMISSION gravé en chiffres arabes
 *                     sous la Signature, au point `engraving` (centre de la ligne
 *                     de base, corps `engraving.size`).
 *
 * ## Pourquoi deux émissions ne se ressemblent jamais
 *
 * (dizaine, unité, anneau) est l'écriture de k en base mixte 10 · 10 · 4 096 :
 * deux émissions de 1 à 409 600 n'ont JAMAIS à la fois le même nombre de
 * rayons, la même gemme et les mêmes perles — l'injectivité tient à la
 * construction. Le NUMÉRO gravé, lui, est injectif sur TOUS les entiers : au-delà
 * de 409 600 émissions (cent places, plus de quatre mille rotations complètes),
 * la géométrie se répète et le numéro seul les distingue. La table de témoins
 * vérifie l'injectivité sur les premières émissions et aux frontières.
 *
 * Arithmétique : la teinte et les chiffres se calculent en ENTIERS (aucun arrondi
 * flottant à la frontière) ; les coordonnées sont arrondies au dixième. Les
 * vecteurs `mythic-signature` en figent des cas pour iOS.
 *
 * Calculée À L'APPEL : ce module ne pèse rien tant qu'aucun Mythe n'est dessiné.
 */

import { MYTHE_SIZE, isMythicEdition } from './glory.js';

export const MYTHIC_SIGNATURE_BOX = 1024;

const CENTER = 512;
const HALO = { inner: 380, outer: 430, strokeWidth: 28 } as const;
const GEM = { orbit: 478, r: 30 } as const;
const BEADS = { orbit: 350, r: 9, slots: 12 } as const;
const ENGRAVING = { x: 512, y: 800, size: 72 } as const;

/** Le nombre d'émissions dont la géométrie seule est deux à deux distincte : 100 × 2¹². */
export const MYTHIC_GEOMETRY_SPAN = 100 * 2 ** BEADS.slots;

export type MythicSignatureLine = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

export type MythicSignatureBead = { readonly cx: number; readonly cy: number; readonly r: number; readonly slot: number };

export type MythicSignatureDesign = {
  /** Le numéro d'émission dont dérive la Signature. */
  readonly edition: number;
  /** Teinte de départ du prisme, en degrés entiers (0–359). */
  readonly hue: number;
  readonly halo: { readonly cx: number; readonly cy: number; readonly inner: number; readonly outer: number; readonly strokeWidth: number };
  /** Les rayons du halo, coordonnées explicites (le premier à midi). */
  readonly rays: readonly MythicSignatureLine[];
  /** La gemme : son centre, sa demi-diagonale, son angle depuis midi. */
  readonly gem: { readonly cx: number; readonly cy: number; readonly r: number; readonly orbit: number; readonly angle: number };
  /** Les perles de l'anneau (aucune pour les émissions 1 à 100). */
  readonly beads: readonly MythicSignatureBead[];
  /** Le numéro d'émission gravé, le centre de sa ligne de base et son corps. */
  readonly numeral: string;
  readonly engraving: { readonly x: number; readonly y: number; readonly size: number };
};

const tenth = (value: number): number => Math.round(value * 10) / 10;

/** Le point à `radius` du centre, à `degrees` de midi dans le sens horaire. */
const polar = (radius: number, degrees: number): { readonly x: number; readonly y: number } => {
  const radians = (degrees * Math.PI) / 180;
  return { x: tenth(CENTER + radius * Math.sin(radians)), y: tenth(CENTER - radius * Math.cos(radians)) };
};

/** Le nombre de rayons d'une émission : la dizaine — 12 pour 1–10, 14 pour 11–20 … 30 pour 91–100, puis on recommence. */
export const mythicRayCount = (edition: number): number => 12 + 2 * (Math.floor((edition - 1) / 10) % 10);

/** L'angle de la gemme d'une émission : l'unité — 18° pour 1, 11, 21 … ; 342° pour 10, 20, 30 … */
export const mythicGemAngle = (edition: number): number => 18 + 36 * ((edition - 1) % 10);

/** L'anneau d'une émission : ⌊(e − 1) ÷ 100⌋ modulo 2¹² — ses bits sont les perles. */
export const mythicRing = (edition: number): number => Math.floor((edition - 1) / 100) % 2 ** BEADS.slots;

/** La teinte de départ du prisme : ⌊(e − 1) × 137,508 + ½⌋ mod 360, en entiers. */
export const mythicHue = (edition: number): number => Math.floor(((edition - 1) * 137_508 + 500) / 1000) % 360;

/** La Signature unique de l'émission `edition` (1, 2, 3…) ; `null` pour une émission illisible. */
export function mythicSignature(edition: number): MythicSignatureDesign | null {
  if (!isMythicEdition(edition)) return null;
  const count = mythicRayCount(edition);
  const rays = Array.from({ length: count }, (_, k) => {
    const degrees = (360 * k) / count;
    const from = polar(HALO.inner, degrees);
    const to = polar(HALO.outer, degrees);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
  const angle = mythicGemAngle(edition);
  const gemCenter = polar(GEM.orbit, angle);
  const ring = mythicRing(edition);
  const beads = Array.from({ length: BEADS.slots }, (_, slot) => slot)
    .filter((slot) => Math.floor(ring / 2 ** slot) % 2 === 1)
    .map((slot) => {
      const at = polar(BEADS.orbit, 15 + 30 * slot);
      return { cx: at.x, cy: at.y, r: BEADS.r, slot };
    });
  return {
    edition,
    hue: mythicHue(edition),
    halo: { cx: CENTER, cy: CENTER, inner: HALO.inner, outer: HALO.outer, strokeWidth: HALO.strokeWidth },
    rays,
    gem: { cx: gemCenter.x, cy: gemCenter.y, r: GEM.r, orbit: GEM.orbit, angle },
    beads,
    numeral: String(edition),
    engraving: { x: ENGRAVING.x, y: ENGRAVING.y, size: ENGRAVING.size },
  };
}

/** Les Signatures des émissions 1 à `count` (cent par défaut) — calculées à l'appel. */
export const mythicSignatures = (count: number = MYTHE_SIZE): readonly MythicSignatureDesign[] =>
  Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, i) => mythicSignature(i + 1)!);
