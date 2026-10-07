/**
 * LE MYTHE (#9636) — cent places, définitives, dans l'ordre d'arrivée.
 *
 * Un compte qui atteint `MYTHE_GLORY` (1 000 000) de Gloire prend la première
 * place libre, tant qu'il en reste une des `MYTHE_SIZE` (100). La place porte
 * un NUMÉRO (1 à 100) et une Signature unique dérivée de lui
 * (`mythic-signature.ts`). Elle ne se perd jamais, ne se retire pas, ne se
 * recalcule pas : la règle « les 100 Légendes les plus glorieuses du moment »
 * est abandonnée.
 *
 * La passerelle tient le registre (`MythicSeat`) et l'attribution ATOMIQUE ;
 * cette loi dit, sans base, ce que l'attribution doit produire : la place
 * suivante, l'instant où une suite de gains franchit le seuil, et l'ordre
 * d'arrivée d'un rattrapage. Aucune liste globale n'est publiée (conformité
 * A-13) : chaque compte ne reçoit que SA place.
 */

import { MYTHE_GLORY, MYTHE_SIZE } from './glory.js';

/** `true` quand cette Gloire ouvre droit à une place (s'il en reste). */
export const reachesMythe = (glory: number): boolean => Number.isFinite(glory) && glory >= MYTHE_GLORY;

/**
 * La place que prend le prochain arrivant quand `taken` places sont déjà prises —
 * `null` quand les cent le sont. Les places se prennent dans l'ordre, sans trou :
 * la suivante est toujours `taken + 1`.
 */
export const nextMythicNumber = (taken: number): number | null => {
  const count = Number.isFinite(taken) ? Math.max(0, Math.trunc(taken)) : 0;
  return count < MYTHE_SIZE ? count + 1 : null;
};

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

/**
 * Les places qu'un rattrapage attribue : les arrivants qui ont la Gloire et pas
 * encore de place, dans l'ordre d'arrivée (instant de franchissement, puis
 * identifiant), à partir de la place `taken + 1` et jamais au-delà de la 100e.
 */
export function assignMythicSeats(params: {
  readonly taken: number;
  readonly seated: readonly string[];
  readonly arrivals: readonly MythicArrival[];
}): readonly MythicSeatGrant[] {
  const seated = new Set(params.seated);
  const first = nextMythicNumber(params.taken);
  if (first === null) return [];
  const unique = [...new Map(params.arrivals.map((a) => [a.userId, a])).values()];
  return unique
    .filter((a) => reachesMythe(a.glory) && !seated.has(a.userId))
    .sort((a, b) =>
      a.crossedAt !== b.crossedAt ? (a.crossedAt < b.crossedAt ? -1 : 1) : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
    )
    .slice(0, MYTHE_SIZE - (first - 1))
    .map((a, index) => ({ userId: a.userId, number: first + index }));
}
