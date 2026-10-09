/**
 * LES GARDES DE FRONTIÈRE DU JEU (#9383, #9481) — les prédicats que le port du
 * jeu (`game.ts`) et celui de la vague 2 (`game-v2.ts`) partagent. Écrits UNE
 * fois : deux jeux de gardes divergent, et un bloc refusé par l'un serait lu
 * par l'autre.
 */

export type Rec = Readonly<Record<string, unknown>>;

export const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isInt = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export const isFraction = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
export const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
export const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
export const isOneOf = (keys: readonly string[]) => (value: unknown): boolean => typeof value === 'string' && keys.includes(value);
export const orNull = (check: (value: unknown) => boolean) => (value: unknown): boolean => value === null || check(value);

export const shape = (value: unknown, fields: Readonly<Record<string, (field: unknown) => boolean>>): value is Rec =>
  isRec(value) && Object.entries(fields).every(([key, check]) => check(value[key]));

/** Un champ NEUF du fil : absent (ancien serveur) ou conforme — jamais malformé. */
export const optional = (check: (value: unknown) => boolean) => (value: unknown): boolean => value === undefined || check(value);

/** La division héritée (III, II, I) — la seule qu'un serveur d'avant #9636 sert. */
export const isDivision = (value: unknown): boolean => value === 1 || value === 2 || value === 3;

/** La division à cinq crans (#9636) : V = 5 … I = 1. */
export const isDivision5 = (value: unknown): boolean => isInt(value, 1, 5);

/** La place du Mythe (#9636) : la place, 1 à 100, et l'émission dont dérive la Signature unique. */
export const isMythicSeat = (value: unknown): boolean => shape(value, { number: (n) => isInt(n, 1, 100), edition: (n) => isInt(n, 1) });
