/**
 * LE JOUR, LA GRAINE ET LE TIRAGE du Jeu Meeshy (#9373).
 *
 * Aucune horloge ni aucun aléa implicites : le jour est une CLÉ `AAAA-MM-JJ`
 * que l'appelant calcule dans le fuseau de l'utilisateur, et le hasard est une
 * suite déterministe dérivée de ce que l'appelant fournit. Deux clients — ou le
 * serveur et un client — qui reçoivent les mêmes entrées tirent donc les mêmes
 * missions, le même coffre, la même Heure du Prisme.
 *
 * La graine est FNV-1a 32 bits sur les octets UTF-8 de `userId|jour|sel` ;
 * la suite est mulberry32. Les deux n'emploient que des opérations entières
 * sur 32 bits, que Swift rejoue à l'identique (`&*`, `>>`, `^`), et la division
 * finale par 2^32 est exacte en double : `game.vectors.json` le prouve.
 */

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const utcMs = (dayKey: string): number => {
  const match = DAY_KEY.exec(dayKey);
  if (match === null) return Number.NaN;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  const roundTrips = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day;
  return roundTrips ? ms : Number.NaN;
};

/** `true` pour une vraie date du calendrier au format `AAAA-MM-JJ`. */
export const isDayKey = (value: string): boolean => Number.isFinite(utcMs(value));

/** Nombre de jours écoulés depuis 1970-01-01. Lève sur une clé qui n'est pas une date. */
export function dayNumber(dayKey: string): number {
  const ms = utcMs(dayKey);
  if (!Number.isFinite(ms)) throw new RangeError(`Clé de jour invalide : ${dayKey}`);
  return ms / DAY_MS;
}

export function addDays(dayKey: string, days: number): string {
  return new Date((dayNumber(dayKey) + Math.trunc(days)) * DAY_MS).toISOString().slice(0, 10);
}

/** Jours calendaires de `from` à `to` : positif quand `to` est après `from`. */
export const dayDiff = (from: string, to: string): number => dayNumber(to) - dayNumber(from);

/** `AAAA-MM` — sert à « une fois par mois ». */
export const monthOf = (dayKey: string): string => dayKey.slice(0, 7);

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(text: string): number {
  return Array.from(new TextEncoder().encode(text)).reduce(
    (hash, byte) => Math.imul(hash ^ byte, FNV_PRIME) >>> 0,
    FNV_OFFSET,
  );
}

/** mulberry32 : rend un tirage dans [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type SeedParts = {
  readonly userId: string;
  readonly dayKey: string;
  /** Sépare les usages (`missions`, `chest`, `prism-hour`) : un même jour ne rejoue pas le même tirage. */
  readonly salt: string;
};

export const seedOf = ({ userId, dayKey, salt }: SeedParts): number => fnv1a(`${userId}|${dayKey}|${salt}`);

export const seededRng = (parts: SeedParts): (() => number) => mulberry32(seedOf(parts));

/** Un indice dans [0, length[ à partir d'un tirage. */
export const pickIndex = (rng: () => number, length: number): number => Math.floor(rng() * length);
