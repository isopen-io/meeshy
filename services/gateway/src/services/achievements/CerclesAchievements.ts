/**
 * LES SUCCÈS DE LA SECTION « CERCLES » (#5759) — producteur unique.
 *
 * Neuf familles : conversation et communauté × rejoindre / quitter / créer ×
 * ampleur et volume. Le catalogue et ses gabarits vivent dans `@meeshy/shared` ;
 * ce service ne fait que MESURER et GRAVER.
 *
 * ## Pourquoi un ÉVÉNEMENT et non un recalcul
 *
 * Évaluer les neuf familles à chaque geste coûterait neuf agrégats. Un
 * événement ne peut faire franchir que les paliers des familles QU'IL touche :
 * rejoindre une conversation ne change ni le nombre de communautés quittées ni
 * la taille d'une communauté créée. `recordEvent` n'évalue donc que les deux
 * familles concernées — même raisonnement que `recordActivity`, qui ne teste
 * que les paliers dans `]N, N+1]`.
 *
 * ## L'anti-rejeu
 *
 * Porté par la contrainte unique d'`EngagementMilestone`, comme partout
 * ailleurs (§ 4 du modèle) : un palier déjà gravé ne se re-grave pas, et le
 * `P2002` est un no-op silencieux, jamais une erreur. C'est ce qui rend ce
 * service IDEMPOTENT, donc rejouable par un backfill sans double notification.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne crédite AUCUN point (#5758) : un succès nomme un fait, il n'alimente
 * pas la monnaie. Sinon la course aux succès deviendrait une pompe à Meeshes.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CERCLES_FAMILIES, familyId } from '@meeshy/shared/types/achievement-families';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { graveEtAnnonce, type AchievementOrigin } from './AchievementAnnounce';

const log = enhancedLogger.child({ module: 'CerclesAchievements' });

/**
 * Les types de conversation qui ne comptent PAS comme un cercle rejoint.
 *
 * Directive porteur : « hors conversations générales ». Y appartenir n'est pas
 * un geste — tout le monde y est —, et un succès qui tombe sans qu'on ait rien
 * fait ne récompense rien.
 */
const CONVERSATION_TYPES_HORS_CATALOGUE = ['global', 'public'] as const;

export type CercleEvent =
  | { readonly kind: 'conversation.join'; readonly userId: string; readonly conversationId: string }
  | { readonly kind: 'conversation.leave'; readonly userId: string }
  | { readonly kind: 'conversation.create'; readonly userId: string }
  | { readonly kind: 'community.join'; readonly userId: string; readonly communityId: string }
  | { readonly kind: 'community.leave'; readonly userId: string }
  | { readonly kind: 'community.create'; readonly userId: string; readonly communityId: string };

const famille = (id: string) => CERCLES_FAMILIES.find((f) => familyId(f) === id);

export class CerclesAchievements {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Grave les paliers que `valeur` fait franchir sur `familyId`, et les ANNONCE
   * quand l'attribution vient d'un geste.
   *
   * La règle vit à son site unique (`graveEtAnnonce`) : elle était écrite ici
   * ET dans `GlobalAchievements`, mot pour mot. Deux copies d'une règle qui
   * doit maintenant NOTIFIER auraient divergé au premier correctif.
   */
  private async graveTiers(
    userId: string,
    id: string,
    valeur: number,
    origin: AchievementOrigin,
  ): Promise<void> {
    const f = famille(id);
    if (!f) return;
    await graveEtAnnonce({ prisma: this.prisma, userId, family: f, valeur, origin });
  }

  /** Conversations rejointes, hors générales — le VOLUME. */
  private async conversationsRejointes(userId: string): Promise<number> {
    return this.prisma.participant.count({
      where: { userId, conversation: { type: { notIn: [...CONVERSATION_TYPES_HORS_CATALOGUE] } } },
    });
  }

  /** Membres actuels d'une conversation — l'AMPLEUR de ce qu'on vient de rejoindre. */
  private async tailleConversation(conversationId: string): Promise<number> {
    return this.prisma.participant.count({ where: { conversationId, isActive: true } });
  }

  private async communautesRejointes(userId: string): Promise<number> {
    return this.prisma.communityMember.count({ where: { userId } });
  }

  private async tailleCommunaute(communityId: string): Promise<number> {
    return this.prisma.communityMember.count({ where: { communityId, isActive: true } });
  }

  /**
   * Enregistre un événement de cercle et grave ce qu'il fait franchir.
   *
   * Best-effort : une panne de mesure ne doit JAMAIS faire échouer le geste
   * métier (rejoindre une conversation, créer une communauté). Un succès non
   * gravé se rattrape au geste suivant — l'idempotence est là pour ça.
   */
  async recordEvent(event: CercleEvent, origin: AchievementOrigin = 'geste'): Promise<void> {
    try {
      switch (event.kind) {
        case 'conversation.join': {
          const [volume, taille] = await Promise.all([
            this.conversationsRejointes(event.userId),
            this.tailleConversation(event.conversationId),
          ]);
          await this.graveTiers(event.userId, 'conversation.join.count', volume, origin);
          await this.graveTiers(event.userId, 'conversation.join.size', taille, origin);
          return;
        }
        case 'conversation.leave': {
          const partis = await this.prisma.participant.count({
            where: { userId: event.userId, leftAt: { not: null } },
          });
          await this.graveTiers(event.userId, 'conversation.leave.count', partis, origin);
          return;
        }
        case 'conversation.create': {
          const creees = await this.prisma.participant.count({
            where: { userId: event.userId, role: 'creator' },
          });
          await this.graveTiers(event.userId, 'conversation.create.count', creees, origin);
          return;
        }
        case 'community.join': {
          const [volume, taille] = await Promise.all([
            this.communautesRejointes(event.userId),
            this.tailleCommunaute(event.communityId),
          ]);
          await this.graveTiers(event.userId, 'community.join.count', volume, origin);
          await this.graveTiers(event.userId, 'community.join.size', taille, origin);
          return;
        }
        case 'community.leave': {
          const partis = await this.prisma.communityMember.count({
            where: { userId: event.userId, leftAt: { not: null } },
          });
          await this.graveTiers(event.userId, 'community.leave.count', partis, origin);
          return;
        }
        case 'community.create': {
          const [volume, taille] = await Promise.all([
            this.prisma.community.count({ where: { createdBy: event.userId } }),
            this.tailleCommunaute(event.communityId),
          ]);
          await this.graveTiers(event.userId, 'community.create.count', volume, origin);
          await this.graveTiers(event.userId, 'community.create.size', taille, origin);
          return;
        }
      }
    } catch (err) {
      log.warn('évaluation de succès « cercles » échouée — le geste métier reste acquis', {
        kind: event.kind,
        userId: event.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
