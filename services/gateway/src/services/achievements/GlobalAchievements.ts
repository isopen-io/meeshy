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
import { enhancedLogger } from '../../utils/logger-enhanced';
import { graveEtAnnonce, type AchievementOrigin } from './AchievementAnnounce';

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

/**
 * Ce qu'un balayage lit UNE fois et partage entre ses quatorze comptes
 * (#7909) : les Participants du compte — toutes ses identités de
 * conversation — et les clés de succès déjà gravées.
 *
 * Les comptes filtrent sur des champs SCALAIRES indexés (`senderId`,
 * `participantId`, `uploadedBy`), jamais par relation : sur MongoDB, Prisma
 * traduit `sender: { userId }` en un `$lookup` par document de la collection
 * ENTIÈRE — 1 265 ms mesurés sur staging pour le seul `message.send`, contre
 * 9 ms par `senderId: { in }`.
 */
type SweepScope = {
  readonly participantIds: readonly string[];
  readonly dejaGraves?: ReadonlySet<string>;
};

/**
 * Seul un message ÉCRIT par l'utilisateur compte (#7916). L'avis d'arrivée de
 * Meeshy Global (`globalArrivalsNotice.ts`), les résumés d'appel et les autres
 * messages `system` portent le Participant du compte en `senderId` : les
 * compter gravait « premier message » dès l'inscription.
 */
const AUTHORED = { messageSource: 'user' } as const;

export class GlobalAchievements {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Grave et annonce — la règle vit à son site unique (`graveEtAnnonce`), qui
   * la partage avec `CerclesAchievements`. Elle était ici en double.
   */
  private async graveTiers(
    userId: string,
    id: string,
    valeur: number,
    origin: AchievementOrigin,
    dejaGraves?: ReadonlySet<string>,
  ): Promise<void> {
    const f = famille(id);
    if (!f) return;
    await graveEtAnnonce({ prisma: this.prisma, userId, family: f, valeur, origin, dejaGraves });
  }

