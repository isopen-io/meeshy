import { describe, expect, test } from 'bun:test';

import {
  INITIAL_SIGNUP_PROGRESS,
  isPhoneGiven,
  nextSignupProgress,
  shouldNudgePhone,
  signupPhase,
  signupPrimaryAction,
  type SignupObservation,
  type SignupVerification,
} from './signup-phases';

/**
 * L'INSCRIPTION EN PHASES VIVANTES (#8288) — la LOI, sans DOM.
 *
 * Téléphone d'abord ; l'adresse paraît quand le numéro est donné (ou passé) ;
 * la carte d'identité paraît quand l'adresse est cohérente ; la carte porte le
 * code ; le code juste fait passer « S'inscrire » à « Parler aux autres ».
 * Rien de ce qui est paru ne se referme.
 */

const observe = (over: Partial<SignupObservation> = {}): SignupObservation => ({
  phoneGiven: false,
  phoneSkipped: false,
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
    expect(isPhoneGiven('')).toBe(false);
    expect(isPhoneGiven('0612')).toBe(false);
    expect(isPhoneGiven('06 12 34 56 78')).toBe(true);
  });
});

describe('phase 2 — l’adresse paraît', () => {
  test('quand le numéro est donné', () => {
    const progress = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneGiven: true }));
    expect(progress.emailShown).toBe(true);
    expect(signupPhase(progress, NONE)).toBe('email');
  });

  test('ou quand il est passé — « Continuer avec l’e-mail seulement »', () => {
    const progress = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneSkipped: true }));
    expect(signupPhase(progress, NONE)).toBe('email');
  });
});

describe('phase 3 — la carte d’identité paraît', () => {
  test('quand l’adresse est cohérente', () => {
    const email = nextSignupProgress(INITIAL_SIGNUP_PROGRESS, observe({ phoneSkipped: true }));
    const card = nextSignupProgress(email, observe({ phoneSkipped: true, emailValid: true }));
    expect(card.cardShown).toBe(true);
    expect(signupPhase(card, NONE)).toBe('card');
  });

  test('jamais avant l’adresse : une adresse valide sans numéro ni passage n’ouvre pas la carte', () => {
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

describe('l’alerte « sans numéro » (#8040)', () => {
  test('se pose quand aucun numéro n’est donné', () => {
    expect(shouldNudgePhone({ hasPhone: false, phoneSkipped: false })).toBe(true);
  });

  test('se tait quand on a CHOISI l’e-mail seul — le lien discret était déjà la question', () => {
    expect(shouldNudgePhone({ hasPhone: false, phoneSkipped: true })).toBe(false);
  });

  test('se tait quand un numéro est donné', () => {
    expect(shouldNudgePhone({ hasPhone: true, phoneSkipped: false })).toBe(false);
  });
});
