import type { ESLint, Rule } from 'eslint';

import type { CheminReclame } from '../scripts/lib/perimetre-de-zone.d.mts';

/**
 * Le plugin ESLint de la frontière de zone. Sa forme exacte est celle qu'ESLint attend d'un
 * plugin en configuration à plat ; ce qui compte pour un consommateur TypeScript — le témoin —
 * est qu'il porte les DEUX règles sous le préfixe `zone`, chacune paramétrée par un périmètre
 * de `CheminReclame`.
 */
export declare const frontiereDeZone: ESLint.Plugin & {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export type OptionsDeFrontiere = { readonly perimetre: readonly CheminReclame[] };
