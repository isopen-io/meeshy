import type { PrismaClient } from '@meeshy/shared/prisma/client';

/** Les tables dont le compte est le seul sujet et le seul lecteur, effacées par `eraseAccountScopedRowsOf`. */
export const ACCOUNT_SCOPED_MODELS = [
  'notificationPreference',
  'userStats',
  'userPreferences',
  'userPreference',
  'conversationPreference',
  'userConversationPreferences',
  'userConversationCategory',
  'userCommunityPreferences',
  'passwordResetToken',
  'phonePasswordResetToken',
  'emailVerificationWatch',
  'magicLinkToken',
  'passwordHistory',
  'userMessageDeletion',
  'messageStar',
  'postBookmark',
  'postMediaDownload',
  'agentGlobalProfile',
  'agentUserRole',
  'mutationLog',
  'userEventSeq',
  'engagementMilestone',
] as const;

export type AccountScopedErasureDb = Pick<PrismaClient, (typeof ACCOUNT_SCOPED_MODELS)[number]>;

/**
 * Efface les lignes que seul ce compte lit (#4225, verdict EFFACER) :
 * préférences, statistiques, jetons et historique d'authentification, ses
 * marques personnelles sur les messages et les posts d'autrui (masquage,
 * étoile, favori, téléchargement), ses rôles d'agent, son journal de
 * synchronisation et ses paliers d'engagement. La ligne `User` survit en
 * pierre tombale : la cascade de Prisma ne joue donc pas, et chaque table se
 * nomme ici. Idempotent : rejouer ne coûte que des requêtes vides.
 *
 * Les tables PARTAGÉES n'y sont pas : un message, une réaction, une
 * conversation restent chez les autres, l'auteur anonymisé.
 */
export async function eraseAccountScopedRowsOf(prisma: AccountScopedErasureDb, userId: string): Promise<number> {
  const where = { userId };
  const counts = await Promise.all([
    prisma.notificationPreference.deleteMany({ where }),
    prisma.userStats.deleteMany({ where }),
    prisma.userPreferences.deleteMany({ where }),
    prisma.userPreference.deleteMany({ where }),
    prisma.conversationPreference.deleteMany({ where }),
    prisma.userConversationPreferences.deleteMany({ where }),
    prisma.userConversationCategory.deleteMany({ where }),
    prisma.userCommunityPreferences.deleteMany({ where }),
    prisma.passwordResetToken.deleteMany({ where }),
    prisma.phonePasswordResetToken.deleteMany({ where }),
    prisma.emailVerificationWatch.deleteMany({ where }),
    prisma.magicLinkToken.deleteMany({ where }),
    prisma.passwordHistory.deleteMany({ where }),
    prisma.userMessageDeletion.deleteMany({ where }),
    prisma.messageStar.deleteMany({ where }),
    prisma.postBookmark.deleteMany({ where }),
    prisma.postMediaDownload.deleteMany({ where }),
    prisma.agentGlobalProfile.deleteMany({ where }),
    prisma.agentUserRole.deleteMany({ where }),
    prisma.mutationLog.deleteMany({ where }),
    prisma.userEventSeq.deleteMany({ where }),
    prisma.engagementMilestone.deleteMany({ where }),
  ]);
  return counts.reduce((total, { count }) => total + count, 0);
}
