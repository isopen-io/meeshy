import { describe, expect, test } from 'vitest';

import { registerRequestSchema, usernameMaxLength, usernameMinLength } from '../types/api-schemas/auth';
import { PSEUDO_MAX, PSEUDO_MIN } from '../utils/registration-identity';
import { isUsernameAcceptable, usernameRefusal } from '../utils/username-rule';

/**
 * LA BORNE DU PSEUDO, une seule fois (#8082).
 *
 * Constat de recette : `direction_recette` (17 caractères) passait le
 * formulaire iOS et se faisait refuser par la passerelle. Le client ne savait
 * pas la borne ; ce module est ce qu'il lit désormais — le schéma Ajv, la
 * dérivation du pseudo et les écrans citent LA même valeur.
 */
describe('la borne du pseudo — une source unique', () => {
  test('le schéma d’inscription sert exactement la borne exportée', () => {
    expect(registerRequestSchema.properties.username.minLength).toBe(usernameMinLength);
    expect(registerRequestSchema.properties.username.maxLength).toBe(usernameMaxLength);
  });

  test('la dérivation du pseudo tient la même borne', () => {
    expect(PSEUDO_MAX).toBe(usernameMaxLength);
    expect(PSEUDO_MIN).toBe(usernameMinLength);
  });

  test('la borne haute vaut 16', () => {
    expect(usernameMaxLength).toBe(16);
  });
});

describe('usernameRefusal — le MOTIF, pour dire quoi corriger', () => {
  test('le pseudo de la recette (17 caractères) est trop long', () => {
    expect(usernameRefusal('direction_recette')).toBe('too-long');
  });

  test('16 caractères passent', () => {
    expect(usernameRefusal('direction_recett')).toBeNull();
  });

  test('un caractère seul est trop court', () => {
    expect(usernameRefusal('a')).toBe('too-short');
  });

  test('un espace, un accent ou un point sont refusés', () => {
    expect(usernameRefusal('jean paul')).toBe('invalid-characters');
    expect(usernameRefusal('josé')).toBe('invalid-characters');
    expect(usernameRefusal('jean.paul')).toBe('invalid-characters');
  });

  test('la longueur prime sur les caractères — le premier défaut à corriger', () => {
    expect(usernameRefusal('é'.repeat(20))).toBe('too-long');
  });

  test('isUsernameAcceptable est la projection booléenne', () => {
    expect(isUsernameAcceptable('lea_k-2')).toBe(true);
    expect(isUsernameAcceptable('direction_recette')).toBe(false);
  });
});
