import { describe, expect, test } from 'bun:test';

import {
  INITIAL_SIGNUP_REVEAL,
  SIGNUP_RUNGS,
  nextSignupReveal,
  showsSignupRung,
  visibleSignupRungs,
} from './signup-rungs';

/**
 * LES DEUX BARREAUX (#6582, directive porteur 2026-09-14) — « il faut mettre
 * dès le départ le numéro et l'email à montrer, et lorsqu'on a fini de mettre
 * l'email, faire apparaître les détails de son identité DIRECTEMENT ».
 *
 * La loi de #6405 en avait TROIS, le numéro se méritant derrière l'adresse.
 * Elle en a deux : le CONTACT (adresse et numéro ensemble) et l'IDENTITÉ. Ce
 * qui survit de #6405 est la moitié qu'on oublie — un champ paru ne se REFERME
 * jamais.
 */

describe('à l’ouverture', () => {
  test('le contact SEUL — et il porte l’adresse ET le numéro', () => {
    expect(visibleSignupRungs(INITIAL_SIGNUP_REVEAL)).toEqual(['contact']);
    expect(showsSignupRung(INITIAL_SIGNUP_REVEAL, 'contact')).toBe(true);
    expect(showsSignupRung(INITIAL_SIGNUP_REVEAL, 'identity')).toBe(false);
  });

  test('une adresse INCOMPLÈTE n’ouvre rien', () => {
    expect(visibleSignupRungs(nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: false }))).toEqual(['contact']);
  });
});

describe('l’avancée', () => {
  test('une adresse valide ouvre l’identité, DIRECTEMENT — aucun geste intermédiaire', () => {
    expect(visibleSignupRungs(nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true }))).toEqual(SIGNUP_RUNGS);
  });

  test('le numéro n’entre dans AUCUNE condition — il est visible d’emblée, donc il n’ouvre rien', () => {
    // Le témoin de #6405 devait dire « répondre au numéro avant l'adresse
    // n'ouvre rien » ; ici, la question ne se pose plus : `SignupAnswers` ne
    // porte plus qu'une observation, et c'est ce que ce témoin fige.
    const cle = Object.keys(nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true }));
    expect(cle).toEqual(['identitySettled']);
  });
});

describe('la monotonie — un champ paru ne disparaît jamais', () => {
  test('revenir corriger son adresse ne referme pas l’identité', () => {
    const ouvert = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true });
    expect(visibleSignupRungs(nextSignupReveal(ouvert, { emailValid: false }))).toEqual(SIGNUP_RUNGS);
  });
});

describe('l’identité de l’état', () => {
  /**
   * L'écran DÉRIVE cet état pendant le rendu (`if (next !== reveal) setReveal(next)`).
   * Un objet neuf à chaque rendu y bouclerait sans fin — c'est le défaut que
   * `TranslationToggle` a payé (CLAUDE.md § Prisme).
   */
  test('rien ne s’ouvre ⇒ l’objet PRÉCÉDENT, à l’identique', () => {
    const ouvert = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true });
    expect(nextSignupReveal(ouvert, { emailValid: true })).toBe(ouvert);
    expect(nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: false })).toBe(INITIAL_SIGNUP_REVEAL);
  });
});
