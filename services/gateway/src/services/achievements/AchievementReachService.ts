/**
 * LA CARTE D'ATTEIGNABILITÉ (#5759) — ce que le produit peut rendre vrai.
 *
 * Directive porteur : les succès « ne doivent s'afficher que par palier et
 * seulement si ATTEIGNABLE ». Un succès « conversation de 1 000 000 membres »
 * dans un produit dont la plus grande en compte 300 n'est pas un objectif :
 * c'est une promesse qu'on ne peut pas tenir, et elle décrédibilise les autres.
 *
 * L'atteignabilité est donc MESURÉE sur la réalité du produit à cet instant,
 * jamais déclarée une fois pour toutes — elle monte à mesure que le produit
 * grandit, et les paliers apparaissent d'eux-mêmes.
 *
 * ## Pourquoi un cache, et pourquoi si long
 *
 * Ces mesures sont des agrégats sur des collections entières. Les payer à
 * chaque ouverture de l'écran « Progression » serait absurde : la plus grande
 * conversation du produit ne change pas d'une minute à l'autre, et si elle
 * change, un palier apparaît une heure plus tard — sans aucune conséquence.
 *
 * Le repli en cas de panne est l'ABSENCE de mesure, pas zéro : une famille
 * absente de la carte masque ses paliers d'ampleur (on ne promet pas ce qu'on
 * ignore) et laisse ses paliers de volume visibles (répéter reste possible).
 * Zéro dirait « rien n'est atteignable », ce qui est faux et pire.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { AchievementReach } from '@meeshy/shared/types/achievement-catalog';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'AchievementReachService' });

/** Une heure : la plus grande conversation du produit ne bouge pas plus vite. */
export const REACH_CACHE_TTL_MS = 60 * 60 * 1000;

const CONVERSATION_TYPES_HORS_CATALOGUE = ['global', 'public'] as const;

type Cache = { readonly reach: AchievementReach; readonly expiresAt: number };

export class AchievementReachService {
  private cache: Cache | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * La plus grande valeur d'un `groupBy` de comptage — `null` si la mesure
   * échoue, ce qui est distinct de « zéro ».
   */
  private async maxGroupCount(
    lire: () => Promise<Array<{ _count: { _all: number } }>>,
  ): Promise<number | null> {
    try {
      const groupes = await lire();
      if (groupes.length === 0) return 0;
      return groupes.reduce((max, g) => Math.max(max, g._count._all), 0);
    } catch (err) {
      log.warn('mesure d’atteignabilité indisponible — les paliers d’ampleur restent masqués', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async load(): Promise<AchievementReach> {
    const maintenant = Date.now();
    if (this.cache && this.cache.expiresAt > maintenant) return this.cache.reach;

    const [conversation, communaute] = await Promise.all([
      this.maxGroupCount(() =>
        this.prisma.participant.groupBy({
          by: ['conversationId'],
          where: {
            isActive: true,
            conversation: { type: { notIn: [...CONVERSATION_TYPES_HORS_CATALOGUE] } },
          },
          _count: { _all: true },
        }) as never,
      ),
      this.maxGroupCount(() =>
        this.prisma.communityMember.groupBy({
          by: ['communityId'],
          where: { isActive: true },
          _count: { _all: true },
        }) as never,
      ),
    ]);

    const reach = new Map<string, number>();
    // Une mesure ABSENTE n'entre pas dans la carte : c'est ce qui distingue
    // « je ne sais pas » (masquer) de « c'est zéro » (afficher le palier 10 et
    // le laisser inatteignable).
    if (conversation !== null) reach.set('conversation.join.size', conversation);
    if (communaute !== null) {
      reach.set('community.join.size', communaute);
      // Réunir N membres dans une communauté qu'on a créée se borne à la même
      // réalité : la plus grande communauté qui existe.
      reach.set('community.create.size', communaute);
    }

    this.cache = { reach, expiresAt: maintenant + REACH_CACHE_TTL_MS };
    return reach;
  }
}
