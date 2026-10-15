/**
 * LA GAMME DE 16 COULEURS, À L'ADRESSE DES CLIENTS (#10631) — `design/appearance/gamut.ts`
 * reste la source UNIQUE ; ce module n'est que sa porte d'export compilée
 * (`dist/utils`), parce que l'entrée `./design/*` du paquet sert les sources
 * brutes (JSON), non du TypeScript résolu par le navigateur.
 */
export { APPEARANCE_GAMUT, GAMUT_KEYS, isGamutKey, contrastRatio } from '../design/appearance/gamut.js';
export type { GamutEntry, GamutKey, GamutScheme, GamutShade } from '../design/appearance/gamut.js';
