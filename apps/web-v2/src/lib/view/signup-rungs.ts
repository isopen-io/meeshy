/**
 * LES BARREAUX DE L'INSCRIPTION — ce qui est VISIBLE, et quand (#6405).
 *
 * Directive porteur 2026-09-14 : « assure-toi d'avoir un composant moderne et
 * agréable à voir, les champs apparaissent uniquement au fur et à mesure ».
 *
 * ## Pourquoi une loi PURE plutôt que six `useState` dans l'écran
 *
 * « Au fur et à mesure » est une règle d'ORDRE et de MONOTONIE, pas un effet
 * visuel : un champ paru ne disparaît JAMAIS. Sans cette seconde moitié, une
 * adresse qu'on revient corriger ferait s'effondrer la moitié du formulaire
 * sous les doigts — le contraire de ce que la directive demande. Écrite ici,
 * la règle se prouve sans DOM et se lit d'un coup d'œil ; répartie dans
 * l'écran, elle serait six conditions qu'il faudrait relire ensemble pour
 * savoir ce qui paraît.
 *
 * ## Les trois barreaux, et ce qu'ils portent
 *
 * | barreau | ce qu'il rend | ce qui l'ouvre |
 * |---|---|---|
 * | `email` | l'adresse | rien — il est là dès l'ouverture |
 * | `phone` | le numéro et ce à quoi il sert | une adresse VALIDE |
 * | `identity` | l'identité dérivée, le mot de passe facultatif, la langue, le bouton | le numéro RÉPONDU |
 *
 * **« Répondu » n'est pas « rempli ».** Le numéro est facultatif
 * (`SignupView.swift:169-171` ne l'annonce même pas comme tel) : exiger des
 * chiffres pour continuer en ferait une obligation déguisée, et bloquerait
 * l'inscription simplifiée que la directive vise. Y répondre, c'est taper des
 * chiffres, quitter le champ, ou dire explicitement qu'on n'en donne pas.
 * L'écran décide lequel des trois s'est produit ; cette loi n'en connaît que
 * le verdict.
 *
 * **Aucun barreau ne saute son prédécesseur** : répondre au numéro avant
 * d'avoir une adresse valide n'ouvre rien — sans quoi un remplissage
 * automatique du navigateur ouvrirait tout le formulaire d'un coup, ce que la
 * directive interdit exactement.
 */

export const SIGNUP_RUNGS = ['email', 'phone', 'identity'] as const;

export type SignupRung = (typeof SIGNUP_RUNGS)[number];

/**
 * CE QUI EST DÉJÀ PARU — un état, parce que la monotonie a besoin d'une
 * mémoire : la seule façon de savoir qu'un barreau ne doit plus se refermer
 * est de se souvenir qu'il s'est ouvert.
 */
export type SignupReveal = {
  readonly emailSettled: boolean;
  readonly phoneSettled: boolean;
};

export const INITIAL_SIGNUP_REVEAL: SignupReveal = { emailSettled: false, phoneSettled: false };

/** Ce que l'écran OBSERVE, à l'instant du rendu. */
export type SignupAnswers = {
  /** L'adresse passe `isEmailValid` — la MÊME loi que le bouton d'envoi. */
  readonly emailValid: boolean;
  /** Des chiffres, un départ du champ, ou un « je continue sans numéro ». */
  readonly phoneAnswered: boolean;
};

/**
 * L'avancée, MONOTONE — rend l'état PRÉCÉDENT à l'identique quand rien ne
 * s'ouvre. Cette identité stable n'est pas un détail d'implémentation : elle
 * permet à l'écran de dériver l'état pendant le rendu (`if (next !== reveal)
 * setReveal(next)`) sans boucler, le motif que React recommande pour un état
 * dérivé — et que `TranslationToggle` a déjà payé pour avoir manqué
 * (CLAUDE.md § Prisme, « un tableau construit en ligne change d'identité à
 * chaque rendu »).
 */
export function nextSignupReveal(previous: SignupReveal, answers: SignupAnswers): SignupReveal {
  const emailSettled = previous.emailSettled || answers.emailValid;
  const phoneSettled = previous.phoneSettled || (emailSettled && answers.phoneAnswered);
  if (emailSettled === previous.emailSettled && phoneSettled === previous.phoneSettled) return previous;
  return { emailSettled, phoneSettled };
}

/** Les barreaux VISIBLES, dans l'ordre — `email` toujours, les suivants selon ce qui est paru. */
export function visibleSignupRungs(reveal: SignupReveal): readonly SignupRung[] {
  if (!reveal.emailSettled) return ['email'];
  if (!reveal.phoneSettled) return ['email', 'phone'];
  return SIGNUP_RUNGS;
}

/** Un barreau est-il visible ? — la lecture qu'un gabarit fait, sans recomposer la liste. */
export function showsSignupRung(reveal: SignupReveal, rung: SignupRung): boolean {
  return visibleSignupRungs(reveal).includes(rung);
}
