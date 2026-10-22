import { describe, expect, test } from 'bun:test';

import { builtinPackDetail, decodePackSummary } from './sticker-packs';

/**
 * **LES NOMS DES PACKS INTÉGRÉS DANS LA LANGUE DE L'INTERFACE** (#10189) —
 * le port lit `names` quand le serveur le sert (champ additif) et n'en pose
 * aucun sinon ; un pack intégré composé localement porte les sept langues du
 * catalogue partagé.
 */

const wire = (extra: Record<string, unknown> = {}) => ({
  slug: 'exemple',
  name: 'Exemple',
  description: 'Un pack',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  kinds: ['static'],
  coverUrl: null,
  installed: false,
  installCount: 0,
  ...extra,
});

describe('decodePackSummary — `names` additif', () => {
  test('sans `names` sur le fil, le résumé n’en porte pas la clé', () => {
    const summary = decodePackSummary(wire());
    expect(summary).not.toBeNull();
    expect(Object.hasOwn(summary!, 'names')).toBe(false);
  });

  test('avec `names`, seules les langues de l’interface bien formées sont gardées', () => {
    const summary = decodePackSummary(
      wire({ names: { en: { name: 'Sample', description: 'A pack' }, zz: { name: 'x', description: 'y' }, fr: { name: 'Exemple' } } }),
    );
    expect(summary?.names).toEqual({ en: { name: 'Sample', description: 'A pack' } });
  });
});

describe('builtinPackDetail — un intégré composé localement', () => {
  test('porte les sept langues du catalogue partagé', () => {
    const mee = builtinPackDetail('mee', true);
    expect(mee?.names && Object.keys(mee.names).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
    expect(mee?.names?.en?.description).toContain('hummingbird');
  });
});
