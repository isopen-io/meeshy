import { randomUUID } from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { EngagementService } from './engagement/EngagementService.js';

const logger = enhancedLogger.child({ module: 'AffiliateTrackingService' });

/** La durée de vie d'une visite : au plus 30 jours (conformité H-9). */
export const AFFILIATE_VISIT_RETENTION_DAYS = 30;

export class AffiliateTrackingService {
  /**
   * Enregistre une visite d'affiliation (pour tracking même si l'utilisateur ne s'inscrit pas immédiatement)
   */
  static async trackAffiliateVisit(prisma: any, token: string, _visitorData?: unknown) {
    try {
      // Trouver le token d'affiliation
      const affiliateToken = await prisma.affiliateToken.findUnique({
        where: { token }
      });

      if (!affiliateToken || !affiliateToken.isActive) {
        return { success: false, error: 'Token invalide' };
      }

      // Vérifier la date d'expiration
      if (affiliateToken.expiresAt && affiliateToken.expiresAt < new Date()) {
        return { success: false, error: 'Token expiré' };
      }

      // Vérifier la limite d'utilisation
      if (affiliateToken.maxUses && affiliateToken.currentUses >= affiliateToken.maxUses) {
        return { success: false, error: 'Limite d\'utilisation atteinte' };
      }

      // Une visite ne garde QUE son identité de session (conformité H-9, RGPD art. 5(1)(c)
      // et (e), 25(1)) : ni l'adresse IP, ni l'agent utilisateur, ni le référent, ni le pays,
      // ni la langue du visiteur — la clé de session suffit à rattacher une inscription. La
      // session expire seule (index TTL sur `expiresAt`, 30 jours au plus).
      const sessionKey = `affiliate_session_${randomUUID()}`;
      await prisma.affiliateVisitSession.create({
        data: {
          sessionKey,
          affiliateTokenId: affiliateToken.id,
          affiliateUserId: affiliateToken.createdBy,
          expiresAt: new Date(Date.now() + AFFILIATE_VISIT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      return { 
        success: true, 
        data: {
          tokenId: affiliateToken.id,
          affiliateUserId: affiliateToken.createdBy,
          sessionKey
        }
      };
    } catch (error) {
      logger.error('Erreur tracking visite affiliation', error as Error);
      return { success: false, error: 'Erreur lors du tracking' };
    }
  }

  /**
   * Convertit une visite en inscription (appelé lors de l'inscription)
   */
  static async convertAffiliateVisit(prisma: any, token: string, userId: string, sessionKey?: string) {
    try {
      // Trouver le token d'affiliation
      const affiliateToken = await prisma.affiliateToken.findUnique({
        where: { token }
      });

      if (!affiliateToken || !affiliateToken.isActive) {
        return { success: false, error: 'Token invalide' };
      }

      // Vérifier la date d'expiration
      if (affiliateToken.expiresAt && affiliateToken.expiresAt < new Date()) {
        return { success: false, error: 'Token expiré' };
      }

      // Vérifier la limite d'utilisation
      if (affiliateToken.maxUses && affiliateToken.currentUses >= affiliateToken.maxUses) {
        return { success: false, error: 'Limite d\'utilisation atteinte' };
      }

      // Vérifier si la relation existe déjà
      const existingRelation = await prisma.affiliateRelation.findFirst({
        where: {
          affiliateTokenId: affiliateToken.id,
          referredUserId: userId
        }
      });

      if (existingRelation) {
        return {
          success: true,
          data: {
            id: existingRelation.id,
            status: existingRelation.status
          }
        };
      }

      // Réserver une place de façon atomique AVANT de créer la relation.
      // Le pré-check `currentUses >= maxUses` (plus haut) est un simple fast-path :
      // deux conversions concurrentes peuvent toutes deux le franchir quand
      // `currentUses === maxUses - 1`, créer chacune une relation puis incrémenter,
      // dépassant le cap (TOCTOU). La clause conditionnelle `updateMany({ where:
      // { currentUses: { lt: maxUses } } })` est sérialisée côté DB : au plus
      // `maxUses` incréments réussissent. `count === 0` = le cap a été atteint dans
      // la fenêtre de course → on rejette AVANT de créer la relation (pas de rollback).
      if (affiliateToken.maxUses !== null && affiliateToken.maxUses !== undefined) {
        const reserved = await prisma.affiliateToken.updateMany({
          where: { id: affiliateToken.id, currentUses: { lt: affiliateToken.maxUses } },
          data: { currentUses: { increment: 1 } }
        });

        if (reserved.count === 0) {
          return { success: false, error: 'Limite d\'utilisation atteinte' };
        }
      } else {
        // Token illimité : increment atomique inconditionnel (jamais `currentUses + 1`
        // calculé en JS, qui perdrait une incrémentation sous concurrence).
        await prisma.affiliateToken.update({
          where: { id: affiliateToken.id },
          data: {
            currentUses: { increment: 1 }
          }
        });
      }

      // Créer la relation d'affiliation (la place est déjà réservée atomiquement).
      const affiliateRelation = await prisma.affiliateRelation.create({
        data: {
          affiliateTokenId: affiliateToken.id,
          affiliateUserId: affiliateToken.createdBy,
          referredUserId: userId,
          status: 'completed',
          completedAt: new Date()
        }
      });

      // Axe `social.invite_joined` (#5766) — le crédit va à celui qui a INVITÉ,
      // jamais à celui qui arrive : l'axe mesure « quelqu'un est venu par moi ».
      // Il est posé ICI, après la création de la relation, et non à la VISITE :
      // un lien cliqué ne prouve rien, une inscription si.
      //
      // L'amitié qui se noue juste en dessous crédite en plus `social.friendship`
      // aux deux parties, par son propre chemin — deux gestes distincts, deux
      // axes, et c'est voulu : inviter quelqu'un qui vient VAUT plus que se
      // lier à quelqu'un qu'on connaît déjà.
      new EngagementService(prisma)
        .recordActivity(affiliateToken.createdBy, 'social.invite_joined', { actorId: userId, targetId: userId })
        .catch((err: unknown) => logger.warn('engagement social.invite_joined failed', { err } as never));

      // Créer automatiquement une demande d'amitié entre les utilisateurs (ou
      // accepter une demande préexistante dans un autre statut) — FriendRequest
      // n'a pas d'index unique, donc un simple create() peut créer un doublon
      // désynchronisé plutôt qu'échouer ; on vérifie d'abord les deux sens.
      try {
        const existingFriendRequest = await prisma.friendRequest.findFirst({
          where: {
            OR: [
              { senderId: affiliateToken.createdBy, receiverId: userId },
              { senderId: userId, receiverId: affiliateToken.createdBy },
            ],
          },
        });

        if (existingFriendRequest) {
          if (existingFriendRequest.status !== 'accepted') {
            await prisma.friendRequest.update({
              where: { id: existingFriendRequest.id },
              data: { status: 'accepted', respondedAt: new Date() },
            });
          }
        } else {
          await prisma.friendRequest.create({
            data: {
              senderId: affiliateToken.createdBy,
              receiverId: userId,
              status: 'accepted' // Accepter automatiquement pour les affiliations
            }
          });
        }
      } catch (friendRequestError) {
        logger.error(
          'Erreur synchronisation friend request affiliation',
          friendRequestError instanceof Error ? friendRequestError : new Error(String(friendRequestError))
        );
      }

      // Marquer la session comme convertie si elle existe (une seule fois).
      if (sessionKey) {
        try {
          await prisma.affiliateVisitSession.updateMany({
            where: { sessionKey, affiliateUserId: affiliateToken.createdBy, OR: [{ convertedAt: null }, { convertedAt: { isSet: false } }] },
            data: { convertedAt: new Date(), referredUserId: userId },
          });
        } catch (sessionError) {
          logger.error('Failed to persist affiliate session data', sessionError instanceof Error ? sessionError : new Error(String(sessionError)));
        }
      }

      return {
        success: true,
        data: {
          id: affiliateRelation.id,
          status: affiliateRelation.status
        }
      };
    } catch (error) {
      logger.error('Erreur conversion affiliation', error as Error);
      return { success: false, error: 'Erreur lors de la conversion' };
    }
  }

  /**
   * Récupère les statistiques d'affiliation pour un utilisateur
   */
  static async getAffiliateStats(prisma: any, userId: string, filters?: {
    tokenId?: string;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    try {
      const whereClause: any = {
        affiliateUserId: userId
      };

      if (filters?.tokenId) {
        whereClause.affiliateTokenId = filters.tokenId;
      }

      if (filters?.status) {
        whereClause.status = filters.status;
      }

      if (filters?.dateFrom || filters?.dateTo) {
        whereClause.createdAt = {};
        if (filters.dateFrom) {
          whereClause.createdAt.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          whereClause.createdAt.lte = filters.dateTo;
        }
      }

      const [referrals, stats, tokens] = await Promise.all([
        // Récupérer les relations d'affiliation
        prisma.affiliateRelation.findMany({
          where: whereClause,
          include: {
            referredUser: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                createdAt: true
              }
            },
            affiliateToken: {
              select: {
                name: true,
                token: true,
                createdAt: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),

        // Statistiques groupées par statut — même filtre que la liste `referrals`
        // pour que le décompte par statut reste cohérent avec `totalReferrals`.
        // Sans cela, un filtre (tokenId/status/dates) réduit `totalReferrals`
        // mais laissait la ventilation completed/pending/expired non filtrée,
        // pouvant excéder le total et mal attribuer les compteurs par token.
        prisma.affiliateRelation.groupBy({
          by: ['status'],
          where: whereClause,
          _count: {
            status: true
          }
        }),

        // Tokens d'affiliation de l'utilisateur
        prisma.affiliateToken.findMany({
          where: {
            createdBy: userId
          },
          include: {
            _count: {
              select: {
                affiliations: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      ]);

      const totalReferrals = referrals.length;
      const completedReferrals = stats.find(s => s.status === 'completed')?._count.status || 0;
      const pendingReferrals = stats.find(s => s.status === 'pending')?._count.status || 0;
      const expiredReferrals = stats.find(s => s.status === 'expired')?._count.status || 0;

      return {
        success: true,
        data: {
          totalReferrals,
          completedReferrals,
          pendingReferrals,
          expiredReferrals,
          referrals: referrals.map(rel => ({
            id: rel.id,
            referredUser: rel.referredUser,
            status: rel.status,
            createdAt: rel.createdAt,
            completedAt: rel.completedAt,
            affiliateToken: rel.affiliateToken
          })),
          tokens: tokens.map(token => ({
            id: token.id,
            name: token.name,
            token: token.token,
            maxUses: token.maxUses,
            currentUses: token.currentUses,
            expiresAt: token.expiresAt,
            isActive: token.isActive,
            createdAt: token.createdAt,
            _count: token._count
          }))
        }
      };
    } catch (error) {
      logger.error('Erreur récupération stats affiliation', error as Error);
      return { success: false, error: 'Erreur lors de la récupération des statistiques' };
    }
  }

  /**
   * Supprime les visites expirées (`AffiliateVisitSession`). L'index TTL le fait
   * déjà côté base ; cette purge applicative double la garantie, branchée dans
   * `cleanupExpiredData` (conformité H-9).
   */
  static async cleanupExpiredVisitSessions(prisma: Pick<PrismaClient, 'affiliateVisitSession'>, now: Date = new Date()) {
    try {
      const deleted = await prisma.affiliateVisitSession.deleteMany({ where: { expiresAt: { lt: now } } });
      return { success: true, deletedCount: deleted.count };
    } catch (error) {
      logger.error('Erreur nettoyage des visites de parrainage', error as Error);
      return { success: false, error: 'Erreur lors du nettoyage' };
    }
  }

  /**
   * Nettoie les LIGNES D'ANCIEN FORMAT (`UserPreference` « affiliate_session_* »,
   * qui portaient IP, agent utilisateur et référent en clair sous l'identifiant du
   * parrain). **Volontairement NON branchée** : la purge de l'existant en
   * production attend le feu vert du porteur, après une sauvegarde vérifiée
   * (conformité H-9). Plus aucun écrivain ne crée ces lignes.
   */
  static async cleanupExpiredSessions(prisma: any) {
    try {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 30); // Supprimer les sessions de plus de 30 jours

      const deletedSessions = await prisma.userPreference.deleteMany({
        where: {
          key: {
            startsWith: 'affiliate_session_'
          },
          createdAt: {
            lt: expiredDate
          }
        }
      });

      return { success: true, deletedCount: deletedSessions.count };
    } catch (error) {
      logger.error('Erreur nettoyage sessions', error as Error);
      return { success: false, error: 'Erreur lors du nettoyage' };
    }
  }
}
