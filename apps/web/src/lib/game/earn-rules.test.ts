import { describe, expect, test } from 'bun:test';

import { ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { ENGAGEMENT_FAMILY_TOP_POINTS } from '@meeshy/shared/types/engagement-operations';

import { earnRules } from './earn-rules';

/**
 * « COMMENT GAGNER » (#5841, #9667) — l'énumération du héros est DÉRIVÉE du
 * catalogue des opérations (`ENGAGEMENT_FAMILY_TOP_POINTS` : ce qu'un geste de
 * la famille rapporte AU PLUS), jamais recopiée dans une chaîne.
 */
describe('earnRules — une ligne par famille, triée par points', () => {
  test('les cinq familles, de la plus généreuse à la plus modeste : un réel 300, un commentaire 40', () => {
    const rules = earnRules();
    expect(rules.map((rule) => rule.family)).toEqual(['content', 'comment', 'social', 'conversation', 'tool']);
    expect(rules.map((rule) => rule.points)).toEqual([300, 40, 7, 5, 4]);
  });

  test('chaque famille du catalogue est énumérée une fois', () => {
    expect([...earnRules().map((rule) => rule.family)].sort()).toEqual([...ENGAGEMENT_AXIS_FAMILIES].sort());
  });
});

describe('earnRules — régler une famille change l’énumération', () => {
  test('le commentaire passe devant tout le monde quand on lui donne 500', () => {
    const rules = earnRules({ ...ENGAGEMENT_FAMILY_TOP_POINTS, comment: 500 });
    expect(rules[0]).toEqual({ family: 'comment', points: 500 });
  });

  test('une famille à zéro ne rapporte rien : elle n’est pas énumérée', () => {
    expect(earnRules({ ...ENGAGEMENT_FAMILY_TOP_POINTS, tool: 0 }).map((rule) => rule.family)).not.toContain('tool');
  });

  test('à points égaux, l’ordre du catalogue départage', () => {
    const flat = Object.fromEntries(ENGAGEMENT_AXIS_FAMILIES.map((family) => [family, 4])) as typeof ENGAGEMENT_FAMILY_TOP_POINTS;
    expect(earnRules(flat).map((rule) => rule.family)).toEqual([...ENGAGEMENT_AXIS_FAMILIES]);
  });
});
