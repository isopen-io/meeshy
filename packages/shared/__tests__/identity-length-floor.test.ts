import { describe, expect, test } from 'vitest';

import {
  loginRequestSchema,
  nameMinLength,
  registerRequestSchema,
  usernameMinLength,
} from '../types/api-schemas/auth';
import { updateUserRequestSchema } from '../types/api-schemas/user';
import { linkJoinProfileSchema, guestNicknameSchema } from '../types/link-join';
import {
  createUserValidationSchema,
  updateUserProfileValidationSchema,
} from '../types/validation/admin-user';
import {
  AuthSchemas,
  CommonSchemas,
  UserSchemas,
  updateUserProfileSchema,
  updateUsernameSchema,
} from '../utils/validation';
import { derivedNames, displayNameDepuisEmail, pseudoRacine, PSEUDO_MIN } from '../utils/registration-identity';
import { visibleNameLength } from '../utils/visible-name-length';
import { usernameRefusal } from '../utils/username-rule';

/**
 * #13825 — directive porteur 2026-10-30 : un pseudo a au moins 3 caractères,
 * un prénom, un nom ou un nom affiché au moins 2, une fois rognés. La règle
 * vaut à l'inscription et à toute modification ; la CONNEXION d'un compte
 * existant (pseudo de 2 caractères) n'est pas touchée.
 */

const ADRESSE = 'lena@example.com';
const accepte = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe('les bornes partagées', () => {
  test('le pseudo commence à 3 caractères, un nom à 2', () => {
    expect(usernameMinLength).toBe(3);
    expect(nameMinLength).toBe(2);
  });

  test('la dérivation du pseudo suit la même borne', () => {
    expect(PSEUDO_MIN).toBe(usernameMinLength);
  });

  test('le verdict client du pseudo refuse « Al » et accepte « Ali »', () => {
    expect(usernameRefusal('Al')).toBe('too-short');
    expect(usernameRefusal('Ali')).toBeNull();
  });
});

describe("l'inscription — couche Zod", () => {
  test('refuse le pseudo « Al », accepte « Ali »', () => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, username: 'Al' })).toBe(false);
    expect(accepte(AuthSchemas.register, { email: ADRESSE, username: 'Ali' })).toBe(true);
  });

  test.each(['firstName', 'lastName', 'displayName'])('refuse %s « A », accepte « Al »', (champ) => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, [champ]: 'A' })).toBe(false);
    expect(accepte(AuthSchemas.register, { email: ADRESSE, [champ]: 'Al' })).toBe(true);
  });

  test.each(['firstName', 'lastName', 'displayName'])('juge %s une fois ROGNÉ : « A  » est refusé', (champ) => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, [champ]: ' A ' })).toBe(false);
  });

  test.each([
    ['un espace insécable de largeur nulle', 'A\u200B'],
    ['une marque d’ordre', 'A\uFEFF'],
    ['un e + accent combinant (un seul graphème)', 'E\u0301'],
  ])('compte en graphèmes VISIBLES : %s ne fait pas un nom de 2', (_cas, valeur) => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, firstName: valeur })).toBe(false);
  });

  test('un nom affiché d’émojis se VOIT : « 😀😀 » passe, « 😀 » seul est trop court', () => {
    expect(accepte(createUserValidationSchema, { username: 'lena', firstName: 'Lena', lastName: 'Vogel', email: ADRESSE, password: 'Xk9$mQ2vLp8', displayName: '😀😀' })).toBe(true);
    expect(accepte(createUserValidationSchema, { username: 'lena', firstName: 'Lena', lastName: 'Vogel', email: ADRESSE, password: 'Xk9$mQ2vLp8', displayName: '😀' })).toBe(false);
  });

  test('« Él » (deux graphèmes) passe', () => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, firstName: 'Él' })).toBe(true);
  });

  test('le refus porte son minimum en paramètre, pour que la passerelle le nomme', () => {
    const res = AuthSchemas.register.safeParse({ email: ADRESSE, firstName: 'A' });
    const issue = res.error?.issues.find((i) => i.path[0] === 'firstName');
    expect(issue?.code).toBe('custom');
    expect(issue && 'params' in issue ? issue.params : undefined).toEqual({ minimum: nameMinLength });
  });

  test('un nom de deux mots d’une lettre chacun reste un nom de 3 caractères', () => {
    expect(accepte(AuthSchemas.register, { email: ADRESSE, displayName: 'A B' })).toBe(true);
  });
});

describe("l'inscription — couche Ajv (structure)", () => {
  test('le pseudo porte la borne de 3', () => {
    expect(registerRequestSchema.properties.username.minLength).toBe(usernameMinLength);
  });

  test('les trois noms portent la borne de 2', () => {
    expect(registerRequestSchema.properties.firstName.minLength).toBe(nameMinLength);
    expect(registerRequestSchema.properties.lastName.minLength).toBe(nameMinLength);
    expect(registerRequestSchema.properties.displayName.minLength).toBe(nameMinLength);
  });

  test('la description annonce le minimum servi', () => {
    expect(registerRequestSchema.properties.username.description).toContain(`${usernameMinLength}-16`);
  });
});

