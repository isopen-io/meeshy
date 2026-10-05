import { describe, expect, test } from 'bun:test';

import { ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES, ENGAGEMENT_AXIS_WEIGHTS, engagementAxisFamily } from '@meeshy/shared/types/engagement';

import { earnRules } from './earn-rules';

/**
 * « COMMENT GAGNER » (#5841) — l'énumération du héros est DÉRIVÉE du barème
 * (`ENGAGEMENT_AXIS_WEIGHTS`), jamais recopiée dans une chaîne : régler un
 * poids change ce que le héros énumère, sans toucher une seule chaîne.
 */
describe('earnRules — une ligne par famille, triée par poids', () => {
  test('les cinq familles, de la plus généreuse à la plus modeste', () => {
    const rules = earnRules();
    expect(rules.map((rule) => rule.family)).toEqual(['content', 'social', 'conversation', 'comment', 'tool']);
    expect(rules.map((rule) => rule.points)).toEqual([9, 7, 5, 3, 1]);
  });

  test('chaque famille du catalogue est énumérée une fois', () => {
    expect([...earnRules().map((rule) => rule.family)].sort()).toEqual([...ENGAGEMENT_AXIS_FAMILIES].sort());
  });

  test('le poids d’une famille est le plus haut de ses axes : créer un groupe (1) ne rétrograde pas la conversation (5)', () => {
    const conversation = earnRules().find((rule) => rule.family === 'conversation');
    expect(conversation?.points).toBe(Math.max(...ENGAGEMENT_AXES.filter((axis) => engagementAxisFamily(axis) === 'conversation').map((axis) => ENGAGEMENT_AXIS_WEIGHTS[axis])));
  });
});

describe('earnRules — régler un poids change l’énumération', () => {
  test('le commentaire passe devant tout le monde quand on lui donne 20', () => {
    const rules = earnRules({ ...ENGAGEMENT_AXIS_WEIGHTS, 'comment.text': 20 });
    expect(rules[0]).toEqual({ family: 'comment', points: 20 });
    expect(rules.map((rule) => rule.family)).toEqual(['comment', 'content', 'social', 'conversation', 'tool']);
  });

  test('une famille à zéro ne rapporte rien : elle n’est pas énumérée', () => {
    const silent = Object.fromEntries(ENGAGEMENT_AXES.map((axis) => [axis, engagementAxisFamily(axis) === 'tool' ? 0 : ENGAGEMENT_AXIS_WEIGHTS[axis]])) as typeof ENGAGEMENT_AXIS_WEIGHTS;
    expect(earnRules(silent).map((rule) => rule.family)).not.toContain('tool');
  });

  test('à poids égal, l’ordre du catalogue départage', () => {
    const flat = Object.fromEntries(ENGAGEMENT_AXES.map((axis) => [axis, 4])) as typeof ENGAGEMENT_AXIS_WEIGHTS;
    expect(earnRules(flat).map((rule) => rule.family)).toEqual([...ENGAGEMENT_AXIS_FAMILIES]);
  });
});
