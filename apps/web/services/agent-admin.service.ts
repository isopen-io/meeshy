import { apiService } from './api.service';
import type { ApiResponse, AgentType } from '@meeshy/shared/types';

function unwrapResponse<T>(response: ApiResponse<unknown>): ApiResponse<T> {
  if (!response.success || !response.data) return response as ApiResponse<T>;
  const raw = response.data as Record<string, unknown>;
  if (typeof raw === 'object' && raw !== null && 'success' in raw && 'data' in raw) {
    return {
      ...response,
      data: raw.data as T,
      pagination: (raw as { pagination?: ApiResponse<T>['pagination'] }).pagination ?? response.pagination,
    };
  }
  return response as ApiResponse<T>;
}

export type RecentActivityEntry = {
  conversationId: string;
  conversation: AgentConfigConversation | null;
  messagesSent: number;
  totalWordsSent: number;
  avgConfidence: number;
  lastResponseAt: string | null;
};

export type AgentStatsData = {
  totalConfigs: number;
  activeConfigs: number;
  totalRoles: number;
  totalArchetypes: number;
  totalControlledUsers: number;
  totalMessagesSent: number;
  totalWordsSent: number;
  avgConfidence: number;
  recentActivity: RecentActivityEntry[];
};

export type AgentConfigConversation = {
  id: string;
  title: string | null;
  type: string;
};

