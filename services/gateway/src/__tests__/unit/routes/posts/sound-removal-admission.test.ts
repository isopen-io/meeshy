import { describe, it, expect } from '@jest/globals';
import { mayRemoveSound } from '../../../../routes/posts/sounds';

/**
 * Qui retire un son de la bibliothèque (#9848), relu par la décision porteur du
 * 2026-10-24 (#11217) : MODERATOR de plateforme est PRIVILÉGIÉ partout. Il
 * retire déjà le post qui porte ce son (`PostService.deletePost`) ; le son
 * lui-même ne doit pas lui résister.
 */
describe('mayRemoveSound — la table des rôles de plateforme privilégiés (#11217)', () => {
  const sound = { uploaderId: 'uploader' };

  it('l’auteur retire son son', () => {
    expect(mayRemoveSound({ id: 'uploader', role: 'USER' }, sound)).toBe(true);
  });

  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])('%s de la plateforme retire le son d’autrui', (role) => {
    expect(mayRemoveSound({ id: 'other', role }, sound)).toBe(true);
  });

  it.each(['USER', 'AUDIT', 'ANALYST', 'moderator', undefined, 42])('%s reste ordinaire', (role) => {
    expect(mayRemoveSound({ id: 'other', role }, sound)).toBe(false);
  });
});
