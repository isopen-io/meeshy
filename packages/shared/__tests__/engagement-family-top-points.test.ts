/**
 * « COMMENT GAGNER » dit ce qu'un geste de chaque famille rapporte AU PLUS
 * (#9667) : le plus haut des points par défaut du catalogue, variantes
 * comprises. Le miroir Swift (`EngagementCatalog.familyTopPoints`) porte les
 * mêmes cinq nombres.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGAGEMENT_FAMILY_TOP_POINTS } from '../types/engagement-operations.js';

const CATALOGUE = readFileSync(
  join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/EngagementCatalog.swift'),
  'utf8',
);

const topSwift = (): Record<string, number> => {
  const bloc = CATALOGUE.slice(CATALOGUE.indexOf('familyTopPoints'));
  const litteral = bloc.slice(bloc.indexOf('= [') + 3);
  const corps = litteral.slice(0, litteral.indexOf(']'));
  return Object.fromEntries([...corps.matchAll(/\.([a-z]+):\s*(\d+)/g)].map((m) => [m[1]!, Number.parseInt(m[2]!, 10)]));
};

describe('le plus qu’un geste rapporte, par famille', () => {
  it('se dérive du catalogue : un réel (300), un commentaire (40), se lier (7), une conversation (5), une pièce jointe (4)', () => {
    expect(ENGAGEMENT_FAMILY_TOP_POINTS).toEqual({ content: 300, comment: 40, social: 7, conversation: 5, tool: 4 });
  });

  it('le miroir Swift porte les mêmes cinq nombres', () => {
    expect(topSwift()).toEqual(ENGAGEMENT_FAMILY_TOP_POINTS);
  });
});
