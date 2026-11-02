import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { OPEN_REPORT_STATUSES, priorityFirst } from '../reports/priorityQueue';
import type {
  Report,
  CreateReportDTO,
  UpdateReportDTO,
  ReportFilters,
  ReportStats
} from '@meeshy/shared/types';

/**
 * Service de gestion des signalements
 */
export class ReportService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Créer un signalement — UN seul ouvert par signalant inscrit et par cible
   * (#14627, audit 3 M1).
   *
   * Sans seuil par cible, un même compte remplissait la file d'autant de lignes
   * qu'il répétait le geste ; un compte déclaré mineur les rendait toutes
   * prioritaires et repoussait en page 2 le signalement d'une autre mineure. Le
   * doublon d'une ligne encore à traiter (`pending`, `under_review`) rend donc
   * cette ligne, la plus ancienne, sans rien écrire : le signalant reçoit
   * l'accusé de SON signalement, ce qu'il savait déjà — aucun oracle. Le motif
   * n'entre pas dans la paire : changer de motif ne fait pas un second
   * signalement de la même cible. Une ligne close ne retient pas le suivant.
   *
   * Un signalant anonyme n'est pas dédoublonné : rien ne l'identifie d'un
   * signalement à l'autre, et les seuils par appelant le bornent. Deux requêtes
   * simultanées peuvent encore écrire deux lignes (lecture puis écriture, sans
   * index unique partiel) : la fenêtre est celle d'un aller-retour.
   */
  async createReport(data: CreateReportDTO): Promise<Report> {
    const existing = await this.openReportOf(data);
    if (existing) return existing;

    const report = await this.prisma.report.create({
      data: {
        reportedType: data.reportedType,
        reportedEntityId: data.reportedEntityId,
        reporterId: data.reporterId || null,
        reporterName: data.reporterName || null,
        reportType: data.reportType,
        reason: data.reason || null,
        status: 'pending',
        // #14110 (MIN-04) — calculée par la passerelle, jamais lue du corps.
        priority: data.priority ?? 0,
        priorityReasons: data.priorityReasons ?? []
      }
    });

    return report as Report;
  }

  private async openReportOf(data: CreateReportDTO): Promise<Report | null> {
    if (!data.reporterId) return null;
    const report = await this.prisma.report.findFirst({
      where: {
        reporterId: data.reporterId,
        reportedType: data.reportedType,
        reportedEntityId: data.reportedEntityId,
        status: { in: [...OPEN_REPORT_STATUSES] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return report as Report | null;
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
    } else if (filters.unassigned) {
      where.moderatorId = null;
    }

    if (filters.reportedEntityId) {
      where.reportedEntityId = filters.reportedEntityId;
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

    // #14110 (MIN-04, audit B1 et m4) — la priorité est la PREMIÈRE clé quel que
    // soit le tri demandé ; le tri demandé ordonne les ordinaires.
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    const { rows: reports, total: totalCount } = await priorityFirst<Report>(this.prisma.report, {
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit
    });

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

    // ROUVRIR (retour à `pending`) efface la résolution précédente et laisse
    // le signalement sans modérateur (spec 2026-10-04 § 7) : sinon il
    // réapparaît dans la file « résolu le … par … », action comprise.
    if (updates.status === 'pending') {
      updateData.resolvedAt = null;
      updateData.actionTaken = null;
      updateData.moderatorId = null;
    } else if (!updateData.moderatorId) {
      // Si un modérateur intervient, l'assigner
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
   * Obtenir une PAGE des signalements d'une entité (#4165).
   *
   * Le `findMany` était nu : une entité très signalée — un message viral, un
   * compte harcelé — rendait TOUS ses signalements d'un coup, à chaque
   * ouverture de la fiche de modération. La borne est posée DANS la requête,
   * jamais par un `slice` après coup : trancher en mémoire aurait payé le
   * coût avant de le cacher.
   *
   * `total` reste le VRAI compte (un `count()` séparé), pas la taille de la
   * page — c'est lui que la fiche de modération affiche.
   */
  async getReportsForEntity(
    entityType: string,
    entityId: string,
    offset: number = 0,
    limit: number = 100
  ): Promise<{ reports: Report[]; total: number }> {
    const where = {
      reportedType: entityType,
      reportedEntityId: entityId
    };

    const { rows: reports, total } = await priorityFirst<Report>(this.prisma.report, {
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    });

    return { reports, total };
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

    const { rows } = await priorityFirst<Report>(this.prisma.report, {
      where: { createdAt: { gte: twentyFourHoursAgo } },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return rows;
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
    const { rows } = await priorityFirst<Report>(this.prisma.report, {
      where: { moderatorId, status: { in: ['under_review', 'pending'] } },
      orderBy: { createdAt: 'desc' }
    });

    return rows;
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
