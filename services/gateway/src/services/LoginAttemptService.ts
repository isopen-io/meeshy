import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Le verrouillage d'un compte après des tentatives d'authentification ratées.
 *
 * Le verrou EXISTAIT déjà tout entier avant ce module — trois colonnes
 * (`failedLoginAttempts`, `lockedUntil`, `lockedReason`), une erreur typée
 * rendue en 423 par le handler global (`UserLockedError`), et un job nocturne
 * qui relâche les verrous expirés (`jobs/unlock-accounts.ts`). Il n'était armé
 * par PERSONNE : `AuthService.authenticate` faisait `findFirst` + `bcrypt.compare`
 * et rendait `null` sans jamais rien compter, et l'étape du second facteur non
 * plus. Un compte pouvait donc être attaqué indéfiniment, et surtout ses CODES
 * DE SECOURS — qui ne tournent pas et n'expirent jamais (#4138).
 *
 * Ce module est le site UNIQUE qui compte un échec et pose le verrou. Il ne
 * décide pas de ce qu'on RÉPOND : c'est l'affaire des deux chemins qui
 * l'appellent, et ils n'ont pas le même public (voir `lockIsVisibleTo` plus bas).
 */

/** Au-delà, le compte se ferme pour `LOGIN_LOCK_DURATION_MS`. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/**
 * Quinze minutes — assez pour rendre une attaque par force brute sans intérêt
 * (5 essais par quart d'heure), assez peu pour qu'une personne qui s'est
 * trompée cinq fois ne soit pas punie une journée entière. Le verrou de 24 h de
 * `PasswordResetService.lockAccount` répond à un autre abus (la réinitialisation
 * en série), et garde donc sa propre durée.
 */
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

/** La valeur écrite dans `lockedReason` — le job de déverrouillage la journalise. */
export const LOGIN_LOCK_REASON = 'FAILED_LOGIN';

export type LoginLockState = {
  /** Le compteur APRÈS l'échec qu'on vient de compter. */
  attempts: number;
  /** La date de fin de verrou si ce dernier échec l'a posé, `null` sinon. */
  lockedUntil: Date | null;
};

type UserLockWriter = Pick<PrismaClient['user'], 'update'>;

/**
 * Le compte est-il verrouillé à l'instant `now` ?
 *
 * Fonction PURE, nourrie par le `select` de l'appelant : le chemin de connexion
 * a déjà lu l'utilisateur, il serait absurde de le relire. Un `lockedUntil`
 * passé n'est pas un verrou — le job de déverrouillage nettoie la colonne plus
 * tard, mais la connexion ne l'attend pas.
 */
export function isAccountLocked(
  lockedUntil: Date | null | undefined,
  now: Date = new Date()
): boolean {
  return Boolean(lockedUntil && lockedUntil > now);
}

/**
 * Compte un échec d'authentification et pose le verrou au seuil.
 *
 * L'incrément est ATOMIQUE et sa valeur d'après-écriture est celle que Prisma
 * rend : deux requêtes concurrentes obtiennent deux nombres DIFFÉRENTS, donc le
 * seuil ne peut pas être franchi deux fois par le même compte. Un
 * `read` + `if (n >= MAX)` + `write` séparés seraient un TOCTOU — c'est la
 * raison pour laquelle `PhonePasswordResetService` utilise déjà, pour le même
 * problème, une écriture conditionnelle unique.
 */
export async function recordFailedLoginAttempt(
  prisma: { user: UserLockWriter },
  userId: string,
  now: Date = new Date()
): Promise<LoginLockState> {
  const { failedLoginAttempts } = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true }
  }) as unknown as { failedLoginAttempts: number };

  // Le compteur vient de l'ÉCRITURE, jamais d'une lecture : il est donc
  // toujours là. S'il manque, la projection a été cassée en amont — et les deux
  // replis imaginables sont mauvais dans des directions opposées : supposer 0
  // ne verrouille plus jamais (force brute rouverte), supposer le seuil
  // verrouille tout le monde au premier faux pas. On refuse de deviner : la
  // tentative échoue comme n'importe quelle authentification ratée, et le
  // journal porte la trace.
  if (typeof failedLoginAttempts !== 'number') {
    throw new Error('[LoginAttemptService] `failedLoginAttempts` absent du retour d\'écriture — projection cassée');
  }

  if (failedLoginAttempts < MAX_FAILED_LOGIN_ATTEMPTS) {
    return { attempts: failedLoginAttempts, lockedUntil: null };
  }

  const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_DURATION_MS);

  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil, lockedReason: LOGIN_LOCK_REASON }
  });

  return { attempts: failedLoginAttempts, lockedUntil };
}

/**
 * Une authentification a abouti : le compteur repart de zéro.
 *
 * `lockedUntil` est remis à `null` avec lui. Sans cela, un verrou EXPIRÉ resté
 * en colonne rendrait `isAccountLocked` faux mais laisserait la ligne sale
 * jusqu'au passage du job — et surtout, le prochain échec repartirait d'un
 * compteur déjà haut, fermant le compte au premier faux pas.
 */
export async function clearFailedLoginAttempts(
  prisma: { user: UserLockWriter },
  userId: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null, lockedReason: null }
  });
}

/**
 * À qui le verrou se DIT-il ?
 *
 * Répondre « ce compte est verrouillé » à qui présente un MAUVAIS mot de passe
 * fabriquerait un oracle d'existence : cinq essais sur un compte inexistant
 * rendent cinq fois « identifiants invalides », cinq essais sur un compte réel
 * rendent la sixième fois « verrouillé ». La différence SUFFIT à énumérer les
 * comptes.
 *
 * Le verrou ne se dit donc qu'à qui a PROUVÉ qu'il connaît le mot de passe —
 * c'est-à-dire, précisément, à la personne qui a besoin de comprendre pourquoi
 * on la refuse. L'attaquant, lui, reçoit toujours la même phrase.
 *
 * Corollaire assumé : le verrou n'économise pas le `bcrypt.compare`. C'est le
 * prix de l'absence d'oracle, et le limiteur par IP (#4137) borne déjà la
 * cadence.
 */
export function lockIsVisibleTo(passwordWasCorrect: boolean): boolean {
  return passwordWasCorrect;
}
