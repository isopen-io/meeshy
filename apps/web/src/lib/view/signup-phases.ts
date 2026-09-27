import { phoneImplausibility } from '@meeshy/shared/utils/phone-plausibility';

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
 * | `phone` | le numéro en verre liquide, le pays, « Continuer avec l'e-mail seulement » | rien — dès l'ouverture |
 * | `email` | l'adresse | un numéro DONNÉ (plausible) ou PASSÉ |
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
  /** Un numéro plausible est saisi (`isPhoneGiven`). */
  readonly phoneGiven: boolean;
  /** « Continuer avec l'e-mail seulement » a été touché. */
  readonly phoneSkipped: boolean;
  /** L'adresse passe `isEmailValid` — la MÊME loi que le bouton d'envoi. */
  readonly emailValid: boolean;
};

/** Un numéro est DONNÉ quand il est plausible — jamais pendant la saisie :
 * l'adresse ne paraît pas au troisième chiffre. */
export function isPhoneGiven(phoneDigits: string): boolean {
  return phoneDigits.replace(/\D/g, '').length > 0 && phoneImplausibility(phoneDigits) === null;
}

export function nextSignupProgress(previous: SignupProgress, observation: SignupObservation): SignupProgress {
  const emailShown = previous.emailShown || observation.phoneGiven || observation.phoneSkipped;
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
 * L'ALERTE « SANS NUMÉRO » (#8040) — posée quand aucun numéro n'est donné,
 * sauf si l'on a CHOISI l'e-mail seul : le lien discret de la phase 1 était
 * déjà la question, la reposer serait un geste de trop.
 */
export function shouldNudgePhone(input: { readonly hasPhone: boolean; readonly phoneSkipped: boolean }): boolean {
  return !input.hasPhone && !input.phoneSkipped;
}
