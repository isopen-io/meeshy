/**
 * `readDisplay` — comment une ligne `PostMention` déjà en base se lit.
 *
 * Une ligne écrite avant le discriminant n'a PAS le champ (sous MongoDB, un
 * `@default` ne s'applique qu'à l'écriture). Elle doit se lire INLINE : c'était
 * la seule voie qui existait quand elle a été écrite.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readDisplay } from '../../../../services/posts/postMentions';

describe('readDisplay', () => {
  it('lit INLINE quand le champ est absent', () => {
    expect(readDisplay(undefined)).toBe('INLINE');
  });

  it('lit INLINE quand le champ est null', () => {
    expect(readDisplay(null)).toBe('INLINE');
  });

  it('rend le mode tel quel quand il est renseigné', () => {
    expect(readDisplay('PINNED')).toBe('PINNED');
    expect(readDisplay('NOTE')).toBe('NOTE');
    expect(readDisplay('SILENT')).toBe('SILENT');
    expect(readDisplay('INLINE')).toBe('INLINE');
  });
});