describe('la CONNEXION garde son minimum — un compte « Al » existant se connecte encore', () => {
  test('Zod accepte « Al »', () => {
    expect(accepte(AuthSchemas.login, { username: 'Al', password: 'secret' })).toBe(true);
  });

  test('Ajv garde minLength 2', () => {
    expect(loginRequestSchema.properties.username.minLength).toBe(2);
  });
});

describe('le changement de pseudo', () => {
  test('refuse « Al », accepte « Ali »', () => {
    expect(accepte(updateUsernameSchema, { newUsername: 'Al', currentPassword: 'x' })).toBe(false);
    expect(accepte(updateUsernameSchema, { newUsername: 'Ali', currentPassword: 'x' })).toBe(true);
  });

  test('le message annonce le minimum', () => {
    const res = updateUsernameSchema.safeParse({ newUsername: 'Al', currentPassword: 'x' });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toContain(String(usernameMinLength));
  });

  test('CommonSchemas.username suit la même borne', () => {
    expect(accepte(CommonSchemas.username, 'Al')).toBe(false);
    expect(accepte(CommonSchemas.username, 'Ali')).toBe(true);
  });
});

describe('la modification du profil (PATCH /users/me) — le schéma ne porte PAS la borne', () => {
  /**
   * Rétrocompatibilité (#13825, audit) : l'iOS publié renvoie prénom, nom et
   * nom affiché INCHANGÉS à chaque enregistrement. Un compte créé sous
   * l'ancienne borne (« A ») qui change sa bio recevrait un 400 si le schéma
   * portait le plancher. La borne vit chez le handler, qui ne l'applique
   * qu'aux champs CHANGÉS (`services/gateway/src/utils/identity-name-floor.ts`).
   */
  test.each(['firstName', 'lastName'])('accepte %s « A » (compte hérité renvoyé tel quel), refuse la chaîne vide', (champ) => {
    expect(accepte(updateUserProfileSchema, { [champ]: 'A' })).toBe(true);
    expect(accepte(updateUserProfileSchema, { [champ]: '' })).toBe(false);
  });

  test('accepte le nom affiché « A » et son effacement', () => {
    expect(accepte(updateUserProfileSchema, { displayName: 'A' })).toBe(true);
    expect(accepte(updateUserProfileSchema, { displayName: '' })).toBe(true);
  });

  test('Ajv garde le minimum d’avant (1) sur les deux noms', () => {
    expect(updateUserRequestSchema.properties.firstName.minLength).toBe(1);
    expect(updateUserRequestSchema.properties.lastName.minLength).toBe(1);
  });

  test('UserSchemas.update garde le minimum d’avant', () => {
    expect(accepte(UserSchemas.update, { firstName: 'A' })).toBe(true);
    expect(accepte(UserSchemas.update, { displayName: 'A' })).toBe(true);
    expect(accepte(UserSchemas.update, { firstName: '' })).toBe(false);
  });
});

describe("la création et la modification d'un compte par l'administration", () => {
  const COMPTE = { username: 'lena', firstName: 'Lena', lastName: 'Vogel', email: ADRESSE, password: 'Xk9$mQ2vLp8' };

  test('création : pseudo « Al » et prénom « A » refusés', () => {
    expect(accepte(createUserValidationSchema, COMPTE)).toBe(true);
    expect(accepte(createUserValidationSchema, { ...COMPTE, username: 'Al' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'A' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, lastName: ' A ' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, displayName: 'A' })).toBe(false);
  });

  test('création : la borne se compte sur le texte VISIBLE, en graphèmes', () => {
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'A\u200B' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'A\u0001' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'A<b></b>' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'E\u0301' })).toBe(false);
    expect(accepte(createUserValidationSchema, { ...COMPTE, firstName: 'Él' })).toBe(true);
  });

  test('modification : le schéma garde le minimum d’avant — la borne est au handler, sur les champs CHANGÉS', () => {
    expect(accepte(updateUserProfileValidationSchema, { firstName: 'A' })).toBe(true);
    expect(accepte(updateUserProfileValidationSchema, { firstName: '' })).toBe(false);
    expect(accepte(updateUserProfileValidationSchema, { displayName: 'A' })).toBe(true);
    expect(accepte(updateUserProfileValidationSchema, { displayName: null })).toBe(true);
    expect(accepte(updateUserProfileValidationSchema, { username: 'Al' })).toBe(false);
  });
});

