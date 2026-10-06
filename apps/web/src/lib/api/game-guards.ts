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
