import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { contaminateReplyProtection, imposedReplyProtection } from '@meeshy/shared/utils/reply-protection-contagion';

/**
 * La passerelle IMPOSE la contagion d'une réponse (#8557) — la règle vit dans
 * `contaminateReplyProtection` (`@meeshy/shared`), ce module lui fournit le
 * message cité et rend les colonnes que `saveMessage` compose ensuite.
 *
 * Quand le message cité impose un mode éphémère, l'`expiresAt` qu'un ancien
 * client déclarait tombe : il décrivait SON choix, que la contagion remplace.
 */
export type ReplyContagionPrisma = Pick<PrismaClient, 'message'>;

export interface DeclaredProtection {
  readonly conversationId: string;
  readonly replyToId?: string;
  readonly effectFlags?: number;
  readonly isBlurred?: boolean;
  readonly ephemeralDuration?: number;
  readonly expiresAt?: Date;
}

export async function declaredReplyProtection<T extends DeclaredProtection>(
  prisma: ReplyContagionPrisma,
  declared: T,
): Promise<T> {
  if (!declared.replyToId) return declared;
  const quoted = await prisma.message.findFirst({
    where: { id: declared.replyToId, conversationId: declared.conversationId },
    select: { effectFlags: true, isBlurred: true, ephemeralDuration: true },
  });
  if (!quoted) return declared;

  const contaminated = contaminateReplyProtection({ requested: declared, quoted });
  return {
    ...declared,
    effectFlags: contaminated.effectFlags,
    isBlurred: contaminated.isBlurred,
    ephemeralDuration: contaminated.ephemeralDuration ?? undefined,
    ...(imposedReplyProtection(quoted).ephemeral === null ? {} : { expiresAt: undefined }),
  };
}
