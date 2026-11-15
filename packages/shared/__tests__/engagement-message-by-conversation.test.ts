/**
 * Un message TEXTE rapporte selon le type de sa conversation (#9666, décision
 * du porteur du 2026-10-08) : directe 2, groupe et autres 4, publique 6,
 * globale 8. Le vocal garde ses 5 points, le plafond par conversation et par
 * jour ne bouge pas.
 */
import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_TYPE_VARIANTS,
  ENGAGEMENT_OPERATION_CATALOG,
  conversationTypeVariant,
} from '../types/engagement-operations.js';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  basePointsForOperation,
  parseEngagementScale,
  pointsForOperation,
} from '../types/engagement-scale.js';

const DECISION = { direct: 2, group: 4, public: 6, global: 8, other: 4 } as const;

describe('la variante d’un message est le type de sa conversation', () => {
  it.each([
    ['direct', 'direct'],
    ['group', 'group'],
    ['public', 'public'],
    ['global', 'global'],
    ['GLOBAL', 'global'],
    ['broadcast', 'other'],
    ['inconnu', 'other'],
    ['', 'other'],
  ])('%s ⇒ %s', (type, variant) => {
    expect(conversationTypeVariant(type)).toBe(variant);
  });

  it('une conversation introuvable prend « autres »', () => {
    expect(conversationTypeVariant(null)).toBe('other');
    expect(conversationTypeVariant(undefined)).toBe('other');
  });
});

describe('le barème par défaut d’un message texte', () => {
  it('déclare une variante par type, aux valeurs de la décision', () => {
    const definition = ENGAGEMENT_OPERATION_CATALOG['content.text_message'];
    expect(definition.variants).toEqual(CONVERSATION_TYPE_VARIANTS);
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].variantPoints).toEqual(DECISION);
  });

  it.each(Object.entries(DECISION))('un message dans une conversation %s rapporte %i', (variant, points) => {
    expect(pointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'content.text_message', 1, variant)).toBe(points);
  });

  it('sans variante, il rapporte la valeur « autres »', () => {
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, 'content.text_message')).toBe(4);
  });

  it('garde son plafond par conversation et par jour', () => {
    const definition = ENGAGEMENT_OPERATION_CATALOG['content.text_message'];
    expect(definition.capScope).toBe('conversation-day');
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].cap).toBe(300);
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].multiplied).toBe(true);
  });

  it('laisse le vocal à 5, sans variante', () => {
    expect(ENGAGEMENT_OPERATION_CATALOG['content.audio_message'].variants).toEqual([]);
    expect(DEFAULT_ENGAGEMENT_SCALE.operations['content.audio_message']).toMatchObject({ points: 5, cap: 500, variantPoints: {} });
  });
});

describe('un barème enregistré avant les variantes', () => {
  const legacy = (rule: Record<string, unknown>) =>
    parseEngagementScale({
      operations: { 'content.text_message': rule },
      multiplier: DEFAULT_ENGAGEMENT_SCALE.multiplier,
    });

  it.each([
    ['sans champ de variantes', { points: 3, multiplied: true, cap: 300 }],
    ['avec des variantes vides', { points: 3, multiplied: true, cap: 300, variantPoints: {} }],
  ])('%s ⇒ les défauts de la décision', (_label, rule) => {
    const parsed = legacy(rule);
    expect(parsed).not.toBeNull();
    for (const [variant, points] of Object.entries(DECISION)) {
      expect(basePointsForOperation(parsed!, 'content.text_message', variant)).toBe(points);
    }
    expect(parsed!.operations['content.text_message'].cap).toBe(300);
  });

  it('une variante réglée par l’administration est gardée, les autres prennent leur défaut', () => {
    const parsed = legacy({ points: 3, multiplied: true, cap: 300, variantPoints: { global: 10 } });
    expect(parsed!.operations['content.text_message'].variantPoints).toEqual({ ...DECISION, global: 10 });
  });

  it('une variante que le catalogue ne déclare pas est refusée', () => {
    expect(legacy({ points: 3, multiplied: true, cap: 300, variantPoints: { secret: 10 } })).toBeNull();
  });
});
