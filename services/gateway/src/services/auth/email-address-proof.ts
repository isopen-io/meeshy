/**
 * TOUTE ACTION QUI VIENT D'UN E-MAIL PROUVE L'ADRESSE ET ACTIVE LE COMPTE
 * (#8238, précision porteur 2026-09-27 : « le but est de vérifier le compte,
 * pas de suivre une procédure à tout prix »).
 *
 * Utiliser un lien ou un code reçu à l'adresse — lien magique, lien du résumé
 * quotidien, lien ou code de réinitialisation du mot de passe, code ou lien de
 * vérification — prouve qu'on lit la boîte. `emailVerifiedAt` est alors posé,
 * et la phase d'activation passe à `done` (`./account-activation`), y compris
 * depuis `blocked`.
 *
 * Ce module est le SITE UNIQUE de cette règle. Chaque porte l'appelle :
 *
 * - `proveEmailAddress` — la porte qui n'écrit rien d'autre sur le compte
 *   (`MagicLinkService.validateMagicLink`, lien interactif ET lien du résumé) ;
 * - `emailProofFields` + `settleEmailAddressProof` — la porte qui écrit déjà
 *   dans une transaction à elle (`PasswordResetService.completePasswordReset`,
 *   `verifyEmailProof`) : le fragment entre dans SON écriture, la suite
 *   s'exécute après.
 *
 * Exception inchangée (#8214) : une clé présentée à une REVENDICATION active
 * le compte revendiquant (`./email-claim`), jamais l'ancien détenteur — elle
 * ne passe pas par ici.
 *
 * @module services/auth/email-address-proof
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { getCacheStore, type CacheStore } from '../CacheStore';
import { authUserCacheKey } from '../../middleware/auth';
import { markEmailVerificationWatchesProven, type EmailVerificationWatchStore } from './email-verification-watch';

const logger = enhancedLogger.child({ module: 'EmailAddressProof' });

export type EmailAddressProofDeps = {
  readonly prisma: Pick<PrismaClient, 'user'> & EmailVerificationWatchStore;
  /** Le cache d'auth du middleware, vidé pour que `done` se lise tout de suite. Absent ⇒ `getCacheStore()`. */
  readonly cache?: Pick<CacheStore, 'del'>;
  /** « X a rejoint Meeshy » (#8105), appelé pour une adresse NEUVEMENT prouvée. */
  readonly announce?: (userId: string) => void;
};

/** Le fragment d'écriture — la seule règle qui date une adresse prouvée par e-mail. */
export function emailProofFields(
  row: { readonly emailVerifiedAt: Date | null },
  now: Date,
): { emailVerifiedAt?: Date } {
  return row.emailVerifiedAt ? {} : { emailVerifiedAt: now };
}

/** Ce qui suit une preuve écrite : attentes « prouvées », cache d'auth vidé, arrivée annoncée. */
export async function settleEmailAddressProof(
  deps: EmailAddressProofDeps,
  input: { readonly userId: string; readonly now: Date; readonly newlyProven: boolean },
): Promise<void> {
  await markEmailVerificationWatchesProven(deps.prisma, { userId: input.userId, now: input.now });
  try {
    await (deps.cache ?? getCacheStore()).del(authUserCacheKey(input.userId));
  } catch (error) {
    logger.warn("cache d'auth non vidé — la phase se relira à son expiration", { error });
  }
  if (input.newlyProven) deps.announce?.(input.userId);
}

/**
 * Prouver l'adresse du compte. Une panne n'empêche jamais la porte d'ouvrir :
 * elle rend `newlyProven: false`, et l'adresse se prouvera à la prochaine
 * action venue d'un e-mail.
 */
export async function proveEmailAddress(
  deps: EmailAddressProofDeps,
  input: { readonly userId: string; readonly now: Date },
): Promise<{ readonly newlyProven: boolean }> {
  try {
    const row = await deps.prisma.user.findUnique({
      where: { id: input.userId },
      select: { emailVerifiedAt: true },
    });
    if (!row || row.emailVerifiedAt) return { newlyProven: false };

    const written = await deps.prisma.user.updateMany({
      where: { id: input.userId, ...unsetOrNull('emailVerifiedAt') },
      data: emailProofFields(row, input.now),
    });
    const newlyProven = written.count > 0;
    await settleEmailAddressProof(deps, { ...input, newlyProven });
    if (newlyProven) logger.info('adresse prouvée par une action venue d’un e-mail', { userId: input.userId });
    return { newlyProven };
  } catch (error) {
    logger.error('preuve d’adresse non écrite', error as Error);
    return { newlyProven: false };
  }
}
