import { describe, it, expect } from '@jest/globals';
import { calculateProfileCompletionRate } from '../../../utils/profile-completion';

/**
 * `User.profileCompletionRate` n'avait qu'un producteur : deux scripts
 * one-shot, jamais rejoués depuis leur dernière exécution manuelle (#3688).
 * Ce module est la formule qu'ils portaient, rendue rappelable à chaque
 * écriture — même cinq champs, même pondération, même arrondi.
 */
describe('calculateProfileCompletionRate', () => {
  it('rend 0 quand aucun des cinq champs n’est renseigné', () => {
    expect(calculateProfileCompletionRate({})).toBe(0);
  });

  it('rend 100 quand les cinq champs sont renseignés (bio > 10 caractères)', () => {
    expect(
      calculateProfileCompletionRate({
        displayName: 'Alice',
        avatar: 'https://example.com/a.jpg',
        bio: 'Plus de dix caractères',
        phoneNumber: '+33612345678',
        email: 'alice@example.com',
      })
    ).toBe(100);
  });

  it('une bio de 10 caractères ou moins ne compte pas — au-delà, oui', () => {
    expect(calculateProfileCompletionRate({ bio: '1234567890' })).toBe(0);
    expect(calculateProfileCompletionRate({ bio: '12345678901' })).toBe(20);
  });

  it('displayName + email seuls (l’état d’une inscription sans téléphone) rend 40', () => {
    expect(
      calculateProfileCompletionRate({ displayName: 'Alice', email: 'alice@example.com' })
    ).toBe(40);
  });

  it('displayName + email + téléphone (inscription avec téléphone) rend 60', () => {
    expect(
      calculateProfileCompletionRate({
        displayName: 'Alice',
        email: 'alice@example.com',
        phoneNumber: '+33612345678',
      })
    ).toBe(60);
  });

  it('traite null et chaîne vide comme absents, comme les scripts one-shot', () => {
    expect(
      calculateProfileCompletionRate({
        displayName: null,
        avatar: '',
        bio: null,
        phoneNumber: null,
        email: null,
      })
    ).toBe(0);
  });
});
