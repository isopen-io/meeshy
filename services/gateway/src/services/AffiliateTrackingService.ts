export class AffiliateTrackingService {
  /**
   * Enregistre une visite d'affiliation (pour tracking même si l'utilisateur ne s'inscrit pas immédiatement)
   */
  static async trackAffiliateVisit(prisma: any, token: string, visitorData: {
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    country?: string;
    language?: string;
  }) {
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

      // Créer ou mettre à jour une session de tracking
      // On peut utiliser une table de sessions ou stocker dans les préférences utilisateur
      const sessionData = {
        affiliateTokenId: affiliateToken.id,
        affiliateUserId: affiliateToken.createdBy,
        visitorData: JSON.stringify(visitorData),
        visitedAt: new Date(),
        converted: false
      };

      // Stocker dans une table de sessions d'affiliation (à créer si nécessaire)
      // Pour l'instant, on peut utiliser les préférences utilisateur avec une clé spéciale
      const sessionKey = `affiliate_session_${token}_${Date.now()}`;
      
      // Créer une préférence temporaire pour le tracking
      await prisma.userPreference.create({
        data: {
          userId: affiliateToken.createdBy, // Stocker chez l'affiliateur
          key: sessionKey,
          value: JSON.stringify(sessionData),
          valueType: 'json',
          description: 'Session de tracking d\'affiliation'
        }
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
      console.error('Erreur tracking visite affiliation:', error);
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

      // Créer la relation d'affiliation
      const affiliateRelation = await prisma.affiliateRelation.create({
        data: {
          affiliateTokenId: affiliateToken.id,
          affiliateUserId: affiliateToken.createdBy,
          referredUserId: userId,
          status: 'completed',
          completedAt: new Date()
        }
      });

      // Mettre à jour le compteur d'utilisation
      await prisma.affiliateToken.update({
        where: { id: affiliateToken.id },
        data: {
          currentUses: affiliateToken.currentUses + 1
        }
      });

      // Créer automatiquement une demande d'amitié entre les utilisateurs
      try {
        await prisma.friendRequest.create({
          data: {
            senderId: affiliateToken.createdBy,
            receiverId: userId,
            status: 'accepted' // Accepter automatiquement pour les affiliations
          }
        });
      } catch (friendRequestError) {
        // Ignorer l'erreur si la demande d'amitié existe déjà
      }

      // Marquer la session comme convertie si elle existe
      if (sessionKey) {
        try {
          const sessionPreference = await prisma.userPreference.findFirst({
            where: {
              userId: affiliateToken.createdBy,
              key: sessionKey
            }
          });

          if (sessionPreference) {
            const sessionData = JSON.parse(sessionPreference.value);
            sessionData.converted = true;
            sessionData.convertedAt = new Date();
            sessionData.referredUserId = userId;

            await prisma.userPreference.update({
              where: { id: sessionPreference.id },
              data: {
                value: JSON.stringify(sessionData)
              }
            });
          }
        } catch (sessionError) {
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
      console.error('Erreur conversion affiliation:', error);
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
                isOnline: true,
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

        // Statistiques groupées par statut
        prisma.affiliateRelation.groupBy({
          by: ['status'],
          where: {
            affiliateUserId: userId
          },
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
      console.error('Erreur récupération stats affiliation:', error);
      return { success: false, error: 'Erreur lors de la récupération des statistiques' };
    }
  }

  /**
   * Nettoie les sessions d'affiliation expirées (à appeler périodiquement)
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
      console.error('Erreur nettoyage sessions:', error);
      return { success: false, error: 'Erreur lors du nettoyage' };
    }
  }
}
