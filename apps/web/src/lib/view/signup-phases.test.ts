import { describe, expect, test } from 'bun:test';

import { isPhoneValid } from '../signup-form';
import {
  INITIAL_SIGNUP_PROGRESS,
  nextSignupProgress,
  phoneRefusalShown,
  signupPhase,
  signupPrimaryAction,
  type SignupObservation,
  type SignupVerification,
} from './signup-phases';

/**
 * L'INSCRIPTION EN PHASES VIVANTES (#8288) — la LOI, sans DOM.
 *
 * Téléphone d'abord ; l'adresse paraît quand le numéro est donné — et
 * seulement alors, il n'y a plus rien à passer (#9343) ;
 * la carte d'identité paraît quand l'adresse est cohérente ; la carte porte le
 * code ; le code juste fait passer « S'inscrire » à « Parler aux autres ».
 * Rien de ce qui est paru ne se referme.
 */

const observe = (over: Partial<SignupObservation> = {}): SignupObservation => ({
  phoneGiven: false,
  emailValid: false,
  ...over,
});

const NONE: SignupVerification = { kind: 'none' };
const awaiting = (signedIn: boolean): SignupVerification => ({
  kind: 'awaiting-code',
  email: 'ada@meeshy.example',
  pendingSessionToken: 'attente',
  signedIn,
});
const VERIFIED: SignupVerification = { kind: 'verified' };

describe('phase 1 — le téléphone d’abord', () => {
  test('à l’ouverture, seule la phase du téléphone est là', () => {
    expect(signupPhase(INITIAL_SIGNUP_PROGRESS, NONE)).toBe('phone');
  });

  test('un numéro incomplet n’ouvre rien', () => {
    expect(nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe())).toBe(INITIAL_SIGNUP_PROGRESS);
  });

  test('un numéro est DONNÉ quand il est plausible — jamais sur une saisie en cours', () => {
    expect(isPhoneValid('')).toBe(false);
    expect(isPhoneValid('0612')).toBe(false);
    expect(isPhoneValid('06 12 34 56 78')).toBe(true);
  });

  test('sans numéro donné, une adresse valide n’ouvre RIEN — la phase du téléphone ne se passe pas (#9343)', () => {
    expect(nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ emailValid: true }))).toBe(INITIAL_SIGNUP_PROGRESS);
  });
});

describe('phase 2 — l’adresse paraît', () => {
  test('quand le numéro est donné', () => {
    const progress = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneGiven: true }));
    expect(progress.emailShown).toBe(true);
    expect(signupPhase(progress, NONE)).toBe('email');
  });

});

describe('phase 3 — la carte d’identité paraît', () => {
  test('quand l’adresse est cohérente', () => {
    const email = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneGiven: true }));
    const card = nextSignupProgress(email, observe({ phoneGiven: true, emailValid: true }));
    expect(card.cardShown).toBe(true);
    expect(signupPhase(card, NONE)).toBe('card');
  });

  test('jamais avant l’adresse : une adresse valide sans numéro n’ouvre pas la carte', () => {
    const progress = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ emailValid: true }));
    expect(progress.cardShown).toBe(false);
  });

  test('MONOTONE — corriger son adresse ne referme ni l’adresse ni la carte', () => {
    const card = nextSignupProgress(
      nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneGiven: true })),
      observe({ phoneGiven: true, emailValid: true }),
    );
    expect(nextSignupProgress(card, observe())).toBe(card);
  });
});

describe('phase 4 — le code, dans la carte', () => {
  const card = { emailShown: true, cardShown: true } as const;

  test('le compte créé attend son code', () => {
    expect(signupPhase(card, awaiting(true))).toBe('code');
  });

  test('le code juste — ou le lien ouvert — valide le compte', () => {
    expect(signupPhase(card, VERIFIED)).toBe('verified');
  });
});

describe('le bouton principal', () => {
  const phone = INITIAL_SIGNUP_PROGRESS;
  const card = { emailShown: true, cardShown: true } as const;

  test('« S’inscrire » est présent mais INACTIF avant la carte', () => {
    expect(signupPrimaryAction({ progress: phone, verification: NONE, formReady: true })).toEqual({ kind: 'signup', enabled: false });
  });

  test('« S’inscrire » s’active dès la phase 3 — l’inscription sans code est permise (#8238)', () => {
    expect(signupPrimaryAction({ progress: card, verification: NONE, formReady: true })).toEqual({ kind: 'signup', enabled: true });
  });

  test('il reste inactif tant que la carte porte un refus', () => {
    expect(signupPrimaryAction({ progress: card, verification: NONE, formReady: false })).toEqual({ kind: 'signup', enabled: false });
  });

  test('le compte créé et connecté peut entrer sans code', () => {
    expect(signupPrimaryAction({ progress: card, verification: awaiting(true), formReady: true })).toEqual({ kind: 'signup', enabled: true });
  });

  test('un compte sans session (revendication d’adresse) n’entre que par son code', () => {
    expect(signupPrimaryAction({ progress: card, verification: awaiting(false), formReady: true })).toEqual({ kind: 'signup', enabled: false });
  });

  test('le code juste le change en « Parler aux autres »', () => {
    expect(signupPrimaryAction({ progress: card, verification: VERIFIED, formReady: false })).toEqual({ kind: 'talk' });
  });
});

describe('le refus du numéro se dit SOUS le champ, au bon moment (#9343)', () => {
  test('pendant la première frappe, rien — l’adresse ne paraît pas au troisième chiffre, le refus non plus', () => {
    expect(phoneRefusalShown({ refusal: 'too-short', checked: false, progress: INITIAL_SIGNUP_PROGRESS })).toBe(false);
  });

  test('le champ quitté avec un numéro implausible ⇒ le refus se dit', () => {
    expect(phoneRefusalShown({ refusal: 'too-short', checked: true, progress: INITIAL_SIGNUP_PROGRESS })).toBe(true);
  });

  test('un numéro donné puis effacé ⇒ l’absence se dit aussitôt', () => {
    const shown = { emailShown: true, cardShown: false };
    expect(phoneRefusalShown({ refusal: 'missing', checked: false, progress: shown })).toBe(true);
  });

  test('un numéro plausible ⇒ aucun refus, quoi qu’on ait touché', () => {
    expect(phoneRefusalShown({ refusal: null, checked: true, progress: { emailShown: true, cardShown: true } })).toBe(false);
  });
});
