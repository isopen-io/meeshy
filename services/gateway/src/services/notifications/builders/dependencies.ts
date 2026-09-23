import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';
import type { NotificationService } from '../NotificationService';

/**
 * Ce qu'un BÂTISSEUR de notification emprunte à l'instance — résolu à l'APPEL,
 * jamais capturé.
 *
 * Jumeau de `fanout/dependencies.ts`, et la distinction porte sur l'AUDIENCE,
 * pas sur la forme : un ÉVENTAIL compose une liste de destinataires et écrit
 * N lignes ; un BÂTISSEUR compose UNE notification pour UN destinataire nommé.
 * Les deux empruntent à la même instance, mais aucune fonction de l'un n'est
 * appelable par l'autre — les mélanger dans un seul type ferait croire à des
 * dépendances partagées que ni l'un ni l'autre n'a.
 *
 * La règle de `fanout-delegation.test.ts` vaut ici à la lettre : l'objet se
 * construit à CHAQUE appel (`builderDependencies()`), de sorte qu'un
 * `jest.spyOn(service, 'createNotification')` posé APRÈS le constructeur soit
 * bien celui que le bâtisseur traverse.
 */
export type NotificationBuilderDependencies = {
  readonly prisma: PrismaClient;
  readonly createNotification: NotificationService['createNotification'];
  /** Langue de CADRAGE du destinataire (Prisme-first, repli 'fr'). */
  readonly resolveRecipientLang: (userId: string) => Promise<string>;
  /** Audience de CONSOMMATION d'un post — fail-closed : en panne, on REFUSE. */
  readonly canNotifyAboutPost: (postId: string, recipientId: string) => Promise<boolean>;
  /** Anti-spam par paire (émetteur → destinataire) sur les réactions. */
  readonly shouldCreateReactionNotification: (senderId: string, recipientId: string) => boolean;
  /**
   * La troncature d'aperçu, empruntée à l'instance plutôt qu'importée de
   * `../notification-preview` : le défaut de 25 mots vit sur la projection que
   * la classe expose, et deux sites qui le redéclareraient dériveraient au
   * premier changement.
   */
  readonly truncateMessage: (message: string, maxWords?: number) => string;
  readonly isConversationMutedFor: (
    userId: string,
    conversationId: string,
    type: NotificationType
  ) => Promise<boolean>;
};