  private async participantIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.participant.findMany({ where: { userId }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  private async sweepScope(userId: string): Promise<SweepScope> {
    const [participantIds, graves] = await Promise.all([
      this.participantIdsOf(userId),
      this.prisma.engagementMilestone.findMany({
        where: { userId, milestoneType: 'achievement' },
        select: { milestoneKey: true },
      }),
    ]);
    return { participantIds, dejaGraves: new Set(graves.map((row) => row.milestoneKey)) };
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
   * **Il est MUET, et c'est délibéré (#5847).** Il passe `origin: 'balayage'`,
   * donc rien de ce qu'il grave ne s'annonce : c'est un rattrapage, il découvre
   * ce qui était DÉJÀ vrai. Notifier ferait tomber des dizaines de bannières
   * d'un coup à la première ouverture de l'écran, pour des gestes vieux de
   * plusieurs jours. La célébration appartient au câblage par ÉVÉNEMENT
   * (`recordEvent` depuis un site de geste, `origin: 'geste'`), qui reste à
   * étendre famille par famille — sans jamais laisser un badge mort entre-temps.
   */
  async sweep(userId: string): Promise<void> {
    const origin: AchievementOrigin = 'balayage';
    let scope: SweepScope;
    try {
      scope = await this.sweepScope(userId);
    } catch (err) {
      log.warn('balayage des succès impossible — lecture du périmètre échouée', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await Promise.all([
      this.recordEvent({ kind: 'message.send', userId }, origin, scope),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'audio/' }, origin, scope),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'image/' }, origin, scope),
      this.recordEvent({ kind: 'attachment.send', userId, mimeType: 'video/' }, origin, scope),
      this.recordEvent({ kind: 'message.edit', userId }, origin, scope),
      this.recordEvent({ kind: 'message.delete', userId }, origin, scope),
      this.recordEvent({ kind: 'message.react', userId }, origin, scope),
      this.recordEvent({ kind: 'call.join', userId }, origin, scope),
      this.recordEvent({ kind: 'referral.complete', userId }, origin, scope),
      this.recordEvent({ kind: 'link.click', userId }, origin, scope),
      this.sweepCallStart(userId, origin, scope.dejaGraves),
      this.sweepUserScalars(userId, origin, scope.dejaGraves),
    ]);
  }

  /**
   * `call.start` a deux familles : le VOLUME d'appels lancés, et l'AMPLEUR du
   * plus grand. Le balayage prend le plus grand jamais tenu — un record ne
   * redescend pas.
   */
  private async sweepCallStart(
    userId: string,
    origin: AchievementOrigin,
    dejaGraves: ReadonlySet<string> | undefined,
  ): Promise<void> {
    try {
      const sessions = await this.prisma.callSession.findMany({
        where: { initiatorId: userId },
        select: { id: true },
      });
      await this.graveTiers(userId, 'call.start.count', sessions.length, origin, dejaGraves);
      if (sessions.length === 0) return;
      const tailles = await this.prisma.callParticipant.groupBy({
        by: ['callSessionId'],
        where: { callSessionId: { in: sessions.map((s) => s.id) } },
        _count: { _all: true },
      });
      const plusGrand = tailles.reduce((max, t) => Math.max(max, t._count._all), 0);
      await this.graveTiers(userId, 'call.start.size', plusGrand, origin, dejaGraves);
    } catch (err) {
      log.warn('balayage call.start échoué', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Série et Meeshes vivent sur `User` — une seule lecture pour les deux. */
  private async sweepUserScalars(
    userId: string,
    origin: AchievementOrigin,
    dejaGraves: ReadonlySet<string> | undefined,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { longestStreakDays: true, meeshMintedLifetime: true },
      });
      if (!user) return;
      await this.graveTiers(userId, 'streak.hold.count', user.longestStreakDays ?? 0, origin, dejaGraves);
      await this.graveTiers(userId, 'meesh.mint.count', user.meeshMintedLifetime ?? 0, origin, dejaGraves);
    } catch (err) {
      log.warn('balayage des scalaires utilisateur échoué', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async recordEvent(
    event: GlobalAchievementEvent,
    origin: AchievementOrigin = 'geste',
    scope?: SweepScope,
  ): Promise<void> {
    try {
      const grave = (id: string, valeur: number) =>
        this.graveTiers(event.userId, id, valeur, origin, scope?.dejaGraves);
      const participantIds = async (): Promise<string[]> =>
        scope ? [...scope.participantIds] : this.participantIdsOf(event.userId);
      switch (event.kind) {
        case 'message.send': {
          const n = await this.prisma.message.count({
            where: { senderId: { in: await participantIds() }, ...AUTHORED, deletedAt: null },
          });
          return grave('message.send.count', n);
        }
        case 'attachment.send': {
          const id = this.familyForMime(event.mimeType);
          if (!id) return;
          const prefixe = event.mimeType.split('/')[0];
          // `uploadedBy` (indexé) plutôt que `message.sender.userId` : deux
          // `$lookup` imbriqués par pièce jointe. `messageId` posé = une pièce
          // jointe réellement ENVOYÉE, pas un téléversement abandonné.
          const n = await this.prisma.messageAttachment.count({
            where: {
              uploadedBy: event.userId,
              messageId: { not: null },
              mimeType: { startsWith: `${prefixe}/` },
            },
          });
          return grave(id, n);
        }
        case 'message.edit': {
          const n = await this.prisma.message.count({
            where: { senderId: { in: await participantIds() }, ...AUTHORED, isEdited: true },
          });
          return grave('message.edit.count', n);
        }
        case 'message.delete': {
          const n = await this.prisma.message.count({
            where: { senderId: { in: await participantIds() }, ...AUTHORED, deletedAt: { not: null } },
          });
          return grave('message.delete.count', n);
        }
        case 'message.react': {
          const n = await this.prisma.reaction.count({
            where: { participantId: { in: await participantIds() } },
          });
          return grave('message.react.count', n);
        }
        case 'call.start': {
          const [n, taille] = await Promise.all([
            this.prisma.callSession.count({ where: { initiatorId: event.userId } }),
            this.prisma.callParticipant.count({ where: { callSessionId: event.callSessionId } }),
          ]);
          await grave('call.start.count', n);
          return grave('call.start.size', taille);
        }
        case 'call.join': {
          const n = await this.prisma.callParticipant.count({
            where: { participantId: { in: await participantIds() } },
          });
          return grave('call.join.count', n);
        }
        case 'referral.complete': {
          // ACHEVÉES seulement : une invitation envoyée n'est pas une
          // ambassade, sinon le badge récompenserait le spam plutôt que la
          // venue de quelqu'un.
          const n = await this.prisma.affiliateRelation.count({
            where: { affiliateUserId: event.userId, status: 'completed' },
          });
          return grave('referral.complete.count', n);
        }
        case 'link.click': {
          const liens = await this.prisma.trackingLink.findMany({
            where: { createdBy: event.userId },
            select: { id: true },
          });
          const n =
            liens.length === 0
              ? 0
              : await this.prisma.trackingLinkClick.count({
                  where: { trackingLinkId: { in: liens.map((lien) => lien.id) } },
                });
          return grave('link.click.count', n);
        }
        case 'streak.hold':
          // Le RECORD, jamais la série courante : une série rompue ne retire
          // pas un succès (« un succès atteint reste à vie »).
          return grave('streak.hold.count', event.days);
        case 'meesh.mint':
          return grave('meesh.mint.count', event.minted);
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
