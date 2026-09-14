import { describe, expect, test } from 'bun:test';

import { registerRequestSchema } from '@meeshy/shared/types/api-schemas/auth';

import {
  PASSWORD_MIN,
  composeRegisterBody,
  defaultLanguages,
  isDisplayNameValid,
  isEmailValid,
  isPasswordValid,
  hasPassword,
  canSubmit,
  type SignupFormState,
} from './signup-form';
import { countryOf } from './countries';

/**
 * LE MODÈLE D'INSCRIPTION (#5555, T3/T4/T10) — miroir de `SignupForm.swift`,
 * avec les sources PARTAGÉES (`personNamePatternSource`, `registerRequestSchema`)
 * à la place des constantes recopiées.
 */

const FR = countryOf('FR')!;

function baseForm(overrides: Partial<SignupFormState> = {}): SignupFormState {
  return {
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    phoneDigits: '',
    password: 'un-mot-de-passe-solide',
    country: FR,
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    ...overrides,
  };
}

describe('PASSWORD_MIN — LUE depuis le schéma serveur, jamais un littéral local', () => {
  test('vaut exactement registerRequestSchema.properties.password.minLength', () => {
    expect(PASSWORD_MIN).toBe(registerRequestSchema.properties.password.minLength);
  });
});

describe('validation locale — displayName', () => {
  test('vide ⇒ invalide', () => expect(isDisplayNameValid('')).toBe(false));
  test('101 caractères ⇒ invalide', () => expect(isDisplayNameValid('a'.repeat(101))).toBe(false));
  test('sans lettre ("123 456") ⇒ invalide', () => expect(isDisplayNameValid('123 456')).toBe(false));
  test('avec accents et apostrophes ("Aïcha O’Neil") ⇒ valide', () =>
    expect(isDisplayNameValid('Aïcha O’Neil')).toBe(true));
  test('100 caractères avec au moins une lettre ⇒ valide', () => expect(isDisplayNameValid(`${'a'.repeat(99)}b`)).toBe(true));
});

describe('validation locale — email', () => {
  test('"a@b" (pas de TLD) ⇒ invalide', () => expect(isEmailValid('a@b')).toBe(false));
  test('"ada@example.com" ⇒ valide', () => expect(isEmailValid('ada@example.com')).toBe(true));
});

describe('validation locale — password (borne LUE, pas un littéral)', () => {
  test(`${PASSWORD_MIN - 1} caractères ⇒ invalide`, () => expect(isPasswordValid('a'.repeat(PASSWORD_MIN - 1))).toBe(false));
  test(`${PASSWORD_MIN} caractères ⇒ valide`, () => expect(isPasswordValid('a'.repeat(PASSWORD_MIN))).toBe(true));
  // #6424 — un champ VIDE est LÉGITIME : le compte naît sans mot de passe et sa
  // porte est le lien magique. Garder l'ancienne règle rendrait le client plus
  // strict que le serveur, et rien ne rougirait nulle part.
  test('champ vide ⇒ valide', () => expect(isPasswordValid('')).toBe(true));
});

describe('hasPassword — TAPÉ, ce qui n’est pas la même question que VALIDE (#6424)', () => {
  test('champ vide ⇒ false', () => expect(hasPassword('')).toBe(false));
  test('saisie trop courte ⇒ true — elle est tapée, même si elle sera refusée', () =>
    expect(hasPassword('a')).toBe(true));
});

describe('canSubmit — les TROIS champs requis, jamais le téléphone', () => {
  test('nom + e-mail + mot de passe valides ⇒ actif', () => expect(canSubmit(baseForm())).toBe(true));
  test('mot de passe trop court ⇒ inactif', () =>
    expect(canSubmit(baseForm({ password: 'a'.repeat(PASSWORD_MIN - 1) }))).toBe(false));
  test('téléphone vide ⇒ n’empêche rien', () => expect(canSubmit(baseForm({ phoneDigits: '' }))).toBe(true));
  test('mot de passe vide ⇒ n’empêche rien non plus (#6424)', () =>
    expect(canSubmit(baseForm({ password: '' }))).toBe(true));
});

describe('composeRegisterBody — sans mot de passe (#6424)', () => {
  /**
   * Le témoin qui compte : la clé est OMISE, pas posée à `''`.
   *
   * Une chaîne vide serait une VALEUR, refusée par la borne de longueur du
   * serveur — le formulaire échouerait précisément dans le cas qu'il vient
   * d'ouvrir, et le refus parlerait d'un mot de passe trop court à quelqu'un
   * qui n'en a pas voulu.
   */
  test('la clé password est ABSENTE de la charge', () => {
    const body = composeRegisterBody(baseForm({ password: '' }));
    expect('password' in body).toBe(false);
  });

  test('le reste de la charge est intact', () => {
    const body = composeRegisterBody(baseForm({ password: '' }));
    expect(body.email).toBe(baseForm().email.toLowerCase());
    expect(body.displayName).toBe(baseForm().displayName.trim());
  });

  test('un mot de passe TAPÉ voyage tel quel', () => {
    const body = composeRegisterBody(baseForm({ password: '  secret  ' }));
    expect(body.password).toBe('  secret  ');
  });
});

describe('composeRegisterBody — la charge EXACTE de POST /auth/register (register.ts:133)', () => {
  test('trim + minuscules l’e-mail, jamais username/firstName/lastName', () => {
    const body = composeRegisterBody(baseForm({ email: '  Ada@Example.COM  ' }));
    expect(body.email).toBe('ada@example.com');
    expect('username' in body).toBe(false);
    expect('firstName' in body).toBe(false);
    expect('lastName' in body).toBe(false);
  });

  test('téléphone renseigné ⇒ TOUT ou RIEN — chiffres tels quels + phoneCountryCode ISO', () => {
    const body = composeRegisterBody(baseForm({ phoneDigits: '0612345678', country: FR }));
    expect(body.phoneNumber).toBe('0612345678');
    expect(body.phoneCountryCode).toBe('FR');
  });

  test('téléphone vide ⇒ les DEUX clés absentes', () => {
    const body = composeRegisterBody(baseForm({ phoneDigits: '' }));
    expect('phoneNumber' in body).toBe(false);
    expect('phoneCountryCode' in body).toBe(false);
  });

  test('les chiffres non numériques (espaces, points) sont filtrés avant envoi', () => {
    const body = composeRegisterBody(baseForm({ phoneDigits: '06 12.34 56 78' }));
    expect(body.phoneNumber).toBe('0612345678');
  });

  test('systemLanguage/regionalLanguage portent les deux rangs du formulaire', () => {
    const body = composeRegisterBody(baseForm({ systemLanguage: 'es', regionalLanguage: 'en' }));
    expect(body.systemLanguage).toBe('es');
    expect(body.regionalLanguage).toBe('en');
  });
});

describe('défauts de locale (miroir SignupForm.swift:190-198, rang AUTRE que le premier)', () => {
  test('fr-FR ⇒ system fr, regional en', () => {
    const langs = defaultLanguages('fr-FR');
    expect(langs.systemLanguage).toBe('fr');
    expect(langs.regionalLanguage).toBe('en');
  });

  test('en-US ⇒ system en, regional fr (rang 2 ≠ rang 1)', () => {
    const langs = defaultLanguages('en-US');
    expect(langs.systemLanguage).toBe('en');
    expect(langs.regionalLanguage).toBe('fr');
  });

  test('locale non servie ("gd", gaélique écossais) ⇒ system fr', () => {
    const langs = defaultLanguages('gd-GB');
    expect(langs.systemLanguage).toBe('fr');
  });
});
