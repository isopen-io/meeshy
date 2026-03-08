import type Redis from 'ioredis';
import type { MongoPersistence } from '../memory/mongo-persistence';
import type { RedisStateManager } from '../memory/redis-state';
import type { DeliveryQueue } from '../delivery/delivery-queue';
import type { ConfigCache } from '../config/config-cache';
import type { DailyBudgetManager } from './daily-budget';
import type { PendingMessage } from '../graph/state';
import { findEligibleConversations, type EligibleConversation } from './eligible-conversations';
import { detectActivity } from './activity-detector';

type CompiledGraph = {
  invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export class ConversationScanner {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private defaultIntervalMs = 60 * 1000;

  constructor(
    private graph: CompiledGraph,
    private persistence: MongoPersistence,
    private stateManager: RedisStateManager,
    private deliveryQueue: DeliveryQueue,
    private redis: Redis,
    private configCache: ConfigCache,
    private budgetManager: DailyBudgetManager,
  ) {}

  start(intervalMs?: number): void {
    const interval = intervalMs ?? this.defaultIntervalMs;
    console.log(`[Scanner] Starting with interval ${interval / 1000}s`);

    this.scanAll().catch((err) => console.error('[Scanner] Initial scan error:', err));

    this.intervalHandle = setInterval(() => {
      this.scanAll().catch((err) => console.error('[Scanner] Scan cycle error:', err));
    }, interval);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('[Scanner] Stopped');
  }

  async scanConversation(conversationId: string): Promise<void> {
    const config = await this.persistence.getAgentConfig(conversationId);
    if (!config) return;
    const context = await this.persistence.getConversationContext(conversationId);
    const conv: EligibleConversation = {
      conversationId,
      conversationType: 'group',
      title: context?.title ?? null,
      description: context?.description ?? null,
      lastMessageAt: new Date(),
      memberCount: 0,
      scanIntervalMinutes: config.scanIntervalMinutes,
      minResponsesPerCycle: config.minResponsesPerCycle,
      maxResponsesPerCycle: config.maxResponsesPerCycle,
      reactionsEnabled: config.reactionsEnabled,
      maxReactionsPerCycle: config.maxReactionsPerCycle,
      contextWindowSize: config.contextWindowSize,
      useFullHistory: config.useFullHistory,
      agentType: config.agentType,
      inactivityThresholdHours: config.inactivityThresholdHours,
      excludedRoles: config.excludedRoles,
      excludedUserIds: config.excludedUserIds,
      agentInstructions: config.agentInstructions ?? null,
      webSearchEnabled: config.webSearchEnabled,
      minWordsPerMessage: config.minWordsPerMessage,
      maxWordsPerMessage: config.maxWordsPerMessage,
      generationTemperature: config.generationTemperature,
      qualityGateEnabled: config.qualityGateEnabled,
      qualityGateMinScore: config.qualityGateMinScore,
      weekdayMaxMessages: config.weekdayMaxMessages,
      weekendMaxMessages: config.weekendMaxMessages,
      weekdayMaxUsers: config.weekdayMaxUsers,
      weekendMaxUsers: config.weekendMaxUsers,
      burstEnabled: config.burstEnabled,
      burstSize: config.burstSize,
      burstIntervalMinutes: config.burstIntervalMinutes,
      quietIntervalMinutes: config.quietIntervalMinutes,
      inactivityDaysThreshold: config.inactivityDaysThreshold,
      prioritizeTaggedUsers: config.prioritizeTaggedUsers,
      prioritizeRepliedUsers: config.prioritizeRepliedUsers,
      reactionBoostFactor: config.reactionBoostFactor,
    };
    await this.processConversation(conv);
  }

  private async scanAll(): Promise<void> {
    const lockKey = 'agent:scanning:lock';
    const acquired = await this.redis.set(lockKey, '1', 'EX', 300, 'NX');
    if (!acquired) {
      console.log('[Scanner] Another scan in progress, skipping');
      return;
    }

    try {
      this.scanning = true;
      const globalConfig = await this.configCache.getGlobalConfig();
      const scanOptions = {
        eligibleTypes: globalConfig?.eligibleConversationTypes ?? ['group', 'channel', 'public', 'global'],
        freshnessHours: globalConfig?.messageFreshnessHours ?? 22,
        maxConversations: globalConfig?.maxConversationsPerCycle ?? 0,
      };
      const eligible = await findEligibleConversations(this.persistence, scanOptions);
      console.log(`[Scanner] Found ${eligible.length} eligible conversations`);

      for (const conv of eligible) {
        try {
          const lastScanKey = `agent:last-scan:${conv.conversationId}`;
          const lastScan = parseInt(await this.redis.get(lastScanKey) || '0', 10);
          if (Date.now() - lastScan < conv.scanIntervalMinutes * 60_000) continue;

          await this.processConversation(conv);
          await this.redis.set(lastScanKey, String(Date.now()), 'EX', 86400);
        } catch (error) {
          console.error(`[Scanner] Error processing conv=${conv.conversationId}:`, error);
        }
      }
    } finally {
      this.scanning = false;
      await this.redis.del(lockKey);
    }
  }

  private async processConversation(conv: EligibleConversation): Promise<void> {
    const { conversationId } = conv;
    const activity = await detectActivity(this.persistence, conversationId);

    if (activity.shouldSkip) {
      console.log(`[Scanner] Skipping conv=${conversationId}: ${activity.reason}`);
      return;
    }

    const [messages, summary, toneProfiles, controlledUsers, agentHistory, todayActiveUserIds] = await Promise.all([
      this.stateManager.getMessages(conversationId),
      this.stateManager.getSummary(conversationId),
      this.stateManager.getToneProfiles(conversationId),
      this.persistence.getControlledUsers(conversationId),
      this.stateManager.getAgentHistory(conversationId),
      this.stateManager.getTodayActiveUserIds(conversationId),
    ]);

    if (controlledUsers.length === 0) {
      console.log(`[Scanner] Skipping conv=${conversationId}: no controlled users`);
      return;
    }

    let effectiveMessages = messages;
    if (effectiveMessages.length === 0) {
      const dbMessages = await this.persistence.getRecentMessages(conversationId, 50);
      effectiveMessages = dbMessages.reverse()
        .filter((m) => m.senderId !== null)
        .map((m) => ({
          id: m.id,
          senderId: m.senderId!,
          senderName: m.sender?.displayName ?? m.sender?.username ?? m.senderId!,
          senderUsername: m.sender?.username ?? m.senderId!,
          content: m.content ?? '',
          timestamp: m.createdAt.getTime(),
          replyToId: m.replyToId ?? undefined,
          originalLanguage: m.originalLanguage ?? undefined,
        }));

      if (effectiveMessages.length > 0) {
        await this.stateManager.setMessages(conversationId, effectiveMessages);
      }
    }

    if (effectiveMessages.length === 0) {
      console.log(`[Scanner] Skipping conv=${conversationId}: no messages`);
      return;
    }

    const budgetCheck = await this.budgetManager.canSendMessage(conversationId, {
      weekdayMaxMessages: conv.weekdayMaxMessages,
      weekendMaxMessages: conv.weekendMaxMessages,
    });
    if (!budgetCheck.allowed) {
      console.log(`[Scanner] Budget exhausted for conv=${conversationId}: ${budgetCheck.current}/${budgetCheck.max}`);
      return;
    }

    if (conv.burstEnabled) {
      const burstCheck = await this.budgetManager.canBurst(conversationId, {
        quietIntervalMinutes: conv.quietIntervalMinutes,
      });
      if (!burstCheck.allowed) {
        console.log(`[Scanner] Burst cooldown for conv=${conversationId}: ${burstCheck.minutesUntilNext}min remaining`);
        return;
      }
    }

    const todayStats = await this.budgetManager.getTodayStats(conversationId);
    const day = new Date().getUTCDay();
    const maxUsersToday = day === 0 || day === 6 ? conv.weekendMaxUsers : conv.weekdayMaxUsers;

    console.log(`[Scanner] Processing conv=${conversationId} activity=${activity.activityScore.toFixed(2)} msgs=${effectiveMessages.length} users=${controlledUsers.length}`);

    const result = await this.graph.invoke({
      conversationId,
      messages: effectiveMessages,
      summary,
      toneProfiles,
      controlledUsers,
      triggerContext: { type: 'scan' },
      pendingActions: [],
      interventionPlan: null,
      activityScore: activity.activityScore,
      contextWindowSize: conv.contextWindowSize,
      agentType: conv.agentType,
      useFullHistory: conv.useFullHistory,
      conversationTitle: conv.title ?? '',
      conversationDescription: conv.description ?? '',
      agentInstructions: conv.agentInstructions ?? '',
      webSearchEnabled: conv.webSearchEnabled,
      minWordsPerMessage: conv.minWordsPerMessage,
      maxWordsPerMessage: conv.maxWordsPerMessage,
      generationTemperature: conv.generationTemperature,
      qualityGateEnabled: conv.qualityGateEnabled,
      qualityGateMinScore: conv.qualityGateMinScore,
      minResponsesPerCycle: conv.minResponsesPerCycle,
      maxResponsesPerCycle: conv.maxResponsesPerCycle,
      reactionsEnabled: conv.reactionsEnabled,
      maxReactionsPerCycle: conv.maxReactionsPerCycle,
      budgetRemaining: budgetCheck.remaining,
      todayUsersActive: todayStats.usersActive,
      maxUsersToday,
      burstMode: conv.burstEnabled,
      burstSize: conv.burstSize,
      prioritizeTaggedUsers: conv.prioritizeTaggedUsers,
      prioritizeRepliedUsers: conv.prioritizeRepliedUsers,
      reactionBoostFactor: conv.reactionBoostFactor,
      agentHistory,
      todayActiveUserIds,
    });

    if (result.summary) await this.stateManager.setSummary(conversationId, result.summary as string);
    if (result.toneProfiles) await this.stateManager.setToneProfiles(conversationId, result.toneProfiles as Record<string, any>);

    const updatedHistory = result.agentHistory as Array<{ userId: string; topic: string; contentHash: string; timestamp: number }> | undefined;
    if (updatedHistory && updatedHistory.length > 0) {
      const merged = [...agentHistory, ...updatedHistory].slice(-100);
      await this.stateManager.setAgentHistory(conversationId, merged);
    }

    const pendingActions = (result.pendingActions ?? []) as Array<{ type: string; content?: string }>;
    if (pendingActions.length > 0) {
      this.deliveryQueue.enqueue(conversationId, pendingActions as any);
      console.log(`[Scanner] Enqueued ${pendingActions.length} actions for conv=${conversationId}`);

      const messageActions = pendingActions.filter((a): a is PendingMessage => a.type === 'message');

      for (const msg of messageActions) {
        this.budgetManager.recordMessage(conversationId, msg.asUserId).catch((err) =>
          console.error(`[Scanner] Budget record error:`, err));
      }
      if (conv.burstEnabled && messageActions.length > 0) {
        this.budgetManager.recordBurst(conversationId).catch((err) =>
          console.error(`[Scanner] Burst record error:`, err));
      }
      if (messageActions.length > 0) {
        const wordsSent = messageActions.reduce((sum, m) => sum + (m.content?.split(/\s+/).length ?? 0), 0);
        const controlledUsersList = (result.controlledUsers ?? []) as Array<{ role: { confidence: number } }>;
        const avgConfidence = controlledUsersList.length > 0
          ? controlledUsersList.reduce((sum, u) => sum + u.role.confidence, 0) / controlledUsersList.length
          : 0;

        this.persistence.updateAnalytics(conversationId, {
          messagesSent: messageActions.length,
          wordsSent,
          avgConfidence,
        }).catch((err) => console.error(`[Scanner] Analytics upsert error for conv=${conversationId}:`, err));
      }
    }
  }
}
