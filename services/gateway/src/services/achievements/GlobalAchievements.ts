/**
 * LES SUCCÈS DES SIX AUTRES SECTIONS (#5759) — parole, retouche, appels,
 * ambassade, constance, monnaie.
 *
 * Même doctrine que `CerclesAchievements` : un ÉVÉNEMENT n'évalue que la
 * famille qu'il touche, l'anti-rejeu est porté par la contrainte unique
 * d'`EngagementMilestone`, et l'échec est best-effort — un compteur de succès
 * qui hoquette ne doit jamais faire échouer l'envoi d'un message.
 *
 * `decouverte` n'est pas ici : elle demande la forme COLLECTION (#5751), dont
 * aucun stockage n'existe. Un producteur sans stockage produirait des succès
 * que rien ne peut faire tomber.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ACHIEVEMENT_FAMILIES, familyId } from '@meeshy/shared/types/achievement-families';
import { achievementKey, tiersOf } from '@meeshy/shared/types/achievement-catalog';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'GlobalAchievements' });

export type GlobalAchievementEvent =
  | { readonly kind: 'message.send'; readonly userId: string }
  | { readonly kind: 'attachment.send'; readonly userId: string; readonly mimeType: string }
  | { readonly kind: 'message.edit'; readonly userId: string }
  | { readonly kind: 'message.delete'; readonly userId: string }
  | { readonly kind: 'message.react'; readonly userId: string }
  | { readonly kind: 'call.start'; readonly userId: string; readonly callSessionId: string }
  | { readonly kind: 'call.join'; readonly userId: string }
  | { readonly kind: 'referral.complete'; readonly userId: string }
  | { readonly kind: 'link.click'; readonly userId: string }
  | { readonly kind: 'streak.hold'; readonly userId: string; readonly days: number }
  | { readonly kind: 'meesh.mint'; readonly userId: string; readonly minted: number };

const famille = (id: string) => ACHIEVEMENT_FAMILIES.find((f) => familyId(f) === id);

export class GlobalAchievements {
  constructor(private readonly prisma: PrismaClient) {}

  private async graveTiers(userId: string, id: string, valeur: number): Promise<void> {
    const f = famille(id);
    if (!f) return;
    for (const palier of tiersOf(f)) {
      if (valeur < palier) continue;
      try {
        await this.prisma.engagementMilestone.create({
          data: { userId, milestoneType: 'achievement', milestoneKey: achievementKey(f, palier) },
        });
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') continue;
        throw err;
      }
    }
  }

  /**
   * Le type d'une pièce jointe se lit sur le PRÉFIXE de son `mimeType` — c'est
   * la seule discrimination que la base porte. Un type inconnu ne grave rien
   * plutôt que d'être rangé au hasard dans une famille.
   */
  private familyForMime(mimeType: string): string | null {
    if (mimeType.startsWith('audio/')) return 'voice.send.count';
    if (mimeType.startsWith('image/')) return 'image.send.count';
    if (mimeType.startsWith('video/')) return 'video.send.count';
    return null;
  }

  /**
   * ÉVALUE TOUTES les familles d'un compte, et grave ce qui est franchi.
   *
   * ## Pourquoi un balayage, alors que l'événement est plus fin
   *
   * Onze gestes distincts produisent ces succès — envoyer, corriger, supprimer,
   * réagir, lancer un appel, le rejoindre, faire venir un filleul… Les câbler
   * un par un demande onze points d'accroche, chacun à placer APRÈS son ACK
   * métier, chacun à vérifier. Une famille dont le producteur manque est un
   * BADGE MORT — le défaut exact que `community.leave.count` nous a coûté
   * (#5760).
   *
   * Le balayage rend donc TOUTES les familles vivantes d'un seul point, et il
   * est IDEMPOTENT (anti-rejeu par contrainte unique), donc il ne peut ni
   * doubler ni mentir. Son coût : quatorze comptes indexés, payés à l'ouverture
   * de l'écran « Progression » — un écran qu'on ouvre rarement, jamais sur la
   * voie chaude d'un message.
   *
   * Ce qu'il ne donne PAS, et qui reste à gagner : la notification AU MOMENT du
   * geste. Un succès balayé tombe quand l'utilisateur regarde, pas quand il
   * agit. Le câblage par événement (`recordEvent`, déjà écrit) est
   * l'optimisation qui le rendra — famille par famille, sans jamais laisser un
   * badge mort entre-temps.
   */
  async sweep(userId: string): Promise<void> {
    await Promise.all([
      this.recordEvent({ kind: 'message.send', userId }),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'audio/' }),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'image/' }),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'video/' }),
      this.recordEvent({ kind: 'message.edit', userId }),
      this.recordEvent({ kind: 'message.delete', userId }),
      this.recordEvent({ kind: 'message.react', userId }),
      this.recordEvent({ kind: 'call.join', userId }),
      this.recordEvent({ kind: 'referral.complete', userId }),
      this.recordEvent({ kind: 'link.click', userId }),
      this.sweepCallStart(userId),
      this.sweepUserScalars(userId),
    ]);
  }

  /**
   * `call.start` a deux familles : le VOLUME d'appels lancés, et l'AMPLEUR du
   * plus grand. Le balayage prend le plus grand jamais tenu — un record ne
   * redescend pas.
   */
  private async sweepCallStart(userId: string): Promise<void> {
    try {
      const sessions = await this.prisma.callSession.findMany({
        where: { initiatorId: userId },
        select: { id: true },
      });
      await this.graveTiers(userId, 'call.start.count', sessions.length);
      if (sessions.length === 0) return;
      const tailles = await this.prisma.callParticipant.groupBy({
        by: ['callSessionId'],
        where: { callSessionId: { in: sessions.map((s) => s.id) } },
        _count: { _all: true },
      });
      const plusGrand = tailles.reduce((max, t) => Math.max(max, t._count._all), 0);
      await this.graveTiers(userId, 'call.start.size', plusGrand);
    } catch (err) {
      log.warn('balayage call.start échoué', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Série et Meeshes vivent sur `User` — une seule lecture pour les deux. */
  private async sweepUserScalars(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { longestStreakDays: true, meeshMintedLifetime: true },
      });
      if (!user) return;
      await this.graveTiers(userId, 'streak.hold.count', user.longestStreakDays ?? 0);
      await this.graveTiers(userId, 'meesh.mint.count', user.meeshMintedLifetime ?? 0);
    } catch (err) {
      log.warn('balayage des scalaires utilisateur échoué', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async recordEvent(event: GlobalAchievementEvent): Promise<void> {
    try {
      switch (event.kind) {
        case 'message.send': {
          const n = await this.prisma.message.count({
            where: { sender: { userId: event.userId }, deletedAt: null },
          });
          return this.graveTiers(event.userId, 'message.send.count', n);
        }
        case 'attachment.send': {
          const id = this.familyForMime(event.mimeType);
          if (!id) return;
          const prefixe = event.mimeType.split('/')[0];
          const n = await this.prisma.messageAttachment.count({
            where: {
              mimeType: { startsWith: `${prefixe}/` },
              message: { sender: { userId: event.userId } },
            },
          });
          return this.graveTiers(event.userId, id, n);
        }
        case 'message.edit': {
          const n = await this.prisma.message.count({
            where: { sender: { userId: event.userId }, isEdited: true },
          });
          return this.graveTiers(event.userId, 'message.edit.count', n);
        }
        case 'message.delete': {
          const n = await this.prisma.message.count({
            where: { sender: { userId: event.userId }, deletedAt: { not: null } },
          });
          return this.graveTiers(event.userId, 'message.delete.count', n);
        }
        case 'message.react': {
          const n = await this.prisma.reaction.count({
            where: { participant: { userId: event.userId } },
          });
          return this.graveTiers(event.userId, 'message.react.count', n);
        }
        case 'call.start': {
          const [n, taille] = await Promise.all([
            this.prisma.callSession.count({ where: { initiatorId: event.userId } }),
            this.prisma.callParticipant.count({ where: { callSessionId: event.callSessionId } }),
          ]);
          await this.graveTiers(event.userId, 'call.start.count', n);
          return this.graveTiers(event.userId, 'call.start.size', taille);
        }
        case 'call.join': {
          const n = await this.prisma.callParticipant.count({
            where: { participant: { userId: event.userId } },
          });
          return this.graveTiers(event.userId, 'call.join.count', n);
        }
        case 'referral.complete': {
          // ACHEVÉES seulement : une invitation envoyée n'est pas une
          // ambassade, sinon le badge récompenserait le spam plutôt que la
          // venue de quelqu'un.
          const n = await this.prisma.affiliateRelation.count({
            where: { affiliateUserId: event.userId, status: 'completed' },
          });
          return this.graveTiers(event.userId, 'referral.complete.count', n);
        }
        case 'link.click': {
          const n = await this.prisma.trackingLinkClick.count({
            where: { trackingLink: { createdBy: event.userId } },
          });
          return this.graveTiers(event.userId, 'link.click.count', n);
        }
        case 'streak.hold':
          // Le RECORD, jamais la série courante : une série rompue ne retire
          // pas un succès (« un succès atteint reste à vie »).
          return this.graveTiers(event.userId, 'streak.hold.count', event.days);
        case 'meesh.mint':
          return this.graveTiers(event.userId, 'meesh.mint.count', event.minted);
      }
    } catch (err) {
      log.warn('évaluation de succès échouée — le geste métier reste acquis', {
        kind: event.kind,
        userId: event.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
