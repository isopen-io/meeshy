import { ApiError } from '@/lib/api/client';

/**
 * **CE QU'UN ÉCHEC DE PROFIL DIT, ET CE QU'IL NE DOIT PAS LAISSER DÉDUIRE**
 * (#7083, D-6).
 *
 * **403 et 404 se CONFONDENT**, et c'est une décision de confidentialité, pas
 * une commodité : rien du compte ne doit transparaître — pas même son
 * existence. Les deux rendent le MÊME texte, au caractère près, et ce texte ne
 * répète jamais le pseudo demandé. La route `GET /directory/people/:handle` ne
 * sert d'ailleurs jamais 403 (`routes/directory/person.ts`) ; le 403 vient de
 * l'expérience iOS (« bloqué par la cible », `UserProfileSheet.swift:300-303`)
 * et reste traité comme un refus indistinct.
 *
 * **429 est AUTRE CHOSE.** La route limite à 60/min par adresse pour un
 * anonyme et 240/min par compte (`person.ts:135-165`). Un débit n'est PAS une
 * absence : le rendre comme un refus apprendrait au lecteur que le compte
 * n'existe pas, ce qui est faux — et lui retirerait le seul geste utile,
 * réessayer.
 *
 * La loi est PURE pour que ces trois affirmations se mesurent sans DOM : c'est
 * la seule façon de comparer deux rendus CHAÎNE À CHAÎNE.
 */

export const PROFILE_FAILURES = ['refused', 'throttled', 'offline', 'error'] as const;
export type ProfileFailure = (typeof PROFILE_FAILURES)[number];

export function profileFailureOf(error: unknown, online: boolean): ProfileFailure {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return 'refused';
  if (error instanceof ApiError && error.status === 429) return 'throttled';
  return online ? 'error' : 'offline';
}

/** Un « Réessayer » n'a de sens que si le geste peut aboutir : hors ligne il
 * mentirait, et sur un refus il rejouerait un refus. */
export const failureMayRetry = (failure: ProfileFailure): boolean => failure === 'throttled' || failure === 'error';
