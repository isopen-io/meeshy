import { apiService } from './api.service';
import type { CreateReportDTO, Report } from '@meeshy/shared/types';

/**
 * Service pour gérer les signalements.
 *
 * Adresse `POST /reports` depuis #4155 : signaler est un geste ORDINAIRE (S2).
 * Il vivait sous `/admin/reports`, la seule route d'administration ouverte à un
 * utilisateur ordinaire — une adresse qui mentait sur le privilège, et que
 * n'importe quel durcissement du préfixe `/admin` aurait cassée.
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

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
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

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
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

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
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

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
  }

  /**
   * Signaler un post
   */
  async reportPost(postId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'post',
      reportedEntityId: postId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
  }

  /**
   * Signaler une story
   */
  async reportStory(storyId: string, reportType: string, reason: string): Promise<Report> {
    const reportData: CreateReportDTO = {
      reportedType: 'story',
      reportedEntityId: storyId,
      reportType,
      reason
    };

    const response = await apiService.post<{ success: boolean; data: Report }>('/reports', reportData);

    if (response.data && (response.data as any).success) {
      return (response.data as any).data;
    }

    return response.data?.data as Report;
  }
}

// Instance singleton
export const reportService = new ReportService();
