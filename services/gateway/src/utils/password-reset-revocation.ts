/**
 * #6661 — un `PasswordResetToken` encore valide (15 min) prouve la possession
 * de l'adresse pour laquelle il a été ÉMIS. Changer `User.email` ne le
 * révoquait sur aucun des chemins qui écrivent la colonne : le lien déposé
 * dans l'ANCIENNE boîte continuait de réinitialiser le compte après le
 * changement, et depuis #6642 sa consommation pose aussi `emailVerifiedAt` —
 * sur la NOUVELLE adresse, que ce lien ne prouve pas.
 *
 * Appelée dans la MÊME transaction que l'écriture de `email`, jamais après :
 * un jeton révoqué séparément laisserait une fenêtre où la nouvelle adresse
 * est déjà active et l'ancien lien encore valide.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from './prisma-unset';

export const EMAIL_CHANGED_REVOKE_REASON = 'EMAIL_CHANGED';

export async function revokePasswordResetTokensForEmailChange(
  tx: Pick<Prisma.TransactionClient, 'passwordResetToken'>,
  userId: string
): Promise<void> {
  await tx.passwordResetToken.updateMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
      ...unsetOrNull('usedAt')
    },
    data: {
      isRevoked: true,
      revokedReason: EMAIL_CHANGED_REVOKE_REASON
    }
  });
}
