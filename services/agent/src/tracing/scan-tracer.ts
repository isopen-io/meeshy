import { estimateCostUsd } from './cost-estimator';

type NodeName = 'observe' | 'strategist' | 'generator' | 'qualityGate';

type NodeRecord = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  costUsd: number;
  extra: Record<string, unknown>;
};

type Preconditions = {
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: Record<string, unknown>;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown>;
};

type Outcome = {
  outcome: 'messages_sent' | 'reactions_only' | 'skipped' | 'error';
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
};

export type ScanLogData = {
  conversationId: string;
  trigger: string;
  triggeredBy: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  activityScore: number;
  messagesInWindow: number;
  budgetBefore: Record<string, unknown> | null;
  controlledUserIds: string[];
  configSnapshot: Record<string, unknown> | null;
  nodeResults: Record<string, NodeRecord>;
  outcome: string;
  messagesSent: number;
  reactionsSent: number;
  messagesRejected: number;
  userIdsUsed: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  configChangedAt: Date | null;
};

export class ScanTracer {
  private startTime = Date.now();
  private nodes: Record<string, NodeRecord> = {};
  private preconditions: Preconditions | null = null;
  private outcomeData: Outcome | null = null;
  private _configChangedAt: Date | null = null;

  constructor(
    private conversationId: string,
    private trigger: string,
    private triggeredBy: string | null = null,
  ) {}

  recordNode(
    name: NodeName,
    data: { inputTokens: number; outputTokens: number; latencyMs: number; model: string; extra: Record<string, unknown> },
  ): void {
    this.nodes[name] = {
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      latencyMs: data.latencyMs,
      model: data.model,
      costUsd: estimateCostUsd(data.model, data.inputTokens, data.outputTokens),
      extra: data.extra,
    };
  }

  setPreconditions(p: Preconditions): void {
    this.preconditions = p;
  }

  setOutcome(o: Outcome): void {
    this.outcomeData = o;
  }

  setConfigChangedAt(date: Date): void {
    this._configChangedAt = date;
  }

  finalize(): ScanLogData {
    const now = Date.now();
    let totalInput = 0;
    let totalOutput = 0;
    let totalLatency = 0;
    let totalCost = 0;

    for (const node of Object.values(this.nodes)) {
      totalInput += node.inputTokens;
      totalOutput += node.outputTokens;
      totalLatency += node.latencyMs;
      totalCost += node.costUsd;
    }

    return {
      conversationId: this.conversationId,
      trigger: this.trigger,
      triggeredBy: this.triggeredBy,
      startedAt: new Date(this.startTime),
      completedAt: new Date(now),
      durationMs: now - this.startTime,
      activityScore: this.preconditions?.activityScore ?? 0,
      messagesInWindow: this.preconditions?.messagesInWindow ?? 0,
      budgetBefore: this.preconditions?.budgetBefore ?? null,
      controlledUserIds: this.preconditions?.controlledUserIds ?? [],
      configSnapshot: this.preconditions?.configSnapshot ?? null,
      nodeResults: this.nodes,
      outcome: this.outcomeData?.outcome ?? 'skipped',
      messagesSent: this.outcomeData?.messagesSent ?? 0,
      reactionsSent: this.outcomeData?.reactionsSent ?? 0,
      messagesRejected: this.outcomeData?.messagesRejected ?? 0,
      userIdsUsed: this.outcomeData?.userIdsUsed ?? [],
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalLatencyMs: totalLatency,
      estimatedCostUsd: totalCost,
      configChangedAt: this._configChangedAt,
    };
  }
}
