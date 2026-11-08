import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';
import type { NotificationService } from '../NotificationService';

/** Ce qu'un éventail emprunte à l'instance — résolu à l'APPEL, jamais capturé (cf. fanout-delegation.test.ts). */
export type FanoutDependencies = {
  readonly prisma: PrismaClient;
  readonly createNotification: NotificationService['createNotification'];
  readonly resolveRecipientLangs: (userIds: readonly string[]) => Promise<Map<string, string>>;
  /**
   * CONSOMME un jeton du budget de mentions de la paire, et rend `false` quand
   * il est épuisé. Le nom précédent — `shouldCreateMentionNotification` — posait
   * une QUESTION et cachait une ÉCRITURE (#17073) : sur le chemin des messages,
   * deux appelants l'ont donc interrogé, et chaque notification a consommé deux
   * jetons. Ces deux éventails-ci sont les seuls gates de leur chemin : ils
   * doivent bien consommer, et le nom le dit maintenant.
   */
  readonly consumeMentionBudget: (senderId: string, recipientId: string) => boolean;
  readonly isConversationMutedFor: (userId: string, conversationId: string, type: NotificationType) => Promise<boolean>;
};
