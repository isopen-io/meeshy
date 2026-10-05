/**
 * L'ÉTAT D'ACTIVATION servi aux clients (#8238) — le contrat que la passerelle
 * pose sur l'utilisateur courant (réponses de connexion, `GET /me`,
 * renouvellement) et que les clients lisent pour l'invitation (#8239).
 *
 * La LOI qui le calcule vit dans la passerelle, seule
 * (`services/gateway/src/services/auth/account-activation.ts`) : ce module ne
 * porte que la forme du fil.
 *
 * - `quiet` : moins de 7 jours, rien n'est demandé ;
 * - `invite` : de 7 à 28 jours, les clients invitent à prouver l'adresse ;
 * - `blocked` : 28 jours passés sans preuve d'adresse, toute porte hors e-mail
 *   rend `verification-required` ;
 * - `done` : l'adresse est prouvée — `missing` peut encore valoir `['phone']`.
 *
 * `deadline` : l'instant du blocage (ISO 8601), `null` quand aucun blocage
 * n'est prévu — adresse prouvée, ou compte qui porte un numéro (le numéro
 * active le compte, #8055 ; il ne sera jamais bloqué).
 *
 * @module @meeshy/shared/types/account-activation
 */

export type AccountActivationPhase = 'quiet' | 'invite' | 'blocked' | 'done';

export type AccountActivationMissing = 'email' | 'phone';

export type AccountActivation = {
  readonly phase: AccountActivationPhase;
  readonly deadline: string | null;
  readonly missing: readonly AccountActivationMissing[];
};
