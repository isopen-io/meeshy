import { describe, expect, test } from 'bun:test';

import { mountsBottomLine } from './meta';

const BASE = { hasTranslation: false, isBlurred: false, isLastInGroup: false, hasReactions: false } as const;

describe('mountsBottomLine', () => {
  test('rien a dire : ni traduction ni reaction -> aucune ligne', () => {
    expect(mountsBottomLine(BASE)).toBe(false);
  });

  test('traduction + dernier du groupe + non voile -> ligne (drapeaux)', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true })).toBe(true);
  });

  test('traduction mais PAS le dernier du groupe -> aucun drapeau (#3919)', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: false })).toBe(false);
  });

  test('traduction + dernier du groupe + VOILE -> aucun drapeau en clair', () => {
    expect(mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true, isBlurred: true })).toBe(false);
  });

  test('reaction seule, sans traduction -> la ligne monte quand meme', () => {
    expect(mountsBottomLine({ ...BASE, hasReactions: true })).toBe(true);
  });

  test('reaction sur un message VOILE -> la ligne monte (hors voile, parite bulle)', () => {
    expect(mountsBottomLine({ ...BASE, hasReactions: true, isBlurred: true, isLastInGroup: false })).toBe(true);
  });

  test('traduction + dernier du groupe + reaction -> une seule ligne (les deux causes cumulent)', () => {
    expect(
      mountsBottomLine({ ...BASE, hasTranslation: true, isLastInGroup: true, hasReactions: true }),
    ).toBe(true);
  });
});
