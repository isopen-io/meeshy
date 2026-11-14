/**
 * L'ADRESSE D'UNE SECTION DU CARNET DES RÈGLES (#18422, #18423) — une vue du Jeu
 * montre l'instant, et son explication se lit dans le carnet, ouvert à la bonne
 * section. Ce module dit COMMENT on la désigne : `?section=<valeur>`, la valeur
 * nommant une des cinq sections, une règle (`regle-3`) ou un concept du
 * glossaire (`concept-flame`). Pur, sans un mot : la fiche qui porte le lien ne
 * charge pas la partie `rules` du catalogue.
 */
export const RULES_SECTIONS = ['regles', 'concepts', 'badges', 'atlas', 'etapes'] as const;

export type RulesSection = (typeof RULES_SECTIONS)[number];

export type RulesTarget =
  | { readonly kind: 'section'; readonly section: RulesSection }
  | { readonly kind: 'rule'; readonly index: number }
  | { readonly kind: 'concept'; readonly key: string };

export const RULES_COUNT = 8;

export const rulesSectionValue = (_target: RulesTarget): string => '';

export const rulesLink = (target: RulesTarget) => ({ to: 'progressionRegles', search: { section: rulesSectionValue(target) } }) as const;

export function rulesTarget(_address: { readonly section: string | null; readonly regle: string | null }, _concepts: readonly string[]): RulesTarget | undefined {
  return undefined;
}
