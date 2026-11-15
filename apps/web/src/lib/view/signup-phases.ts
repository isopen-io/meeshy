import type { SignupPhoneRefusal } from '../signup-form';

/**
 * L'INSCRIPTION EN PHASES VIVANTES (#8288) — ce qui est VISIBLE, et quand.
 *
 * Directive porteur 2026-09-27 : « réagencer en 3–4 phases rapides, plus
 * moderne, sexy, dynamique ». Elle remplace les deux barreaux de #6582
 * (`contact` puis `identity`) par quatre temps, dans l'ordre de l'app iOS
 * (`SignupPhases.swift`, le miroir) :
 *
 * | phase | ce qu'elle rend | ce qui l'ouvre |
 * |---|---|---|
 * | `phone` | le numéro en verre liquide, le pays | rien — dès l'ouverture |
 * | `email` | l'adresse | un numéro DONNÉ (présent et plausible) — il ne se passe plus (#9343) |
 * | `card` | la carte d'identité : nom affiché, @pseudo, refus, « Valider mon compte maintenant » | une adresse cohérente |
 * | `code` | le code à 6 chiffres, dans la carte | le compte créé par la carte |
 * | `verified` | le feu d'artifice ; « S'inscrire » devient « Parler aux autres » | le code juste, ou le lien ouvert |
 *
 * **La monotonie de #6405 survit** : un champ paru ne disparaît jamais.
 * Corriger son adresse ne fait pas s'effondrer la carte sous les doigts.
 * `nextSignupProgress` rend l'objet PRÉCÉDENT à l'identique quand rien ne
 * s'ouvre — l'écran dérive l'état pendant le rendu sans boucler.
 */

export type SignupProgress = {
  readonly emailShown: boolean;
  readonly cardShown: boolean;
};

export const INITIAL_SIGNUP_PROGRESS: SignupProgress = { emailShown: false, cardShown: false };

/** Ce que l'écran OBSERVE, à l'instant du rendu. */
export type SignupObservation = {
  /** Un numéro présent et plausible est saisi (`isPhoneValid`, `signup-form.ts`). */
  readonly phoneGiven: boolean;
  /** L'adresse passe `isEmailValid` — la MÊME loi que le bouton d'envoi. */
  readonly emailValid: boolean;
};

export function nextSignupProgress(previous: SignupProgress, observation: SignupObservation): SignupProgress {
  const emailShown = previous.emailShown || observation.phoneGiven;
  const cardShown = previous.cardShown || (emailShown && observation.emailValid);
  if (emailShown === previous.emailShown && cardShown === previous.cardShown) return previous;
  return { emailShown, cardShown };
}

/**
 * CE QUE LA CARTE SAIT DU COMPTE — une somme, parce que ses trois états ne
 * portent pas les mêmes données.
 *
 * - `none` : la carte n'a encore rien créé.
 * - `awaiting-code` : le compte existe, son code est parti. `signedIn` dit si
 *   la passerelle a rendu une session (inscription ordinaire, délai de grâce
 *   #8238) ou non (revendication d'adresse #8214, passerelle antérieure).
 * - `verified` : le code juste, ou le lien ouvert ailleurs (#8083) sur un
 *   compte déjà connecté ici.
 */
export type SignupVerification =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'awaiting-code';
      readonly email: string;
      readonly pendingSessionToken: string | null;
      readonly signedIn: boolean;
    }
  | { readonly kind: 'verified' };

export type SignupPhase = 'phone' | 'email' | 'card' | 'code' | 'verified';

export function signupPhase(progress: SignupProgress, verification: SignupVerification): SignupPhase {
  if (verification.kind === 'verified') return 'verified';
  if (verification.kind === 'awaiting-code') return 'code';
  if (progress.cardShown) return 'card';
  return progress.emailShown ? 'email' : 'phone';
}

/**
 * LE BOUTON PRINCIPAL — « S'inscrire », actif dès la phase 3 (l'inscription
 * sans code est permise pendant le délai de grâce, #8238), puis « Parler aux
 * autres » une fois le compte validé.
 *
 * Un compte créé SANS session (revendication) n'entre que par son code : le
 * bouton reste présent, inactif, et la carte dit pourquoi.
 */
export type SignupPrimaryAction = { readonly kind: 'signup'; readonly enabled: boolean } | { readonly kind: 'talk' };

export function signupPrimaryAction(input: {
  readonly progress: SignupProgress;
  readonly verification: SignupVerification;
  /** Le formulaire tient ses bornes ET le réseau répond. */
  readonly formReady: boolean;
}): SignupPrimaryAction {
  const { progress, verification, formReady } = input;
  if (verification.kind === 'verified') return { kind: 'talk' };
  if (verification.kind === 'awaiting-code') return { kind: 'signup', enabled: verification.signedIn };
  return { kind: 'signup', enabled: progress.cardShown && formReady };
}

/**
 * LE REFUS DU NUMÉRO SE DIT-IL ? (#9343) — sous le champ, jamais pendant la
 * première frappe (« trop court » au troisième chiffre ne dirait rien d'utile),
 * mais dès que le champ a été QUITTÉ avec une saisie, qu'un envoi a été tenté,
 * ou qu'un numéro donné a été retiré — l'adresse, déjà parue, ne se referme
 * pas (#6405), et l'inscription doit alors dire pourquoi elle ne part plus.
 */
export function phoneRefusalShown(input: {
  readonly refusal: SignupPhoneRefusal | null;
  readonly checked: boolean;
  readonly progress: SignupProgress;
}): boolean {
  return input.refusal !== null && (input.checked || input.progress.emailShown);
}