export type AgentConfigData = {
  id: string;
  conversationId: string;
  conversation?: AgentConfigConversation;
  enabled: boolean;
  configuredBy: string;
  controlledUserIds: string[];
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
  agentType: AgentType;
  contextWindowSize: number;
  useFullHistory: boolean;
  scanIntervalMinutes: number;
  minResponsesPerCycle: number;
  maxResponsesPerCycle: number;
  reactionsEnabled: boolean;
  maxReactionsPerCycle: number;
  agentInstructions: string | null;
  webSearchEnabled: boolean;
  minWordsPerMessage: number;
  maxWordsPerMessage: number;
  generationTemperature: number;
  qualityGateEnabled: boolean;
  qualityGateMinScore: number;
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
  burstEnabled: boolean;
  burstSize: number;
  burstIntervalMinutes: number;
  quietIntervalMinutes: number;
  inactivityDaysThreshold: number;
  prioritizeTaggedUsers: boolean;
  prioritizeRepliedUsers: boolean;
  reactionBoostFactor: number;
  analytics: AnalyticsData | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentConfigUpsert = {
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
  agentType?: AgentType;
  contextWindowSize?: number;
  useFullHistory?: boolean;
  scanIntervalMinutes?: number;
  minResponsesPerCycle?: number;
  maxResponsesPerCycle?: number;
  reactionsEnabled?: boolean;
  maxReactionsPerCycle?: number;
  agentInstructions?: string | null;
  webSearchEnabled?: boolean;
  minWordsPerMessage?: number;
  maxWordsPerMessage?: number;
  generationTemperature?: number;
  qualityGateEnabled?: boolean;
  qualityGateMinScore?: number;
  weekdayMaxMessages?: number;
  weekendMaxMessages?: number;
  weekdayMaxUsers?: number;
  weekendMaxUsers?: number;
  burstEnabled?: boolean;
  burstSize?: number;
  burstIntervalMinutes?: number;
  quietIntervalMinutes?: number;
  inactivityDaysThreshold?: number;
  prioritizeTaggedUsers?: boolean;
  prioritizeRepliedUsers?: boolean;
  reactionBoostFactor?: number;
};

export type AgentGlobalConfigData = {
  id: string;
  systemPrompt: string;
  enabled: boolean;
  defaultProvider: string;
  defaultModel: string;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  globalDailyBudgetUsd: number;
  maxConcurrentCalls: number;
  eligibleConversationTypes: string[];
  messageFreshnessHours: number;
  maxConversationsPerCycle: number;
  updatedAt: string;
};

export type AgentGlobalConfigUpsert = {
  systemPrompt?: string;
  enabled?: boolean;
  defaultProvider?: string;
  defaultModel?: string;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  globalDailyBudgetUsd?: number;
  maxConcurrentCalls?: number;
  eligibleConversationTypes?: string[];
  messageFreshnessHours?: number;
  maxConversationsPerCycle?: number;
};

export type AgentRoleData = {
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
  relationshipMap: Record<string, unknown>;
  overrideTone: string | null;
  overrideVocabularyLevel: string | null;
  overrideTypicalLength: string | null;
  overrideEmojiUsage: string | null;
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArchetypeData = {
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
};

export type LlmConfigData = {
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
};

export type LlmConfigUpdate = {
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
};

export type AgentSummaryData = {
  id: string;
  conversationId: string;
  summary: string;
  currentTopics: string[];
  overallTone: string;
  messageCount: number;
  updatedAt: string;
};

export type ToneProfileEntry = {
  userId: string;
  displayName: string;
  tone: string;
  vocabularyLevel: string;
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
};

export type ControlledUserEntry = {
  userId: string;
  displayName: string;
  systemLanguage: string;
  confidence: number;
  locked: boolean;
};

export type AnalyticsData = {
  messagesSent: number;
  totalWordsSent: number;
  avgConfidence: number;
  lastResponseAt: string | null;
};

export type SummaryRecordData = {
  summary: string;
  currentTopics: string[];
  overallTone: string;
  messageCount: number;
};

export type LiveStateData = {
  conversationId: string;
  summary: string;
  toneProfiles: Record<string, ToneProfileEntry>;
  cachedMessageCount: number;
  analytics: AnalyticsData | null;
  summaryRecord: SummaryRecordData | null;
  controlledUsers: ControlledUserEntry[];
};

export type RecentConversationActivity = {
  conversationId: string;
  conversation: AgentConfigConversation | null;
  enabled: boolean;
  messagesSent: number;
  totalWordsSent: number;
  avgConfidence: number;
  lastResponseAt: string | null;
  controlledUserIds: string[];
  controlledUsersCount: number;
};

export type ScheduleBudget = {
  messagesUsed: number;
  messagesMax: number;
  remaining: number;
  isWeekend: boolean;
};

export type ScheduleBurst = {
  enabled: boolean;
  lastBurst: number;
  cooldownEndsAt: number;
  cooldownActive: boolean;
  quietIntervalMinutes: number;
};

export type AgentScheduleData = {
  conversationId: string;
  scanIntervalMinutes: number;
  lastScan: number;
  nextScan: number;
  upcomingScans: number[];
  budget: ScheduleBudget;
  burst: ScheduleBurst;
};

export type TriggerResult = {
  conversationId: string;
  triggered: boolean;
  triggeredAt: number;
};

export type ScanLogSummary = {
  id: string;
  conversationId: string;
  trigger: string;
  startedAt: string;
  durationMs: number;
  outcome: string;
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  conversation: AgentConfigConversation | null;
};

export type ScanLogNodeResult = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  costUsd: number;
  extra: Record<string, unknown>;
};

export type ScanLogDetail = ScanLogSummary & {
  triggeredBy: string | null;
  completedAt: string;
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: { messagesUsed: number; messagesMax: number; usersActive: number; maxUsers: number } | null;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown> | null;
  nodeResults: Record<string, ScanLogNodeResult> | null;
  configChangedAt: string | null;
};

export type ScanStatsBucket = {
  date: string;
  scans: number;
  conversations: number;
  users: number;
  messagesSent: number;
  reactionsSent: number;
  costUsd: number;
  configChanges: number;
  outcomes: Record<string, number>;
};

export type ScanStatsData = {
  buckets: ScanStatsBucket[];
  totalLogs: number;
  since: string;
};

export type ScanLogsFilters = {
  page?: number;
  limit?: number;
  conversationId?: string;
  trigger?: string;
  outcome?: string;
  from?: string;
  to?: string;
};

export type ResetDeletedCounts = {
  configs?: number;
  roles?: number;
  summaries?: number;
  analytics?: number;
  globalProfiles?: number;
  redisKeys?: number;
  redisProfilesCleaned?: number;
  cooldownsCleared?: number;
};

export type ResetResult = {
  conversationId?: string;
  userId?: string;
  deleted: ResetDeletedCounts;
};

export const agentAdminService = {
  async getStats(): Promise<ApiResponse<AgentStatsData>> {
    const response = await apiService.get('/admin/agent/stats');
    return unwrapResponse<AgentStatsData>(response);
  },

  async getConfigs(page = 1, limit = 20, search?: string): Promise<ApiResponse<AgentConfigData[]>> {
    const response = await apiService.get('/admin/agent/configs', { page, limit, search });
    return unwrapResponse<AgentConfigData[]>(response);
  },

  async getConfig(conversationId: string): Promise<ApiResponse<AgentConfigData>> {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}`);
    return unwrapResponse<AgentConfigData>(response);
  },

  async upsertConfig(conversationId: string, data: AgentConfigUpsert): Promise<ApiResponse<AgentConfigData>> {
    const response = await apiService.put(`/admin/agent/configs/${conversationId}`, data);
    return unwrapResponse<AgentConfigData>(response);
  },

  async deleteConfig(conversationId: string): Promise<ApiResponse<void>> {
    const response = await apiService.delete(`/admin/agent/configs/${conversationId}`);
    return unwrapResponse<void>(response);
  },

  async getRoles(conversationId: string): Promise<ApiResponse<AgentRoleData[]>> {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}/roles`);
    return unwrapResponse<AgentRoleData[]>(response);
  },

  async assignArchetype(conversationId: string, userId: string, archetypeId: string): Promise<ApiResponse<AgentRoleData>> {
    const response = await apiService.post(`/admin/agent/roles/${conversationId}/${userId}/assign`, { archetypeId });
    return unwrapResponse<AgentRoleData>(response);
  },

  async unlockRole(conversationId: string, userId: string): Promise<ApiResponse<AgentRoleData>> {
    const response = await apiService.post(`/admin/agent/roles/${conversationId}/${userId}/unlock`, {});
    return unwrapResponse<AgentRoleData>(response);
  },

  async getArchetypes(): Promise<ApiResponse<ArchetypeData[]>> {
    const response = await apiService.get('/admin/agent/archetypes');
    return unwrapResponse<ArchetypeData[]>(response);
  },

  async getLlmConfig(): Promise<ApiResponse<LlmConfigData | null>> {
    const response = await apiService.get('/admin/agent/llm');
    return unwrapResponse<LlmConfigData | null>(response);
  },

  async updateLlmConfig(data: LlmConfigUpdate): Promise<ApiResponse<LlmConfigData>> {
    const response = await apiService.put('/admin/agent/llm', data);
    return unwrapResponse<LlmConfigData>(response);
  },

  async getConversationSummary(conversationId: string): Promise<ApiResponse<AgentSummaryData>> {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}/summary`);
    return unwrapResponse<AgentSummaryData>(response);
  },

  async getGlobalConfig(): Promise<ApiResponse<AgentGlobalConfigData>> {
    const response = await apiService.get('/admin/agent/global-config');
    return unwrapResponse<AgentGlobalConfigData>(response);
  },

  async updateGlobalConfig(data: AgentGlobalConfigUpsert): Promise<ApiResponse<AgentGlobalConfigData>> {
    const response = await apiService.put('/admin/agent/global-config', data);
    return unwrapResponse<AgentGlobalConfigData>(response);
  },

  async getRecentActivity(limit = 20, search?: string): Promise<ApiResponse<RecentConversationActivity[]>> {
    const response = await apiService.get('/admin/agent/recent-activity', { limit, search });
    return unwrapResponse<RecentConversationActivity[]>(response);
  },

  async getLiveState(conversationId: string): Promise<ApiResponse<LiveStateData>> {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}/live`);
    return unwrapResponse<LiveStateData>(response);
  },

  async getSchedule(conversationId: string): Promise<ApiResponse<AgentScheduleData>> {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}/schedule`);
    return unwrapResponse<AgentScheduleData>(response);
  },

  async triggerScan(conversationId: string): Promise<ApiResponse<TriggerResult>> {
    const response = await apiService.post(`/admin/agent/configs/${conversationId}/trigger`, {});
    return unwrapResponse<TriggerResult>(response);
  },

  async getScanLogs(filters: ScanLogsFilters = {}): Promise<ApiResponse<ScanLogSummary[]>> {
    const response = await apiService.get('/admin/agent/scan-logs', filters);
    return unwrapResponse<ScanLogSummary[]>(response);
  },

  async getScanLogDetail(logId: string): Promise<ApiResponse<ScanLogDetail>> {
    const response = await apiService.get(`/admin/agent/scan-logs/${logId}`);
    return unwrapResponse<ScanLogDetail>(response);
  },

  async getScanStats(params: { conversationId?: string; months?: number; bucket?: 'day' | 'week' } = {}): Promise<ApiResponse<ScanStatsData>> {
    const response = await apiService.get('/admin/agent/scan-logs/stats', params);
    return unwrapResponse<ScanStatsData>(response);
  },

  async resetAll(): Promise<ApiResponse<ResetResult>> {
    const response = await apiService.delete('/admin/agent/reset');
    return unwrapResponse<ResetResult>(response);
  },

  async resetConversation(conversationId: string): Promise<ApiResponse<ResetResult>> {
    const response = await apiService.delete(`/admin/agent/reset/conversation/${conversationId}`);
    return unwrapResponse<ResetResult>(response);
  },

  async resetUser(userId: string): Promise<ApiResponse<ResetResult>> {
    const response = await apiService.delete(`/admin/agent/reset/user/${userId}`);
    return unwrapResponse<ResetResult>(response);
  },
};
