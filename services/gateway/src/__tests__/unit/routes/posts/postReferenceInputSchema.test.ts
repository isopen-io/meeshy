/**
 * Le contrat que les apps DÉJÀ INSTALLÉES respectent — elles n'ont jamais
 * envoyé de `display`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostReferenceInputSchema } from '../../../../routes/posts/types';

describe('PostReferenceInputSchema', () => {
  it('accepte un payload d\'app ancienne et le lit PINNED', () => {
    const parsed = PostReferenceInputSchema.parse({ username: 'alice' });
    expect(parsed.display).toBe('PINNED');
  });

  it('accepte les trois modes déclarables', () => {
    for (const display of ['PINNED', 'NOTE', 'SILENT'] as const) {
      expect(PostReferenceInputSchema.parse({ username: 'alice', display }).display).toBe(display);
    }
  });

  it('REFUSE une déclaration INLINE — le serveur la dérive', () => {
    expect(() => PostReferenceInputSchema.parse({ username: 'alice', display: 'INLINE' })).toThrow();
  });

  it('exige userId ou username', () => {
    expect(() => PostReferenceInputSchema.parse({ display: 'NOTE' })).toThrow();
  });
});
