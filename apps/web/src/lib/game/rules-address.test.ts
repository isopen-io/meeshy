import { describe, expect, test } from 'bun:test';

import { BADGES_GUIDE_LINK } from '@/lib/game/medal';

import { RULES_SECTIONS, rulesLink, rulesSectionValue, rulesTarget } from './rules-address';

const CONCEPTS = ['level', 'flame', 'chest'] as const;
const read = (section: string | null, regle: string | null = null) => rulesTarget({ section, regle }, CONCEPTS);

describe('l’adresse d’une section du carnet des règles', () => {
  test('cinq sections, dans l’ordre de la page', () => {
    expect([...RULES_SECTIONS]).toEqual(['regles', 'concepts', 'badges', 'atlas', 'etapes']);
  });

  test('chaque cible a sa valeur : la section par son nom, la règle par son numéro, le concept par sa clé', () => {
    expect(rulesSectionValue({ kind: 'section', section: 'atlas' })).toBe('atlas');
    expect(rulesSectionValue({ kind: 'rule', index: 3 })).toBe('regle-3');
    expect(rulesSectionValue({ kind: 'concept', key: 'flame' })).toBe('concept-flame');
  });

  test('le lien mène au carnet, la section dans l’adresse', () => {
    expect(rulesLink({ kind: 'concept', key: 'flame' })).toEqual({ to: 'progressionRegles', search: { section: 'concept-flame' } });
  });

  test('« Comprendre les médailles » garde son adresse : c’est la section des médailles', () => {
    expect(rulesLink({ kind: 'section', section: 'badges' })).toEqual(BADGES_GUIDE_LINK);
  });

  test('une valeur écrite se relit en la même cible', () => {
    const targets = [
      ...RULES_SECTIONS.map((section) => ({ kind: 'section', section }) as const),
      { kind: 'rule', index: 1 } as const,
      { kind: 'rule', index: 8 } as const,
      { kind: 'concept', key: 'chest' } as const,
    ];
    for (const target of targets) expect(read(rulesSectionValue(target))).toEqual(target);
  });

  test('l’ancienne adresse d’une règle (?regle=3) se lit toujours', () => {
    expect(read(null, '3')).toEqual({ kind: 'rule', index: 3 });
  });

  test('la section l’emporte sur l’ancienne adresse quand les deux sont là', () => {
    expect(read('concept-flame', '3')).toEqual({ kind: 'concept', key: 'flame' });
  });

  test('ce que le carnet ne porte pas ne désigne rien', () => {
    for (const bad of ['', 'badge', 'regle-0', 'regle-9', 'regle-2.5', 'regle-', 'concept-', 'concept-inconnu', 'CONCEPT-flame']) expect({ bad, target: read(bad) }).toEqual({ bad, target: undefined });
    for (const bad of ['0', '9', '-1', 'abc']) expect({ bad, target: read(null, bad) }).toEqual({ bad, target: undefined });
    expect(read(null)).toBeUndefined();
  });
});
