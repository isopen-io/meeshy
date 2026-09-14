import { describe, expect, test } from 'bun:test';

import {
  INITIAL_SIGNUP_REVEAL,
  SIGNUP_RUNGS,
  nextSignupReveal,
  showsSignupRung,
  visibleSignupRungs,
} from './signup-rungs';

/**
 * « LES CHAMPS APPARAISSENT UNIQUEMENT AU FUR ET À MESURE » (#6405, directive
 * porteur 2026-09-14) — et la moitié qu'on oublie : un champ paru ne se
 * REFERME jamais.
 */

describe('à l’ouverture', () => {
  test('un seul barreau : l’adresse', () => {
    expect(visibleSignupRungs(INITIAL_SIGNUP_REVEAL)).toEqual(['email']);
    expect(showsSignupRung(INITIAL_SIGNUP_REVEAL, 'phone')).toBe(false);
    expect(showsSignupRung(INITIAL_SIGNUP_REVEAL, 'identity')).toBe(false);
  });

  test('une adresse INCOMPLÈTE n’ouvre rien', () => {
    const reveal = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: false, phoneAnswered: false });
    expect(visibleSignupRungs(reveal)).toEqual(['email']);
  });
});

describe('l’avancée', () => {
  test('une adresse valide ouvre le NUMÉRO, et lui seul', () => {
    const reveal = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true, phoneAnswered: false });
    expect(visibleSignupRungs(reveal)).toEqual(['email', 'phone']);
  });

  test('le numéro RÉPONDU ouvre le reste — identité, mot de passe, langue, bouton', () => {
    const apresEmail = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true, phoneAnswered: false });
    const apresNumero = nextSignupReveal(apresEmail, { emailValid: true, phoneAnswered: true });
    expect(visibleSignupRungs(apresNumero)).toEqual(SIGNUP_RUNGS);
  });

  test('répondre au numéro AVANT d’avoir une adresse valide n’ouvre rien — aucun barreau ne saute son prédécesseur', () => {
    const reveal = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: false, phoneAnswered: true });
    expect(visibleSignupRungs(reveal)).toEqual(['email']);
  });
});

describe('la monotonie — un champ paru ne disparaît jamais', () => {
  test('revenir corriger son adresse ne referme NI le numéro NI le reste', () => {
    const ouvert = nextSignupReveal(
      nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true, phoneAnswered: false }),
      { emailValid: true, phoneAnswered: true },
    );
    const pendantLaCorrection = nextSignupReveal(ouvert, { emailValid: false, phoneAnswered: false });
    expect(visibleSignupRungs(pendantLaCorrection)).toEqual(SIGNUP_RUNGS);
  });

  test('effacer son numéro après l’avoir tapé ne referme pas le reste', () => {
    const ouvert = nextSignupReveal(
      nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true, phoneAnswered: false }),
      { emailValid: true, phoneAnswered: true },
    );
    expect(visibleSignupRungs(nextSignupReveal(ouvert, { emailValid: true, phoneAnswered: false }))).toEqual(SIGNUP_RUNGS);
  });
});

describe('l’identité de l’état', () => {
  /**
   * L'écran DÉRIVE cet état pendant le rendu (`if (next !== reveal) setReveal(next)`).
   * Un objet neuf à chaque rendu y bouclerait sans fin — c'est le défaut que
   * `TranslationToggle` a payé (CLAUDE.md § Prisme).
   */
  test('rien ne s’ouvre ⇒ l’objet PRÉCÉDENT, à l’identique', () => {
    const reveal = nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: true, phoneAnswered: true });
    expect(nextSignupReveal(reveal, { emailValid: true, phoneAnswered: true })).toBe(reveal);
    expect(nextSignupReveal(INITIAL_SIGNUP_REVEAL, { emailValid: false, phoneAnswered: false })).toBe(INITIAL_SIGNUP_REVEAL);
  });
});
