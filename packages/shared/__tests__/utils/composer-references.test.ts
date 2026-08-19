import { describe, it, expect } from 'vitest';
import {
  upsertReference,
  removeReference,
  referencePayload,
  removingHandle,
  DECLARABLE_DISPLAYS,
} from '../../utils/composer-references.js';

describe('upsertReference', () => {
  it('ajoute une personne absente', () => {
    const result = upsertReference({ username: 'alice', display: 'NOTE' }, []);
    expect(result).toEqual([{ username: 'alice', display: 'NOTE' }]);
  });

  it('change le mode EN PLACE quand elle est déjà là', () => {
    const existing = [
      { username: 'alice', display: 'PINNED' as const },
      { username: 'bob', display: 'SILENT' as const },
    ];
    const result = upsertReference({ username: 'Alice', display: 'NOTE' }, existing);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ username: 'alice', display: 'NOTE' });
    expect(result[1].username).toBe('bob');
  });
});

describe('removeReference', () => {
  it('retire sans tenir compte de la casse', () => {
    expect(removeReference('ALICE', [{ username: 'alice', display: 'NOTE' }])).toEqual([]);
  });
});

describe('referencePayload', () => {
  it('porte le mode de chaque référence', () => {
    const payload = referencePayload([
      { username: 'alice', display: 'PINNED' },
      { username: 'bob', userId: 'u-bob', display: 'SILENT' },
    ]);

    expect(payload).toEqual([
      { username: 'alice', display: 'PINNED' },
      { userId: 'u-bob', display: 'SILENT' },
    ]);
  });

  it('ne déclare JAMAIS INLINE — le serveur le dérive du texte', () => {
    expect(referencePayload([{ username: 'alice', display: 'INLINE' }])).toEqual([]);
  });
});

describe('removingHandle', () => {
  it('retire le handle et l\'espace qu\'il laisserait', () => {
    expect(removingHandle('alice', 'Soirée avec @alice hier')).toBe('Soirée avec hier');
    expect(removingHandle('alice', '@alice')).toBe('');
    expect(removingHandle('alice', 'bravo @Alice !')).toBe('bravo !');
  });

  it('laisse les autres handles tranquilles', () => {
    expect(removingHandle('alice', '@alice et @alicia')).toBe('et @alicia');
  });
});

describe('DECLARABLE_DISPLAYS', () => {
  it('exclut INLINE', () => {
    expect(DECLARABLE_DISPLAYS).toEqual(['PINNED', 'NOTE', 'SILENT']);
  });
});
