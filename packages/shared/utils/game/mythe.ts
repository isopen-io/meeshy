/**
 * LE MYTHE (#9636) — cent places, dans l'ordre d'arrivée, et une émission par attribution.
 *
 * Un compte qui atteint `MYTHE_GLORY` (1 000 000) de Gloire prend une place
 * libre, tant qu'il en reste une des `MYTHE_SIZE` (100). L'attribution porte :
 *  - le NUMÉRO de la place (1 à 100) — la plus petite place libre ;
 *  - un NUMÉRO D'ÉMISSION (1, 2, 3… sans fin), qui ne revient JAMAIS et dont
 *    dérive la Signature unique (`mythic-signature.ts`).
 *
 * Tant que le compte existe, la place ne se perd pas : la règle « les 100
 * Légendes les plus glorieuses du moment » est abandonnée. Quand le compte est
 * supprimé (décision porteur 2026-10-08), la place se LIBÈRE et revient au
 * compte en attente qui a franchi le million le plus tôt — avec une émission
 * neuve, donc une Signature jamais vue.
 *
 * La passerelle tient le registre (`MythicSeat`, `MythicEdition`) et
 * l'attribution ATOMIQUE ; cette loi dit, sans base, ce qu'elle doit produire.
 * Aucune liste globale n'est publiée (conformité A-13) : chaque compte ne reçoit
 * que SA place.
 */

import { MYTHE_GLORY, MYTHE_SIZE, isMythicNumber } from './glory.js';

/** `true` quand cette Gloire ouvre droit à une place (s'il en reste une). */
export const reachesMythe = (glory: number): boolean => Number.isFinite(glory) && glory >= MYTHE_GLORY;

/** Les places libres, de la plus petite à la plus grande, quand `taken` sont prises. */
export const freeMythicNumbers = (taken: readonly number[]): readonly number[] => {
  const held = new Set(taken.filter(isMythicNumber));
  return Array.from({ length: MYTHE_SIZE }, (_, i) => i + 1).filter((n) => !held.has(n));
};

/** La place que prend le prochain arrivant : la plus petite libre, `null` quand les cent sont prises. */
export const nextMythicNumber = (taken: readonly number[]): number | null => freeMythicNumbers(taken)[0] ?? null;

export type GloryGain = { readonly delta: number; readonly createdAt: string };

/**
 * L'instant où une suite de gains atteint le seuil pour la PREMIÈRE fois (ISO),
 * `null` s'il n'est pas atteint. Les gains se rangent par instant ; une
 * correction négative qui ferait repasser sous le seuil ne déplace pas l'arrivée.
 */
export function mythicCrossedAt(gains: readonly GloryGain[]): string | null {
  const ordered = [...gains].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const crossing = ordered.reduce<{ readonly total: number; readonly at: string | null }>(
    (acc, gain) => {
      if (acc.at !== null) return acc;
      const total = acc.total + gain.delta;
      return { total, at: total >= MYTHE_GLORY ? gain.createdAt : null };
    },
    { total: 0, at: null },
  );
  return crossing.at;
}

export type MythicArrival = { readonly userId: string; readonly glory: number; readonly crossedAt: string };

export type MythicSeatGrant = { readonly userId: string; readonly number: number };

/** L'ordre d'arrivée : instant de franchissement, puis identifiant. */
export const mythicArrivalOrder = (arrivals: readonly MythicArrival[]): readonly MythicArrival[] =>
  [...new Map(arrivals.map((a) => [a.userId, a])).values()]
    .filter((a) => reachesMythe(a.glory))
    .sort((a, b) =>
      a.crossedAt !== b.crossedAt ? (a.crossedAt < b.crossedAt ? -1 : 1) : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
    );

/**
 * Les places qu'une attribution donne : aux arrivants qui ont la Gloire et pas
 * encore de place, dans l'ordre d'arrivée, chacun sur la plus petite place libre
 * restante — jamais au-delà de la 100e.
 */
export function assignMythicSeats(params: {
  readonly taken: readonly number[];
  readonly seated: readonly string[];
  readonly arrivals: readonly MythicArrival[];
}): readonly MythicSeatGrant[] {
  const seated = new Set(params.seated);
  const free = freeMythicNumbers(params.taken);
  return mythicArrivalOrder(params.arrivals)
    .filter((a) => !seated.has(a.userId))
    .slice(0, free.length)
    .map((a, index) => ({ userId: a.userId, number: free[index]! }));
}
