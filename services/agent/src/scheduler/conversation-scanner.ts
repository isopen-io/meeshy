import type Redis from 'ioredis';
import type { MongoPersistence } from '../memory/mongo-persistence';
import type { RedisStateManager } from '../memory/redis-state';
import type { DeliveryQueue } from '../delivery/delivery-queue';
import type { ConfigCache } from '../config/config-cache';
import type { DailyBudgetManager } from './daily-budget';
import type { PendingMessage, ToneProfile } from '../graph/state';
import { findEligibleConversations, type EligibleConversation } from './eligible-conversations';
import { detectActivity } from './activity-detector';
import { toneProfileToGlobalFields } from '../memory/profile-merger';
import { ScanTracer } from '../tracing/scan-tracer';
import type { TracerRef } from '../graph/graph';

type CompiledGraph = {
  invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

function extractRecentTopicCategories(
  history: Array<{ topic: string; timestamp: number }>,
): string[] {
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const recentTopics = history
    .filter((h) => h.timestamp > sixHoursAgo)
    .map((h) => h.topic.toLowerCase().trim());

  const seen = new Set<string>();
  for (const topic of recentTopics) {
    if (topic.length > 3) seen.add(topic);
  }
  return [...seen];
}

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
    private tracerRef: TracerRef = { current: null },
  ) {}

  private triggerSubscriber: Redis | null = null;

  start(intervalMs?: number): void {
    const baseInterval = intervalMs ?? this.defaultIntervalMs;
    console.log(`[Scanner] Starting with base interval ${baseInterval / 1000}s`);

    const initialDelay = Math.round(3000 + Math.random() * 5000);
    setTimeout(() => {
      this.scanAll().catch((err) => console.error('[Scanner] Initial scan error:', err));
    }, initialDelay);

    this.intervalHandle = setInterval(() => {
      const jitter = Math.round(baseInterval * (Math.random() * 0.2 - 0.1));
      setTimeout(() => {
        this.scanAll().catch((err) => console.error('[Scanner] Scan cycle error:', err));
      }, jitter);
    }, baseInterval);

    this.startTriggerSubscriber();
  }

  private startTriggerSubscriber(): void {
    this.triggerSubscriber = this.redis.duplicate();
    this.triggerSubscriber.subscribe('agent:trigger-scan').catch((err) =>
      console.error('[Scanner] Failed to subscribe to agent:trigger-scan:', err),
    );
    this.triggerSubscriber.on('message', (channel, message) => {
      if (channel !== 'agent:trigger-scan') return;
      try {
        const { conversationId } = JSON.parse(message) as { conversationId: string };
        if (!conversationId) return;
        console.log(`[Scanner] Manual trigger received for conv=${conversationId}`);
        this.scanConversation(conversationId).catch((err) =>
          console.error(`[Scanner] Manual scan error for conv=${conversationId}:`, err),
        );
      } catch (err) {
        console.error('[Scanner] Error parsing trigger message:', err);
      }
    });
    console.log('[Scanner] Trigger subscriber started on channel agent:trigger-scan');
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.triggerSubscriber) {
      this.triggerSubscriber.unsubscribe('agent:trigger-scan').catch(() => {});
      this.triggerSubscriber.disconnect();
      this.triggerSubscriber = null;
    }
    console.log('[Scanner] Stopped');
  }

  async scanConversation(conversationId: string): Promise<void> {
    const config = await this.configCache.getConfig(conversationId);
    if (config?.enabled === false) return;
    const conversation = await this.persistence.getConversationWithType(conversationId);
    const conv: EligibleConversation = {
      conversationId,
      conversationType: conversation?.type ?? 'group',
      title: conversation?.title ?? null,
      description: conversation?.description ?? null,
      lastMessageAt: new Date(),
      memberCount: 0,
      scanIntervalMinutes: config?.scanIntervalMinutes ?? 3,
      minResponsesPerCycle: config?.minResponsesPerCycle ?? 2,
      maxResponsesPerCycle: config?.maxResponsesPerCycle ?? 12,
      reactionsEnabled: config?.reactionsEnabled ?? true,
      maxReactionsPerCycle: config?.maxReactionsPerCycle ?? 8,
      contextWindowSize: config?.contextWindowSize ?? 50,
      useFullHistory: config?.useFullHistory ?? false,
      agentType: config?.agentType ?? 'personal',
      inactivityThresholdHours: config?.inactivityThresholdHours ?? 72,
      excludedRoles: config?.excludedRoles ?? [],
      excludedUserIds: config?.excludedUserIds ?? [],
      agentInstructions: config?.agentInstructions ?? null,
      webSearchEnabled: config?.webSearchEnabled ?? false,
      minWordsPerMessage: config?.minWordsPerMessage ?? 3,
      maxWordsPerMessage: config?.maxWordsPerMessage ?? 400,
      generationTemperature: config?.generationTemperature ?? 0.8,
      qualityGateEnabled: config?.qualityGateEnabled ?? true,
      qualityGateMinScore: config?.qualityGateMinScore ?? 0.5,
      weekdayMaxMessages: config?.weekdayMaxMessages ?? 10,
      weekendMaxMessages: config?.weekendMaxMessages ?? 25,
      weekdayMaxUsers: config?.weekdayMaxUsers ?? 4,
      weekendMaxUsers: config?.weekendMaxUsers ?? 6,
      burstEnabled: config?.burstEnabled ?? true,
      burstSize: config?.burstSize ?? 4,
      burstIntervalMinutes: config?.burstIntervalMinutes ?? 5,
      quietIntervalMinutes: config?.quietIntervalMinutes ?? 90,
      inactivityDaysThreshold: config?.inactivityDaysThreshold ?? 3,
      prioritizeTaggedUsers: config?.prioritizeTaggedUsers ?? true,
      prioritizeRepliedUsers: config?.prioritizeRepliedUsers ?? true,
      reactionBoostFactor: config?.reactionBoostFactor ?? 1.5,
    };
    await this.processConversation(conv, 'manual');
    await this.redis.set(`agent:last-scan:${conversationId}`, String(Date.now()), 'EX', 86400);
  }

  private async scanAll(): Promise<void> {
    const lockKey = 'agent:scanning:lock';
    const lockTtl = 120;
    const acquired = await this.redis.set(lockKey, '1', 'EX', lockTtl, 'NX');
    if (!acquired) {
      console.log('[Scanner] Another scan in progress, skipping');
      return;
    }

    const heartbeat = setInterval(async () => {
      try {
        const renewed = await this.redis.expire(lockKey, lockTtl);
        if (renewed === 0) {
          console.error('[Scanner] Lock lost during scan — another scanner may start');
          this.scanning = false;
        }
      } catch (err) {
        console.error('[Scanner] Heartbeat renewal failed:', err);
      }
    }, Math.round(lockTtl * 0.3) * 1000);

    try {
      this.scanning = true;

      const evicted = await this.persistence.evictRecentlyActiveUsers();
      if (evicted > 0) {
        console.log(`[Scanner] Evicted ${evicted} recently active users from agent control`);
      }

      const globalConfig = await this.configCache.getGlobalConfig();
      const scanOptions = {
        eligibleTypes: globalConfig?.eligibleConversationTypes ?? ['group', 'channel', 'public', 'global'],
        freshnessHours: globalConfig?.messageFreshnessHours ?? 24,
        maxConversations: globalConfig?.maxConversationsPerCycle ?? 0,
      };
      const eligible = await findEligibleConversations(this.persistence, scanOptions);
      console.log(`[Scanner] Found ${eligible.length} eligible conversations`);

      for (const conv of eligible) {
        try {
          const lastScanKey = `agent:last-scan:${conv.conversationId}`;
          const lastScan = parseInt(await this.redis.get(lastScanKey) || '0', 10);
          if (Date.now() - lastScan < conv.scanIntervalMinutes * 60_000) continue;

          const globalBudgetCheck = await this.budgetManager.canScanConversation({
            weekdayMaxConversations: globalConfig?.weekdayMaxConversations ?? 50,
            weekendMaxConversations: globalConfig?.weekendMaxConversations ?? 100,
          });

          if (!globalBudgetCheck.allowed) {
            console.log(`[Scanner] Global scan budget exhausted: ${globalBudgetCheck.current}/${globalBudgetCheck.max}`);
            break;
          }

          const processed = await this.processConversation(conv);
          if (processed) {
            await this.budgetManager.recordScannedConversation();
          }
          await this.redis.set(lastScanKey, String(Date.now()), 'EX', 86400);
        } catch (error) {
          console.error(`[Scanner] Error processing conv=${conv.conversationId}:`, error);
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.scanning = false;
      await this.redis.del(lockKey);
    }
  }

  private async processConversation(conv: EligibleConversation, trigger: 'auto' | 'manual' = 'auto'): Promise<boolean> {
    const { conversationId } = conv;
    const tracer = new ScanTracer(conversationId, trigger);
    this.tracerRef.current = tracer;

    const activity = await detectActivity(this.persistence, conversationId);

    if (activity.shouldSkip) {
      console.log(`[Scanner] Skipping conv=${conversationId}: ${activity.reason}`);
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }

    const [messages, summary, toneProfiles, manualControlledUsers, agentHistory, todayActiveUserIds, lastAgentUserId, engagementData] = await Promise.all([
      this.stateManager.getMessages(conversationId),
      this.stateManager.getSummary(conversationId),
      this.stateManager.getToneProfiles(conversationId),
      this.persistence.getControlledUsers(conversationId),
      this.stateManager.getAgentHistory(conversationId),
      this.stateManager.getTodayActiveUserIds(conversationId),
      this.stateManager.getLastAgentUserId(conversationId),
      this.persistence.getAgentMessageEngagement(conversationId, 48).catch((err) => {
        console.warn(`[Scanner] Failed to fetch engagement data for conv=${conversationId}:`, err instanceof Error ? err.message : 'unknown');
        return [];
      }),
    ]);

    let controlledUsers = manualControlledUsers.map((u) => {
      const cachedProfile = toneProfiles[u.userId];
      if (!cachedProfile) return u;
      return {
        ...u,
        role: {
          ...u.role,
          commonEmojis: u.role.commonEmojis.length > 0 ? u.role.commonEmojis : cachedProfile.commonEmojis,
          reactionPatterns: u.role.reactionPatterns.length > 0 ? u.role.reactionPatterns : cachedProfile.reactionPatterns,
          personaSummary: u.role.personaSummary || cachedProfile.personaSummary,
        },
      };
    });
    let config = await this.persistence.getAgentConfig(conversationId);
    if (!config) {
      config = await this.persistence.ensureAgentConfig(conversationId);
    }
    const autoPickup = config?.autoPickupEnabled ?? true;
    if (autoPickup && controlledUsers.length < (config?.maxControlledUsers ?? 5)) {
      const remainingSlots = (config?.maxControlledUsers ?? 5) - controlledUsers.length;
      const limit = Math.min(3, remainingSlots);
      const effectiveThreshold = config?.inactivityThresholdHours ?? 72;
      const potentialUsers = await this.persistence.getPotentialControlledUsers(
        conversationId,
        limit,
        effectiveThreshold,
        config?.excludedRoles ?? [],
        (config?.excludedUserIds as string[]) ?? [],
      );

      for (const u of potentialUsers) {
        const p = u.agentGlobalProfile;
        const newControlledUser = {
          userId: u.id,
          displayName: u.displayName ?? u.username ?? u.id,
          username: u.username ?? u.id,
          systemLanguage: u.systemLanguage ?? "fr",
          source: 'auto_rule' as const,
          role: {
            userId: u.id,
            displayName: u.displayName ?? u.username ?? u.id,
            origin: (p ? 'observed' : 'archetype') as 'observed' | 'archetype',
            personaSummary: p?.personaSummary ?? '',
            tone: p?.tone ?? 'neutre',
            vocabularyLevel: p?.vocabularyLevel ?? 'courant',
            typicalLength: p?.typicalLength ?? 'moyen',
            emojiUsage: p?.emojiUsage ?? 'occasionnel',
            topicsOfExpertise: p?.topicsOfExpertise ?? [],
            topicsAvoided: p?.topicsAvoided ?? [],
            relationshipMap: {},
            catchphrases: p?.catchphrases ?? [],
            responseTriggers: [],
            silenceTriggers: [],
            commonEmojis: p?.commonEmojis ?? [],
            reactionPatterns: p?.reactionPatterns ?? [],
            messagesAnalyzed: p?.messagesAnalyzed ?? 0,
            confidence: p?.confidence ?? 0.1,
            locked: p?.locked ?? false,
          },
        };

        controlledUsers.push(newControlledUser);

        // PERSISTENCE: Await profile creation BEFORE intervention to ensure
        // the user appears in admin lists and survives across scan cycles.
        try {
          await this.persistence.upsertUserRole(conversationId, newControlledUser.role);
        } catch (err) {
          console.error(`[Scanner] Error persisting auto-picked user ${u.id} for conv=${conversationId}:`, err);
        }
      }
    }

    if (controlledUsers.length === 0 && autoPickup) {
      const maxControlled = config?.maxControlledUsers ?? 5;
      const bootstrapLimit = Math.min(3, maxControlled);
      const existingRoleUserIds = manualControlledUsers.map((u) => u.userId);
      const fallbackUsers = await this.persistence.getLeastActiveParticipants(
        conversationId,
        bootstrapLimit,
        (config?.excludedUserIds as string[]) ?? [],
        existingRoleUserIds,
      );

      for (const u of fallbackUsers) {
        const p = u.agentGlobalProfile;
        const newControlledUser = {
          userId: u.id,
          displayName: u.displayName ?? u.username ?? u.id,
          username: u.username ?? u.id,
          systemLanguage: u.systemLanguage ?? "fr",
          source: 'auto_rule' as const,
          role: {
            userId: u.id,
            displayName: u.displayName ?? u.username ?? u.id,
            origin: (p ? 'observed' : 'archetype') as 'observed' | 'archetype',
            personaSummary: p?.personaSummary ?? '',
            tone: p?.tone ?? 'neutre',
            vocabularyLevel: p?.vocabularyLevel ?? 'courant',
            typicalLength: p?.typicalLength ?? 'moyen',
            emojiUsage: p?.emojiUsage ?? 'occasionnel',
            topicsOfExpertise: p?.topicsOfExpertise ?? [],
            topicsAvoided: p?.topicsAvoided ?? [],
            relationshipMap: {},
            catchphrases: p?.catchphrases ?? [],
            responseTriggers: [],
            silenceTriggers: [],
            commonEmojis: p?.commonEmojis ?? [],
            reactionPatterns: p?.reactionPatterns ?? [],
            messagesAnalyzed: p?.messagesAnalyzed ?? 0,
            confidence: p?.confidence ?? 0.1,
            locked: p?.locked ?? false,
          },
        };

        controlledUsers.push(newControlledUser);
        try {
          await this.persistence.upsertUserRole(conversationId, newControlledUser.role);
        } catch (err) {
          console.error(`[Scanner] Error persisting bootstrap user ${u.id} for conv=${conversationId}:`, err);
        }
      }

      if (controlledUsers.length > 0) {
        console.log(`[Scanner] Bootstrap: picked ${controlledUsers.length} least-active participant(s) for conv=${conversationId}`);
      }
    }

    if (controlledUsers.length === 0) {
      console.log(`[Scanner] Skipping conv=${conversationId}: no controlled users`);
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }

    // P2.2: Filter out controlled users on cooldown
    const availableUsers = [];
    for (const u of controlledUsers) {
      const onCooldown = await this.stateManager.isOnCooldown(conversationId, u.userId);
      if (!onCooldown) availableUsers.push(u);
    }
    if (availableUsers.length === 0) {
      console.log(`[Scanner] Skipping conv=${conversationId}: all controlled users on cooldown`);
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }
    controlledUsers = availableUsers;

    let effectiveMessages = messages;
    if (effectiveMessages.length === 0) {
      const dbMessages = await this.persistence.getRecentMessages(conversationId, 50);
      const reversed = dbMessages.reverse();
      effectiveMessages = reversed
        .filter((m: typeof reversed[number]) => m.senderId !== null)
        .map((m: typeof reversed[number]) => ({
          id: m.id,
          senderId: m.senderId!,
          senderName: m.sender?.displayName ?? m.sender?.user?.username ?? m.senderId!,
          senderUsername: m.sender?.user?.username ?? m.senderId!,
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
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }

    const budgetCheck = await this.budgetManager.canSendMessage(conversationId, {
      weekdayMaxMessages: conv.weekdayMaxMessages,
      weekendMaxMessages: conv.weekendMaxMessages,
    });

    let effectiveBudgetRemaining = budgetCheck.remaining;
    let burstCooldownActive = false;

    if (!budgetCheck.allowed) {
      effectiveBudgetRemaining = 0;
      burstCooldownActive = true;
      console.log(`[Scanner] Budget exhausted for conv=${conversationId}: ${budgetCheck.current}/${budgetCheck.max} — observation only`);
    }

    if (conv.burstEnabled && !burstCooldownActive) {
      const burstCheck = await this.budgetManager.canBurst(conversationId, {
        quietIntervalMinutes: conv.quietIntervalMinutes,
      });
      if (!burstCheck.allowed) {
        effectiveBudgetRemaining = 0;
        burstCooldownActive = true;
        console.log(`[Scanner] Burst cooldown for conv=${conversationId}: ${burstCheck.minutesUntilNext}min remaining — observation only`);
      }
    }

    const todayStats = await this.budgetManager.getTodayStats(conversationId);
    const day = new Date().getUTCDay();
    const maxUsersToday = day === 0 || day === 6 ? conv.weekendMaxUsers : conv.weekdayMaxUsers;

    if (todayStats.usersActive >= maxUsersToday) {
      console.log(`[Scanner] User budget exhausted for conv=${conversationId}: ${todayStats.usersActive}/${maxUsersToday} users today`);
      tracer.setOutcome({ outcome: 'skipped', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }

    // Extract recent topic categories from agent history to enforce diversity at code level
    const recentTopicCategories = extractRecentTopicCategories(agentHistory);

    console.log(`[Scanner] Processing conv=${conversationId} activity=${activity.activityScore.toFixed(2)} msgs=${effectiveMessages.length} users=${controlledUsers.length} lastUser=${lastAgentUserId ?? 'none'} recentTopics=${recentTopicCategories.length}`);

    let result: Record<string, unknown>;
    try {
      result = await this.graph.invoke({
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
      budgetRemaining: effectiveBudgetRemaining,
      todayUsersActive: todayStats.usersActive,
      maxUsersToday,
      burstMode: conv.burstEnabled,
      burstSize: conv.burstSize,
      prioritizeTaggedUsers: conv.prioritizeTaggedUsers,
      prioritizeRepliedUsers: conv.prioritizeRepliedUsers,
      reactionBoostFactor: conv.reactionBoostFactor,
      agentHistory,
      todayActiveUserIds,
      lastAgentUserId,
      recentTopicCategories,
      engagementData,
    });
    } catch (graphError) {
      console.error(`[Scanner] Graph invocation failed for conv=${conversationId}:`, graphError);
      tracer.setOutcome({ outcome: 'error', messagesSent: 0, reactionsSent: 0, messagesRejected: 0, userIdsUsed: [] });
      this.persistence.createScanLog(tracer.finalize()).catch(err =>
        console.error(`[Scanner] Error persisting scan log:`, err));
      this.tracerRef.current = null;
      return false;
    }

    try {
      if (result.summary) await this.stateManager.setSummary(conversationId, result.summary as string);
    } catch (err) { console.error(`[Scanner] Error persisting summary for conv=${conversationId}:`, err); }

    try {
      if (result.toneProfiles) await this.stateManager.setToneProfiles(conversationId, result.toneProfiles as Record<string, any>);
    } catch (err) { console.error(`[Scanner] Error persisting tone profiles for conv=${conversationId}:`, err); }

    // P1.1: Persist global profiles for non-controlled users (enables auto-pickup)
    // P3.2: Persist updated Observer profiles for controlled users
    if (result.toneProfiles) {
      const observedProfiles = result.toneProfiles as Record<string, ToneProfile>;
      const controlledUserIds = new Set(controlledUsers.map((u) => u.userId));

      for (const [userId, profile] of Object.entries(observedProfiles)) {
        if (controlledUserIds.has(userId)) {
          if (profile.messagesAnalyzed > (controlledUsers.find((u) => u.userId === userId)?.role.messagesAnalyzed ?? 0)) {
            this.persistence.upsertUserRole(conversationId, profile).catch((err) =>
              console.error(`[Scanner] Error persisting controlled user profile ${userId}:`, err));
          }
        } else if (profile.messagesAnalyzed >= 3) {
          this.persistence.upsertGlobalProfile(userId, toneProfileToGlobalFields(profile)).catch((err) =>
            console.error(`[Scanner] Error persisting global profile ${userId}:`, err));
        }
      }
    }

    try {
      const updatedHistory = result.agentHistory as Array<{ userId: string; topic: string; contentHash: string; timestamp: number }> | undefined;
      if (updatedHistory && updatedHistory.length > 0) {
        const merged = [...agentHistory, ...updatedHistory].slice(-100);
        await this.stateManager.setAgentHistory(conversationId, merged);
      }
    } catch (err) { console.error(`[Scanner] Error persisting agent history for conv=${conversationId}:`, err); }

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
        // Track last agent user for rotation enforcement
        const lastMsg = messageActions[messageActions.length - 1];
        this.stateManager.setLastAgentUserId(conversationId, lastMsg.asUserId).catch((err) =>
          console.error(`[Scanner] Error tracking last agent user:`, err));

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

    const msgActions = pendingActions.filter((a) => a.type === 'message');
    const rxnActions = pendingActions.filter((a) => a.type !== 'message');
    tracer.setOutcome({
      outcome: msgActions.length > 0 ? 'messages_sent' : rxnActions.length > 0 ? 'reactions_only' : 'skipped',
      messagesSent: msgActions.length,
      reactionsSent: rxnActions.length,
      messagesRejected: 0,
      userIdsUsed: [...new Set(msgActions.map((a) => (a as any).asUserId).filter(Boolean))],
    });
    this.persistence.createScanLog(tracer.finalize()).catch(err =>
      console.error(`[Scanner] Error persisting scan log:`, err));
    this.tracerRef.current = null;

    return true;
  }
}
