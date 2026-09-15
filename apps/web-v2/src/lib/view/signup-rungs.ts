/**
 * LES BARREAUX DE L'INSCRIPTION — ce qui est VISIBLE, et quand (#6405, #6582).
 *
 * Directive porteur 2026-09-14, qui REDÉCOUPE celle de la veille : « il faut
 * mettre dès le départ le numéro et l'email à montrer, et lorsqu'on a fini de
 * mettre l'email, faire apparaître les détails de son identité DIRECTEMENT.
 * […] Pas d'étape 1 sur N à afficher : tout se fait intuitivement dans la page
 * de création de compte. »
 *
 * ## Ce que la reprise retire, et pourquoi
 *
 * #6405 avait TROIS barreaux, le numéro se méritant derrière l'adresse, et une
 * jauge « Étape N sur 3 » pour rembourser l'impression de formulaire sans fin.
 * Les deux tombent ensemble, et c'est cohérent : ce qu'on ne compte plus, on
 * n'a plus à l'annoncer. Un formulaire de DEUX temps dont le premier montre
 * tout ce qu'on a à donner de soi ne donne pas l'impression de se dérouler ;
 * il se lit d'un regard.
 *
 * Le numéro remonte donc au premier barreau, avec l'adresse — il n'a jamais
 * été obligatoire (`SignupView.swift:169-171` ne l'annonce même pas comme
 * facultatif), et le cacher en faisait une étape à franchir plutôt qu'un champ
 * à laisser vide. Le bouton « Je continue sans numéro » disparaît avec lui :
 * il n'y a plus rien à passer.
 *
 * ## Les deux barreaux
 *
 * | barreau | ce qu'il rend | ce qui l'ouvre |
 * |---|---|---|
 * | `contact` | l'adresse et le numéro | rien — ils sont là dès l'ouverture |
 * | `identity` | l'identité dérivée, le mot de passe, le parrainage, la langue, le bouton | une adresse VALIDE |
 *
 * ## Ce qui SURVIT de #6405 : la monotonie
 *
 * « Au fur et à mesure » reste une règle de MONOTONIE, pas un effet visuel :
 * un champ paru ne disparaît JAMAIS. Sans cette seconde moitié, une adresse
 * qu'on revient corriger ferait s'effondrer la moitié du formulaire sous les
 * doigts — le contraire de ce que la directive demande. Écrite ici, la règle
 * se prouve sans DOM ; répartie dans l'écran, elle serait des conditions qu'il
 * faudrait relire ensemble pour savoir ce qui paraît.
 */

export const SIGNUP_RUNGS = ['contact', 'identity'] as const;

export type SignupRung = (typeof SIGNUP_RUNGS)[number];

/**
 * CE QUI EST DÉJÀ PARU — un état, parce que la monotonie a besoin d'une
 * mémoire : la seule façon de savoir qu'un barreau ne doit plus se refermer
 * est de se souvenir qu'il s'est ouvert.
 */
export type SignupReveal = {
  readonly identitySettled: boolean;
};

export const INITIAL_SIGNUP_REVEAL: SignupReveal = { identitySettled: false };

/** Ce que l'écran OBSERVE, à l'instant du rendu. Une seule observation depuis
 * #6582 : le numéro ne conditionne plus rien. */
export type SignupAnswers = {
  /** L'adresse passe `isEmailValid` — la MÊME loi que le bouton d'envoi. */
  readonly emailValid: boolean;
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
  const identitySettled = previous.identitySettled || answers.emailValid;
  if (identitySettled === previous.identitySettled) return previous;
  return { identitySettled };
}

/** Les barreaux VISIBLES, dans l'ordre — `contact` toujours, `identity` une
 * fois l'adresse valide. */
export function visibleSignupRungs(reveal: SignupReveal): readonly SignupRung[] {
  return reveal.identitySettled ? SIGNUP_RUNGS : ['contact'];
}

/** Un barreau est-il visible ? — la lecture qu'un gabarit fait, sans recomposer la liste. */
export function showsSignupRung(reveal: SignupReveal, rung: SignupRung): boolean {
  return visibleSignupRungs(reveal).includes(rung);
}