describe("l'invité du parcours de lien", () => {
  test('un pseudo d’invité SAISI a au moins 3 caractères rognés', () => {
    expect(accepte(guestNicknameSchema, 'Al')).toBe(false);
    expect(accepte(guestNicknameSchema, ' Al ')).toBe(false);
    expect(accepte(guestNicknameSchema, 'Ali')).toBe(true);
  });

  test('un pseudo ABSENT ou vide reste permis — la passerelle en génère un', () => {
    expect(accepte(guestNicknameSchema, undefined)).toBe(true);
    expect(accepte(guestNicknameSchema, '')).toBe(true);
    expect(accepte(guestNicknameSchema, '   ')).toBe(true);
  });

  const INVITE = { firstName: 'Lena', lastName: 'Vogel' };

  test('la jonction refuse un prénom ou un nom d’une lettre, et un pseudo de deux', () => {
    expect(accepte(linkJoinProfileSchema, INVITE)).toBe(true);
    expect(accepte(linkJoinProfileSchema, { ...INVITE, firstName: 'A' })).toBe(false);
    expect(accepte(linkJoinProfileSchema, { ...INVITE, lastName: ' B ' })).toBe(false);
    expect(accepte(linkJoinProfileSchema, { ...INVITE, username: 'Al' })).toBe(false);
    expect(accepte(linkJoinProfileSchema, { ...INVITE, username: 'Ali' })).toBe(true);
  });

});

describe("l'identité dérivée d'une adresse", () => {
  test.each(['al@example.com', 'a@example.com', 'jo.b@example.com', 'x1@example.com'])(
    'le pseudo dérivé de %j a au moins 3 caractères',
    (email) => {
      expect(pseudoRacine({ email }).length).toBeGreaterThanOrEqual(usernameMinLength);
    },
  );

  test('un nom affiché court mais valide se dérive encore : « al@ » donne « Al »', () => {
    expect(displayNameDepuisEmail('al@example.com')).toBe('Al');
  });

  test("un mot d'une lettre ne devient ni prénom ni nom", () => {
    expect(displayNameDepuisEmail('j.dupont@example.com')).toBe('Dupont');
    expect(displayNameDepuisEmail('jean.d@example.com')).toBe('Jean');
    expect(displayNameDepuisEmail('a42@example.com')).toBe('');
  });
});

describe('la longueur VISIBLE d’un nom (#13825, audit)', () => {
  test.each([
    ['Al', 2],
    ['  Al  ', 2],
    ['A\u200B', 1],
    ['A\uFEFF', 1],
    ['A\u0001', 1],
    ['A<b></b>', 1],
    ['E\u0301', 1],
    ['É', 1],
    ['A\u200E', 1],
    ['A\u2060', 1],
    ['A\u00AD', 1],
    ['A\u202E', 1],
    ['A\u2066', 1],
    ['A\u3164', 1],
    ['\u3164\u3164', 0],
    ['\u115F\u1160\uFFA0', 0],
    ['A1', 2],
    ['👨‍👩‍👧', 1],
    ['😀😀', 2],
    ['😀', 1],
    ['🇫🇷🇨🇲', 2],
    ['', 0],
  ])('%j compte %i', (valeur, attendu) => {
    expect(visibleNameLength(valeur)).toBe(attendu);
  });
});

describe('le découpage d’un nom affiché ne fabrique jamais un nom d’un caractère', () => {
  test('« Jo B » : l’initiale se fond dans son voisin', () => {
    expect(derivedNames('Jo B')).toEqual({ firstName: 'Jo B', lastName: '' });
  });

  test('« J Dupont » (ancien client) : l’initiale se fond dans le mot suivant', () => {
    expect(derivedNames('J Dupont')).toEqual({ firstName: 'J Dupont', lastName: '' });
  });

  test('« A B » : deux initiales font un seul prénom', () => {
    expect(derivedNames('A B')).toEqual({ firstName: 'A B', lastName: '' });
  });

  test('« Jean P Dupont » : l’initiale du milieu rejoint le prénom', () => {
    expect(derivedNames('Jean P Dupont')).toEqual({ firstName: 'Jean P', lastName: 'Dupont' });
  });

  test('un nom ordinaire ne change pas', () => {
    expect(derivedNames('Lena Vogel')).toEqual({ firstName: 'Lena', lastName: 'Vogel' });
    expect(derivedNames('Ana María de la Cruz')).toEqual({ firstName: 'Ana', lastName: 'María De La Cruz' });
    expect(derivedNames('Prince')).toEqual({ firstName: 'Prince', lastName: '' });
  });

  test.each(['Jo B', 'J Dupont', 'A B', 'Jean P Dupont', 'Li Ly', 'É Lo'])(
    '%j ne rend aucun prénom ni nom d’un seul caractère',
    (nom) => {
      const { firstName, lastName } = derivedNames(nom);
      expect([firstName, lastName].filter((v) => v !== '').every((v) => visibleNameLength(v) >= nameMinLength)).toBe(true);
    },
  );
});
