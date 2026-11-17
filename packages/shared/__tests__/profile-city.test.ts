import { describe, it, expect } from 'vitest';
import { servedCity, normalizeCityInput, CITY_MAX_LENGTH } from '../utils/profile-city';
import { updateUserProfileSchema } from '../utils/validation';
import { RELATION_LEVELS, type RelationLevel } from '../types/relation';

const ligne = (over: Partial<{ city: string | null; cityCircle: string | null }> = {}) => ({
  city: 'Dakar',
  cityCircle: 'FRIEND',
  ...over,
});

describe('servedCity : la ville ne part que vers le cercle choisi par son propriétaire', () => {
  it('sert la ville à soi-même, quel que soit le cercle (même fermé)', () => {
    expect(servedCity(ligne({ cityCircle: null }), { isSelf: true, viewerLevel: 'PUBLIC' })).toBe('Dakar');
  });

  it('ne sert RIEN tant que le propriétaire n’a pas choisi de cercle (défaut fermé)', () => {
    for (const level of RELATION_LEVELS) {
      expect(servedCity(ligne({ cityCircle: null }), { isSelf: false, viewerLevel: level })).toBeNull();
    }
  });

  it('sert à partir du cercle choisi et au-dessus, jamais en dessous', () => {
    const attendu: Record<RelationLevel, string | null> = {
      PUBLIC: null, COMMUNITY: null, ACQUAINTANCE: null,
      FRIEND: 'Dakar', CLOSE: 'Dakar', BLOOD: 'Dakar',
    };
    for (const level of RELATION_LEVELS) {
      expect(servedCity(ligne({ cityCircle: 'FRIEND' }), { isSelf: false, viewerLevel: level })).toBe(attendu[level]);
    }
  });

  it('un cercle PUBLIC sert tout le monde', () => {
    expect(servedCity(ligne({ cityCircle: 'PUBLIC' }), { isSelf: false, viewerLevel: 'PUBLIC' })).toBe('Dakar');
  });

  it('une valeur de cercle illisible ferme (jamais PUBLIC par défaut)', () => {
    expect(servedCity(ligne({ cityCircle: 'ATOM' }), { isSelf: false, viewerLevel: 'BLOOD' })).toBeNull();
    expect(servedCity(ligne({ cityCircle: 'n’importe' }), { isSelf: false, viewerLevel: 'BLOOD' })).toBeNull();
  });

  it('une ville vide ou absente ne sert rien', () => {
    expect(servedCity(ligne({ city: null }), { isSelf: true, viewerLevel: 'BLOOD' })).toBeNull();
    expect(servedCity(ligne({ city: '  ' }), { isSelf: true, viewerLevel: 'BLOOD' })).toBeNull();
  });
});

describe('normalizeCityInput', () => {
  it('rogne les espaces et efface sur vide ou null', () => {
    expect(normalizeCityInput('  Dakar  ')).toBe('Dakar');
    expect(normalizeCityInput('')).toBeNull();
    expect(normalizeCityInput('   ')).toBeNull();
    expect(normalizeCityInput(null)).toBeNull();
  });
});

describe('PATCH /users/me : validation de city et cityCircle', () => {
  it('accepte une ville et un cercle valides, ou leur effacement', () => {
    expect(updateUserProfileSchema.safeParse({ city: 'Dakar', cityCircle: 'CLOSE' }).success).toBe(true);
    expect(updateUserProfileSchema.safeParse({ city: '', cityCircle: null }).success).toBe(true);
    expect(updateUserProfileSchema.safeParse({ city: null }).success).toBe(true);
  });

  it('refuse une ville trop longue, un cercle inconnu ou ATOM (réservé)', () => {
    expect(updateUserProfileSchema.safeParse({ city: 'x'.repeat(CITY_MAX_LENGTH + 1) }).success).toBe(false);
    expect(updateUserProfileSchema.safeParse({ cityCircle: 'ATOM' }).success).toBe(false);
    expect(updateUserProfileSchema.safeParse({ cityCircle: 'EVERYONE' }).success).toBe(false);
  });

  it('refuse une ville qui contient des balises ou des caractères de contrôle', () => {
    expect(updateUserProfileSchema.safeParse({ city: '<script>' }).success).toBe(false);
    expect(updateUserProfileSchema.safeParse({ city: 'Da\u0000kar' }).success).toBe(false);
  });
});
