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

const RULE_PREFIX = 'regle-';
const CONCEPT_PREFIX = 'concept-';

export const rulesSectionValue = (target: RulesTarget): string => {
  if (target.kind === 'section') return target.section;
  return target.kind === 'rule' ? `${RULE_PREFIX}${target.index}` : `${CONCEPT_PREFIX}${target.key}`;
};

/** Le lien que porte une vue vers SA section du carnet. */
export const rulesLink = (target: RulesTarget) => ({ to: 'progressionRegles', search: { section: rulesSectionValue(target) } }) as const;

const isSection = (value: string): value is RulesSection => RULES_SECTIONS.some((section) => section === value);

const ruleOf = (digits: string): RulesTarget | undefined => {
  if (!/^\d+$/.test(digits)) return undefined;
  const index = Number(digits);
  return index >= 1 && index <= RULES_COUNT ? { kind: 'rule', index } : undefined;
};

const sectionOf = (value: string, concepts: readonly string[]): RulesTarget | undefined => {
  if (isSection(value)) return { kind: 'section', section: value };
  if (value.startsWith(RULE_PREFIX)) return ruleOf(value.slice(RULE_PREFIX.length));
  if (!value.startsWith(CONCEPT_PREFIX)) return undefined;
  const key = value.slice(CONCEPT_PREFIX.length);
  return concepts.includes(key) ? { kind: 'concept', key } : undefined;
};

/**
 * La cible que l'adresse du carnet désigne. `?section=` l'emporte ; l'ancienne
 * adresse d'une règle (`?regle=3`) se lit toujours. `concepts` est la liste des
 * entrées que le glossaire porte : une clé absente ne désigne rien.
 */
export function rulesTarget(address: { readonly section: string | null; readonly regle: string | null }, concepts: readonly string[]): RulesTarget | undefined {
  if (address.section !== null) return sectionOf(address.section, concepts);
  return address.regle === null ? undefined : ruleOf(address.regle);
}
