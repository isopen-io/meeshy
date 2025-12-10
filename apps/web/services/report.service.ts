import { apiService } from './api.service';
import type { CreateReportDTO, Report } from '@meeshy/shared/types';

/**
 * Service pour gérer les signalements
 */
class ReportService {
  /**
   * Signaler un message
   */
  async reportMessage(messageId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'message',
      reportedEntityId: messageId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/admin/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data as Report;
  }

  /**
   * Signaler un utilisateur
   */
  async reportUser(userId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'user',
      reportedEntityId: userId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/admin/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data as Report;
  }

  /**
   * Signaler une conversation
   */
  async reportConversation(conversationId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'conversation',
      reportedEntityId: conversationId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/admin/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data as Report;
  }

  /**
   * Signaler une communauté
   */
  async reportCommunity(communityId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'community',
      reportedEntityId: communityId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/admin/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data as Report;
  }
}

// Instance singleton
export const reportService = new ReportService();
