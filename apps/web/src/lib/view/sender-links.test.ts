import { describe, expect, test } from 'bun:test';

import { amina, anonymousGuest } from '@/lib/api/fixtures-base';

import { linkRenderingOf } from './sender-links';

/**
 * **UNE ADRESSE ÉCRITE PAR UN ANONYME RESTE DU TEXTE (#10286).** Un invité
 * sans compte peut écrire n'importe quelle adresse : le fil ne la rend ni
 * cliquable, ni raccourcie, ni en carte. Fail-closed — un expéditeur que le
 * message ne déclare pas est traité comme un anonyme.
 */
describe('linkRenderingOf', () => {
  test('un membre inscrit : ses adresses sont des liens', () => {
    expect(linkRenderingOf({ sender: amina })).toBe('live');
  });

  test('un bot : ses adresses sont des liens', () => {
    expect(linkRenderingOf({ sender: { ...amina, type: 'bot' } })).toBe('live');
  });

  test('un participant anonyme : ses adresses restent du texte', () => {
    expect(linkRenderingOf({ sender: anonymousGuest })).toBe('plain');
  });

  test('un expéditeur indéterminé : texte, jamais un lien (fail-closed)', () => {
    expect(linkRenderingOf({})).toBe('plain');
  });

  test('la forme historique `anonymousSender` suffit à couper les liens', () => {
    expect(linkRenderingOf({ sender: amina, anonymousSender: { id: 'a', username: 'ano', firstName: '', lastName: '', language: 'fr', isMeeshyer: false } })).toBe('plain');
  });
});
