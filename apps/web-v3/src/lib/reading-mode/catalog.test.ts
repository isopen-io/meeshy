import { describe, expect, test } from 'bun:test';

import { menuRows, MENU_ORDER } from './catalog';
import { threadCapabilities } from './decision';

const groupCapabilities = threadCapabilities({ isAnonymous: false, conversationType: 'group' });
const directCapabilities = threadCapabilities({ isAnonymous: false, conversationType: 'direct' });
const guestCapabilities = threadCapabilities({ isAnonymous: true, conversationType: 'group' });

describe('menuRows — cinq lignes, ordre fixe', () => {
  test('MENU_ORDER est [focal, script, bubbles, summary, river]', () => {
    expect(MENU_ORDER).toEqual(['focal', 'script', 'bubbles', 'summary', 'river']);
  });

  test('menuRows rend exactement cinq lignes, dans cet ordre', () => {
    const rows = menuRows({ ...groupCapabilities, currentMode: 'focal' });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.mode)).toEqual(['focal', 'script', 'bubbles', 'summary', 'river']);
  });
});

describe('menuRows — summary (#5695) : disponible pour un inscrit, motivé pour un invité', () => {
  test('summary est DISPONIBLE pour un inscrit, sans raison', () => {
    const rows = menuRows({ ...groupCapabilities, currentMode: 'focal' });
    const summary = rows.find((r) => r.mode === 'summary');
    expect(summary?.isAvailable).toBe(true);
    expect(summary?.reason).toBeNull();
  });

  test('summary est indisponible pour un invité, avec la raison « Réservé aux lecteurs connectés »', () => {
    const rows = menuRows({ ...guestCapabilities, currentMode: 'focal' });
    const summary = rows.find((r) => r.mode === 'summary');
    expect(summary?.isAvailable).toBe(false);
    expect(summary?.reason).toBe('Réservé aux lecteurs connectés');
  });
});

describe('menuRows — river, désactivé ET motivé', () => {
  test('river (groupe, compte inconnu) est désactivé avec la raison « seuil seul »', () => {
    const rows = menuRows({ ...groupCapabilities, currentMode: 'focal' });
    const river = rows.find((r) => r.mode === 'river');
    expect(river?.isAvailable).toBe(false);
    expect(river?.reason).toBe("S'ouvrira à 5 personnes actives");
  });

  test('river en conversation directe porte la raison « jamais éligible », pas le seuil', () => {
    const rows = menuRows({ ...directCapabilities, currentMode: 'focal' });
    const river = rows.find((r) => r.mode === 'river');
    expect(river?.isAvailable).toBe(false);
    expect(river?.reason).toBe('Jamais en conversation directe');
  });
});

describe('menuRows — le mode courant', () => {
  test('porte isCurrent: true', () => {
    const rows = menuRows({ ...groupCapabilities, currentMode: 'script' });
    expect(rows.find((r) => r.mode === 'script')?.isCurrent).toBe(true);
    expect(rows.find((r) => r.mode === 'focal')?.isCurrent).toBe(false);
  });
});

describe('menuRows — bulles est toujours sélectionnable', () => {
  test('choix de rendu hors loi : disponible même hors catalogue de rendu', () => {
    const rows = menuRows({ ...groupCapabilities, currentMode: 'focal' });
    expect(rows.find((r) => r.mode === 'bubbles')?.isAvailable).toBe(true);
  });
});

describe('menuRows — un invité voit les mêmes cinq lignes', () => {
  test('cinq lignes, dans le même ordre, summary désactivé', () => {
    const rows = menuRows({ ...guestCapabilities, currentMode: 'focal' });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.mode)).toEqual(['focal', 'script', 'bubbles', 'summary', 'river']);
    expect(rows.find((r) => r.mode === 'summary')?.isAvailable).toBe(false);
  });
});
