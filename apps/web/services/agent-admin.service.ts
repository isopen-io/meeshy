import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';

export interface AgentStatsData {
  totalConfigs: number;
  activeConfigs: number;
  totalRoles: number;
  totalArchetypes: number;
}

export interface AgentConfigData {
  id: string;
  conversationId: string;
  enabled: boolean;
  configuredBy: string;
  manualUserIds: string[];
  autoPickupEnabled: boolean;
  inactivityThresholdHours: number;
  minHistoricalMessages: number;
  maxControlledUsers: number;
  excludedRoles: string[];
  excludedUserIds: string[];
  triggerOnTimeout: boolean;
  timeoutSeconds: number;
  triggerOnUserMessage: boolean;
  triggerFromUserIds: string[];
  triggerOnReplyTo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfigUpsert {
  enabled?: boolean;
  autoPickupEnabled?: boolean;
  inactivityThresholdHours?: number;
  minHistoricalMessages?: number;
  maxControlledUsers?: number;
  manualUserIds?: string[];
  excludedRoles?: string[];
  excludedUserIds?: string[];
  triggerOnTimeout?: boolean;
  timeoutSeconds?: number;
  triggerOnUserMessage?: boolean;
  triggerFromUserIds?: string[];
  triggerOnReplyTo?: boolean;
}

export interface AgentRoleData {
  id: string;
  userId: string;
  conversationId: string;
  origin: string;
  archetypeId: string | null;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  catchphrases: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArchetypeData {
  id: string;
  name: string;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  catchphrases: string[];
  confidence: number;
}

export interface LlmConfigData {
  id: string;
  provider: string;
  model: string;
  hasApiKey: boolean;
  baseUrl: string | null;
  maxTokens: number;
  temperature: number;
  dailyBudgetUsd: number;
  maxCostPerCall: number;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  hasFallbackApiKey: boolean;
  configuredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LlmConfigUpdate {
  provider?: string;
  model?: string;
  apiKeyEncrypted?: string;
  baseUrl?: string | null;
  maxTokens?: number;
  temperature?: number;
  dailyBudgetUsd?: number;
  maxCostPerCall?: number;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  fallbackApiKeyEncrypted?: string | null;
}

export interface AgentSummaryData {
  id: string;
  conversationId: string;
  summary: string;
  topics: string[];
  overallTone: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; hasMore: boolean };
}

export const agentAdminService = {
  async getStats(): Promise<ApiResponse<AgentStatsData>> {
    return apiService.get<AgentStatsData>('/admin/agent/stats');
  },

  async getConfigs(page = 1, limit = 20): Promise<ApiResponse<PaginatedResponse<AgentConfigData>>> {
    return apiService.get<PaginatedResponse<AgentConfigData>>('/admin/agent/configs', { page, limit });
  },

  async getConfig(conversationId: string): Promise<ApiResponse<AgentConfigData>> {
    return apiService.get<AgentConfigData>(`/admin/agent/configs/${conversationId}`);
  },

  async upsertConfig(conversationId: string, data: AgentConfigUpsert): Promise<ApiResponse<AgentConfigData>> {
    return apiService.put<AgentConfigData>(`/admin/agent/configs/${conversationId}`, data);
  },

  async deleteConfig(conversationId: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/admin/agent/configs/${conversationId}`);
  },

  async getRoles(conversationId: string): Promise<ApiResponse<AgentRoleData[]>> {
    return apiService.get<AgentRoleData[]>(`/admin/agent/configs/${conversationId}/roles`);
  },

  async assignArchetype(conversationId: string, userId: string, archetypeId: string): Promise<ApiResponse<AgentRoleData>> {
    return apiService.post<AgentRoleData>(`/admin/agent/roles/${conversationId}/${userId}/assign`, { archetypeId });
  },

  async unlockRole(conversationId: string, userId: string): Promise<ApiResponse<AgentRoleData>> {
    return apiService.post<AgentRoleData>(`/admin/agent/roles/${conversationId}/${userId}/unlock`, {});
  },

  async getArchetypes(): Promise<ApiResponse<ArchetypeData[]>> {
    return apiService.get<ArchetypeData[]>('/admin/agent/archetypes');
  },

  async getLlmConfig(): Promise<ApiResponse<LlmConfigData | null>> {
    return apiService.get<LlmConfigData | null>('/admin/agent/llm');
  },

  async updateLlmConfig(data: LlmConfigUpdate): Promise<ApiResponse<LlmConfigData>> {
    return apiService.put<LlmConfigData>('/admin/agent/llm', data);
  },

  async getConversationSummary(conversationId: string): Promise<ApiResponse<AgentSummaryData>> {
    return apiService.get<AgentSummaryData>(`/admin/agent/configs/${conversationId}/summary`);
  },
};
