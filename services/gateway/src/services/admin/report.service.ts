import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type {
  Report,
  CreateReportDTO,
  UpdateReportDTO,
  ReportFilters,
  ReportStats,
  ReportStatus,
  ReportType,
  ReportedType
} from '@meeshy/shared/types';

/**
 * Service de gestion des signalements
 */
export class ReportService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Créer un nouveau signalement
   */
  async createReport(data: CreateReportDTO): Promise<Report> {
    const report = await this.prisma.report.create({
      data: {
        reportedType: data.reportedType,
        reportedEntityId: data.reportedEntityId,
        reporterId: data.reporterId || null,
        reporterName: data.reporterName || null,
        reportType: data.reportType,
        reason: data.reason || null,
        status: 'pending'
      }
    });

    return report as Report;
  }

  /**
   * Obtenir un signalement par ID
   */
  async getReportById(reportId: string): Promise<Report | null> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId }
    });

    return report as Report | null;
  }

  /**
   * Lister les signalements avec pagination et filtres
   */
  async listReports(
    filters: ReportFilters = {},
    pagination: { offset: number; limit: number } = { offset: 0, limit: 20 }
  ): Promise<{ reports: Report[]; total: number }> {
    const { offset, limit } = pagination;

    // Construire les filtres WHERE
    const where: any = {};

    if (filters.reportedType) {
      where.reportedType = filters.reportedType;
    }

    if (filters.reportType) {
      where.reportType = filters.reportType;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.reporterId) {
      where.reporterId = filters.reporterId;
    }

    if (filters.moderatorId) {
      where.moderatorId = filters.moderatorId;
    }

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) {
        where.createdAt.gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        where.createdAt.lte = filters.createdBefore;
      }
    }

    // Déterminer l'ordre de tri
    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    // Récupérer les données
    const [reports, totalCount] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit
      }),
      this.prisma.report.count({ where })
    ]);

    return {
      reports: reports as Report[],
      total: totalCount
    };
  }

  /**
   * Mettre à jour un signalement (modérateur uniquement)
   */
  async updateReport(
    reportId: string,
    moderatorId: string,
    updates: UpdateReportDTO
  ): Promise<Report> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date()
    };

    // Si le statut passe à resolved ou rejected, ajouter la date de résolution
    if (updates.status === 'resolved' || updates.status === 'rejected') {
      updateData.resolvedAt = new Date();
      updateData.moderatorId = moderatorId;
    }

    // Si un modérateur intervient, l'assigner
    if (!updateData.moderatorId) {
      updateData.moderatorId = moderatorId;
    }

    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: updateData
    });

    return report as Report;
  }

  /**
   * Supprimer un signalement
   */
  async deleteReport(reportId: string): Promise<void> {
    await this.prisma.report.delete({
      where: { id: reportId }
    });
  }

  /**
   * Obtenir les statistiques des signalements
   */
  async getReportStats(): Promise<ReportStats> {
    const [
      totalReports,
      pendingReports,
      underReviewReports,
      resolvedReports,
      rejectedReports,
      dismissedReports,
      reportsByType,
      reportsByReportedType,
      resolvedWithTime
    ] = await Promise.all([
      // Total des signalements
      this.prisma.report.count(),

      // Par statut
      this.prisma.report.count({ where: { status: 'pending' } }),
      this.prisma.report.count({ where: { status: 'under_review' } }),
      this.prisma.report.count({ where: { status: 'resolved' } }),
      this.prisma.report.count({ where: { status: 'rejected' } }),
      this.prisma.report.count({ where: { status: 'dismissed' } }),

      // Par type de signalement
      this.prisma.report.groupBy({
        by: ['reportType'],
        _count: { reportType: true }
      }),

      // Par type d'entité signalée
      this.prisma.report.groupBy({
        by: ['reportedType'],
        _count: { reportedType: true }
      }),

      // Signalements résolus avec temps de résolution
      this.prisma.report.findMany({
        where: {
          status: { in: ['resolved', 'rejected'] },
          resolvedAt: { not: null }
        },
        select: {
          createdAt: true,
          resolvedAt: true
        }
      })
    ]);

    // Calculer le temps moyen de résolution en heures
    let averageResolutionTimeHours = 0;
    if (resolvedWithTime.length > 0) {
      const totalResolutionTimeMs = resolvedWithTime.reduce((sum, report) => {
        if (report.resolvedAt) {
          return sum + (report.resolvedAt.getTime() - report.createdAt.getTime());
        }
        return sum;
      }, 0);
      const averageResolutionTimeMs = totalResolutionTimeMs / resolvedWithTime.length;
      averageResolutionTimeHours = averageResolutionTimeMs / (1000 * 60 * 60); // Convertir en heures
    }

    // Formater les résultats par type
    const reportsByTypeMap: Record<string, number> = {};
    reportsByType.forEach(item => {
      reportsByTypeMap[item.reportType] = item._count.reportType;
    });

    const reportsByReportedTypeMap: Record<string, number> = {};
    reportsByReportedType.forEach(item => {
      reportsByReportedTypeMap[item.reportedType] = item._count.reportedType;
    });

    return {
      totalReports,
      pendingReports,
      underReviewReports,
      resolvedReports,
      rejectedReports,
      dismissedReports,
      reportsByType: reportsByTypeMap,
      reportsByReportedType: reportsByReportedTypeMap,
      averageResolutionTimeHours
    };
  }

  /**
   * Obtenir tous les signalements pour une entité spécifique
   */
  async getReportsForEntity(
    entityType: string,
    entityId: string
  ): Promise<Report[]> {
    const reports = await this.prisma.report.findMany({
      where: {
        reportedType: entityType,
        reportedEntityId: entityId
      },
      orderBy: { createdAt: 'desc' }
    });

    return reports as Report[];
  }

  /**
   * Vérifier si une entité a des signalements en attente
   */
  async hasPendingReports(
    entityType: string,
    entityId: string
  ): Promise<boolean> {
    const count = await this.prisma.report.count({
      where: {
        reportedType: entityType,
        reportedEntityId: entityId,
        status: { in: ['pending', 'under_review'] }
      }
    });

    return count > 0;
  }

  /**
   * Compter le nombre de signalements pour une entité
   */
  async countReportsForEntity(
    entityType: string,
    entityId: string
  ): Promise<number> {
    return await this.prisma.report.count({
      where: {
        reportedType: entityType,
        reportedEntityId: entityId
      }
    });
  }

  /**
   * Obtenir les signalements récents (dernières 24h)
   */
  async getRecentReports(limit: number = 10): Promise<Report[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const reports = await this.prisma.report.findMany({
      where: {
        createdAt: { gte: twentyFourHoursAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return reports as Report[];
  }

  /**
   * Assigner un modérateur à un signalement
   */
  async assignModerator(
    reportId: string,
    moderatorId: string
  ): Promise<Report> {
    const report = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        moderatorId,
        status: 'under_review',
        updatedAt: new Date()
      }
    });

    return report as Report;
  }

  /**
   * Obtenir les signalements assignés à un modérateur
   */
  async getModeratorReports(moderatorId: string): Promise<Report[]> {
    const reports = await this.prisma.report.findMany({
      where: {
        moderatorId,
        status: { in: ['under_review', 'pending'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reports as Report[];
  }
}

// Instance singleton
let reportServiceInstance: ReportService | null = null;

export function getReportService(prisma: PrismaClient): ReportService {
  if (!reportServiceInstance) {
    reportServiceInstance = new ReportService(prisma);
  }
  return reportServiceInstance;
}
