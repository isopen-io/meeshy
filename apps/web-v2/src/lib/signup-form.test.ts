import { describe, expect, test } from 'bun:test';

import { registerRequestSchema } from '@meeshy/shared/types/api-schemas/auth';

import {
  PASSWORD_MIN,
  composeRegisterBody,
  defaultLanguages,
  isDisplayNameValid,
  hasDisplayName,
  isPhoneValid,
  phoneRefusal,
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
    username: '',
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
  // #6441 — un champ VIDE est LÉGITIME : la passerelle DÉRIVE le nom affiché
  // de la partie locale de l'adresse. Même arbitrage que le mot de passe ; le
  // refuser ici rendrait le client plus strict que le serveur, et rien ne
  // rougirait nulle part.
  test('vide ⇒ valide (la passerelle le dérive de l’adresse)', () => expect(isDisplayNameValid('')).toBe(true));
  test('vide après trim ⇒ valide aussi', () => expect(isDisplayNameValid('   ')).toBe(true));
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

describe('hasDisplayName — TAPÉ, ce qui n’est pas la même question que VALIDE (#6441)', () => {
  test('champ vide ⇒ false', () => expect(hasDisplayName('')).toBe(false));
  test('espaces seuls ⇒ false — rien n’a été nommé', () => expect(hasDisplayName('   ')).toBe(false));
  test('saisie refusée par le pattern ⇒ true — elle est tapée', () => expect(hasDisplayName('123')).toBe(true));
});

describe('canSubmit — l’ADRESSE seule suffit (#6441)', () => {
  test('nom + e-mail + mot de passe valides ⇒ actif', () => expect(canSubmit(baseForm())).toBe(true));
  /**
   * LE témoin de ce lot. Il tombait sur `false` avant #6441 : l'écran
   * promettait l'inscription par adresse seule et gardait le bouton éteint.
   * Il ne peut pas verdir par un motif étranger — les deux autres champs y
   * sont VIDES, donc seul le relâchement du nom affiché peut l'activer.
   */
  test('nom affiché vide, mot de passe vide, téléphone vide ⇒ ACTIF', () =>
    expect(canSubmit(baseForm({ displayName: '', password: '', phoneDigits: '' }))).toBe(true));
  test('adresse vide ⇒ inactif — elle est le seul champ requis', () =>
    expect(canSubmit(baseForm({ displayName: '', email: '', password: '' }))).toBe(false));
  test('nom affiché TAPÉ mais sans lettre ⇒ inactif — une saisie fournie tient sa borne', () =>
    expect(canSubmit(baseForm({ displayName: '123 456' }))).toBe(false));
  test('mot de passe trop court ⇒ inactif', () =>
    expect(canSubmit(baseForm({ password: 'a'.repeat(PASSWORD_MIN - 1) }))).toBe(false));
  test('téléphone vide ⇒ n’empêche rien', () => expect(canSubmit(baseForm({ phoneDigits: '' }))).toBe(true));
  test('mot de passe vide ⇒ n’empêche rien non plus (#6424)', () =>
    expect(canSubmit(baseForm({ password: '' }))).toBe(true));
});

describe('le numéro FOURNI doit être plausible (#6479)', () => {
  // Les trois exemples de la directive porteur, rejoués ICI parce que c'est
  // `canSubmit` qui décide si l'utilisateur peut envoyer — la loi partagée a
  // ses propres témoins, ce bloc mesure son BRANCHEMENT.
  test('« 1111100000 » ⇒ bouton éteint', () =>
    expect(canSubmit(baseForm({ phoneDigits: '1111100000' }))).toBe(false));
  test('« 42424242 » ⇒ bouton éteint', () =>
    expect(canSubmit(baseForm({ phoneDigits: '42424242' }))).toBe(false));
  test('un vrai numéro ⇒ bouton actif', () =>
    expect(canSubmit(baseForm({ phoneDigits: '0612345678' }))).toBe(true));
  test('champ VIDE ⇒ bouton actif — le numéro n’est pas requis', () =>
    expect(canSubmit(baseForm({ phoneDigits: '' }))).toBe(true));
  test('le motif du refus est NOMMÉ, pas un booléen nu', () =>
    expect(phoneRefusal('1111100000')).toBe('identical-run'));
  test('isPhoneValid suit la loi partagée', () => {
    expect(isPhoneValid('')).toBe(true);
    expect(isPhoneValid('06123456')).toBe(false);
  });
});

describe('composeRegisterBody — sans nom affiché TAPÉ (#6441, révisé #6479)', () => {
  /**
   * LA LOI A CHANGÉ, et le témoin avec elle.
   *
   * #6441 omettait la clé pour que la PASSERELLE dérive. #6479 renverse la
   * charge de la preuve sur directive porteur : « ici on a des données et la
   * passerelle doit utiliser ces données ». L'écran MONTRE le nom affiché
   * dérivé — c'est une donnée, sous les yeux de l'utilisateur, qui l'a
   * acceptée en continuant. Elle part.
   *
   * Ce qui SURVIT de #6441 : la clé reste OMISE quand il n'y a réellement
   * rien à envoyer. `displayNameProperty` porte `minLength: 1` — une chaîne
   * vide serait une VALEUR refusée, et l'inscription échouerait dans le cas
   * même qu'elle ouvre.
   */
  test('le nom affiché DÉRIVÉ part — la passerelle n’a plus à l’inventer', () => {
    const body = composeRegisterBody(baseForm({ displayName: '', email: 'jean.dupont@example.com' }));
    expect(body.displayName).toBe('Jean Dupont');
    expect(body.username).toBe('jean-dupont');
  });

  test('espaces seuls ⇒ la dérivation gagne, comme un champ vide', () => {
    const body = composeRegisterBody(baseForm({ displayName: '   ', email: 'jean.dupont@example.com' }));
    expect(body.displayName).toBe('Jean Dupont');
  });

  /**
   * Le SEUL cas où la passerelle doit encore chercher : une adresse dont rien
   * n'est slugifiable. `pseudoRacine` y retombe sur le recours `user` —
   * l'envoyer garantirait une collision pour tout le monde. On n'a alors
   * AUCUNE donnée, et c'est la règle du porteur lue jusqu'au bout.
   */
  test('une adresse non slugifiable ⇒ les DEUX clés restent absentes', () => {
    const body = composeRegisterBody(baseForm({ displayName: '', email: 'a@b.co' }));
    expect('username' in body).toBe(false);
    expect('displayName' in body).toBe(false);
  });

  test('la borne du serveur refuserait la chaîne vide — ce que l’omission évite', () => {
    expect(registerRequestSchema.properties.displayName.minLength).toBe(1);
  });

  test('le reste de la charge est intact', () => {
    const body = composeRegisterBody(baseForm({ displayName: '' }));
    expect(body.email).toBe(baseForm().email.toLowerCase());
    expect(body.password).toBe(baseForm().password);
  });

  test('un nom TAPÉ voyage, débarrassé de ses espaces de bord', () => {
    const body = composeRegisterBody(baseForm({ displayName: '  Ada Lovelace  ' }));
    expect(body.displayName).toBe('Ada Lovelace');
  });
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
  /**
   * `username` A CHANGÉ DE CAMP (#6479), `firstName`/`lastName` NON.
   *
   * Directive porteur : « dès qu'un champ username est rempli la passerelle n'a
   * plus rien à créer ». L'écran montre le pseudo, donc il l'envoie — et
   * `resoudreUsername` l'emploie tel quel. Les deux noms d'état civil, eux,
   * restent DÉRIVÉS du nom affiché côté serveur : rien ne les saisit.
   */
  test('trim + minuscules l’e-mail ; username PART, firstName/lastName jamais', () => {
    const body = composeRegisterBody(baseForm({ email: '  Ada@Example.COM  ' }));
    expect(body.email).toBe('ada@example.com');
    expect(body.username).toBe('ada-lovelace');
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
