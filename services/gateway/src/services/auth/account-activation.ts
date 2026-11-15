/**
 * LE DÉLAI DE GRÂCE DE L'ADRESSE (#8238) — la loi UNIQUE de l'activation d'un
 * compte, que toutes les portes de session lisent.
 *
 * Directive porteur 2026-09-27 : « pouvoir créer un compte avec un e-mail
 * simplement et avoir jusqu'à une semaine d'utilisation sans dérangement, puis
 * pendant 3 semaines invitation à remplir son compte jusqu'à blocage total ».
 * Elle REMPLACE le blocage immédiat de #8055.
 *
 * | état du compte                          | phase                          | échéance       |
 * |-----------------------------------------|--------------------------------|----------------|
 * | adresse prouvée                         | `done`                         | `null`         |
 * | adresse cédée à une revendication (#8214) | `done` (plus rien à prouver) | `null`         |
 * | numéro porté, adresse non prouvée        | `quiet` < 7 j, puis `invite`  | `null`         |
 * | ni numéro ni preuve                      | `quiet` < 7 j ≤ `invite` < 28 j ≤ `blocked` | début + 28 j |
 *
 * **Le numéro n'est jamais bloquant** : il ne manque jamais au point de
 * bloquer, et un compte qui en porte un ne l'est jamais (#8055 : « si un
 * numéro est donné, le compte est activé directement »). Il figure dans
 * `missing` pour l'invitation.
 *
 * **L'horloge** démarre à la création, sauf pour les comptes EXISTANTS au
 * déploiement, qui démarrent au déploiement : sans cette clause, tous les
 * comptes non vérifiés de plus de 28 jours seraient bloqués le jour même.
 * `max(createdAt, ACTIVATION_GRACE_EPOCH)` dit exactement cela, sans colonne
 * ni migration.
 *
 * Fonctions PURES : l'instant est toujours passé par l'appelant.
 *
 * @module services/auth/account-activation
 */

import type { AccountActivation, AccountActivationMissing } from '@meeshy/shared/types/account-activation';

export const QUIET_DAYS = 7;
export const BLOCK_AFTER_DAYS = 28;

/** Le déploiement de la loi : l'horloge des comptes qui existaient déjà. */
export const ACTIVATION_GRACE_EPOCH = new Date('2026-09-28T00:00:00.000Z');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Les colonnes que la loi lit — et aucune autre. */
export type ActivationSubject = {
  readonly createdAt: Date;
  readonly emailVerifiedAt: Date | null;
  readonly phoneNumber: string | null;
  readonly emailReleasedAt?: Date | null;
};

/** Les colonnes Prisma à sélectionner pour pouvoir appliquer la loi. */
export const ACTIVATION_SELECT = {
  createdAt: true,
  emailVerifiedAt: true,
  phoneNumber: true,
  emailReleasedAt: true,
} as const;

export function activationStartedAt(subject: Pick<ActivationSubject, 'createdAt'>): Date {
  return subject.createdAt.getTime() > ACTIVATION_GRACE_EPOCH.getTime() ? subject.createdAt : ACTIVATION_GRACE_EPOCH;
}

const missingOf = (subject: ActivationSubject): readonly AccountActivationMissing[] => [
  ...(subject.emailVerifiedAt ? [] : (['email'] as const)),
  ...(subject.phoneNumber ? [] : (['phone'] as const)),
];

const ageInDays = (subject: ActivationSubject, now: Date): number =>
  (now.getTime() - activationStartedAt(subject).getTime()) / DAY_MS;

export function resolveAccountActivation(subject: ActivationSubject, now: Date): AccountActivation {
  const missing = missingOf(subject);
  if (subject.emailVerifiedAt || subject.emailReleasedAt) {
    return { phase: 'done', deadline: null, missing };
  }

  const age = ageInDays(subject, now);
  if (subject.phoneNumber) {
    return { phase: age < QUIET_DAYS ? 'quiet' : 'invite', deadline: null, missing };
  }

  const deadline = new Date(activationStartedAt(subject).getTime() + BLOCK_AFTER_DAYS * DAY_MS).toISOString();
  if (age < QUIET_DAYS) return { phase: 'quiet', deadline, missing };
  if (age < BLOCK_AFTER_DAYS) return { phase: 'invite', deadline, missing };
  return { phase: 'blocked', deadline, missing };
}

export function isActivationBlocked(subject: ActivationSubject, now: Date): boolean {
  return resolveAccountActivation(subject, now).phase === 'blocked';
}

/**
 * Publier suit le délai de grâce (#8476) : tant que la phase n'est pas
 * `blocked`, une adresse non prouvée ne retient rien. Une activation absente
 * refuse — fail-closed. Lue par la garde de `POST /posts`
 * (`requirePublishingGrace`) ET par `GET /me/onboarding` (`canPublishStory`) :
 * la carte ne promet jamais ce que la garde refuse.
 */
export function mayPublish(activation: AccountActivation | undefined): boolean {
  return activation !== undefined && activation.phase !== 'blocked';
}

/**
 * Le délai est passé : une session EXISTANTE est refusée (`401
 * ACCOUNT_ACTIVATION_REQUIRED` au middleware REST, `auth:session-revoked` au
 * socket), la prochaine connexion mène au code.
 */
export class ActivationBlockedError extends Error {
  constructor() {
    super('Account activation required');
    this.name = 'ActivationBlockedError';
  }
}
