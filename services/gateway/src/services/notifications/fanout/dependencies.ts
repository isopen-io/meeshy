import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';
import type { NotificationService } from '../NotificationService';

/** Ce qu'un éventail emprunte à l'instance — résolu à l'APPEL, jamais capturé (cf. fanout-delegation.test.ts). */
export type FanoutDependencies = {
  readonly prisma: PrismaClient;
  readonly createNotification: NotificationService['createNotification'];
  readonly resolveRecipientLangs: (userIds: readonly string[]) => Promise<Map<string, string>>;
  readonly shouldCreateMentionNotification: (senderId: string, recipientId: string) => boolean;
  readonly isConversationMutedFor: (userId: string, conversationId: string, type: NotificationType) => Promise<boolean>;
};
