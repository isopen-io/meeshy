import { beforeAll, describe, expect, test } from 'bun:test';

import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { memberCountLabel, rowDateLabel } from './row-extra';

beforeAll(async () => {
  await Promise.all(['fr', 'en', 'de'].map((l) => loadRowMenuCatalog(l as 'fr')));
});

describe('memberCountLabel — le compte de membres parle la langue du lecteur', () => {
  test('pluriel et singulier, jamais « 1 membres »', () => {
    expect(memberCountLabel(1, 'fr')).toBe('1 membre');
    expect(memberCountLabel(12, 'fr')).toBe('12 membres');
    expect(memberCountLabel(3, 'en')).toBe('3 members');
    expect(memberCountLabel(1, 'de')).toBe('1 Mitglied');
  });

  test('le chiffre suit les conventions de la langue (grands comptes)', () => {
    expect(memberCountLabel(1500, 'en')).toBe('1,500 members');
  });
});

describe('rowDateLabel — la date pleine n’est plus un ISO technique', () => {
  const at = new Date('2026-10-14T12:00:00.000Z');
  test('une date lisible dans la langue, pas AAAA-MM-JJ', () => {
    expect(rowDateLabel(at, 'en')).toContain('Oct');
    expect(rowDateLabel(at, 'en')).not.toBe('2026-10-14');
    expect(rowDateLabel(at, 'fr')).toContain('oct');
  });

  test('une date absente ou invalide ne rend rien', () => {
    expect(rowDateLabel(undefined, 'fr')).toBe('');
    expect(rowDateLabel('pas une date', 'fr')).toBe('');
  });
});
