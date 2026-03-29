import { ScanTracer } from '../../tracing/scan-tracer';

describe('ScanTracer', () => {
  it('initializes with conversation metadata', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    const log = tracer.finalize();
    expect(log.conversationId).toBe('conv-123');
    expect(log.trigger).toBe('auto');
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records node results and accumulates tokens', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.recordNode('observe', {
      inputTokens: 500,
      outputTokens: 200,
      latencyMs: 150,
      model: 'gpt-4o-mini',
      extra: { profilesUpdated: 3, summaryChanged: true },
    });
    tracer.recordNode('strategist', {
      inputTokens: 800,
      outputTokens: 300,
      latencyMs: 200,
      model: 'gpt-4o-mini',
      extra: { decision: 'intervene', reason: 'test', plannedMessages: 2, plannedReactions: 1 },
    });

    const log = tracer.finalize();
    expect(log.totalInputTokens).toBe(1300);
    expect(log.totalOutputTokens).toBe(500);
    expect(log.totalLatencyMs).toBe(350);
    expect(log.estimatedCostUsd).toBeGreaterThan(0);
    expect(log.nodeResults.observe.inputTokens).toBe(500);
    expect(log.nodeResults.strategist.extra.decision).toBe('intervene');
  });

  it('records preconditions', () => {
    const tracer = new ScanTracer('conv-123', 'manual', 'admin-user-1');
    tracer.setPreconditions({
      activityScore: 0.35,
      messagesInWindow: 42,
      budgetBefore: { messagesUsed: 3, messagesMax: 10, usersActive: 2, maxUsers: 4 },
      controlledUserIds: ['u1', 'u2'],
      configSnapshot: { scanIntervalMinutes: 3, burstEnabled: true },
    });
    const log = tracer.finalize();
    expect(log.activityScore).toBe(0.35);
    expect(log.messagesInWindow).toBe(42);
    expect(log.controlledUserIds).toEqual(['u1', 'u2']);
    expect(log.triggeredBy).toBe('admin-user-1');
  });

  it('records outcome', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.setOutcome({
      outcome: 'messages_sent',
      messagesSent: 2,
      reactionsSent: 5,
      messagesRejected: 1,
      userIdsUsed: ['u1', 'u2'],
    });
    const log = tracer.finalize();
    expect(log.outcome).toBe('messages_sent');
    expect(log.messagesSent).toBe(2);
    expect(log.userIdsUsed).toEqual(['u1', 'u2']);
  });

  it('records generator per-message metrics', () => {
    const tracer = new ScanTracer('conv-123', 'auto');
    tracer.recordNode('generator', {
      inputTokens: 1000,
      outputTokens: 400,
      latencyMs: 300,
      model: 'gpt-4o-mini',
      extra: {
        messagesGenerated: 2,
        reactionsBuilt: 3,
        webSearchUsed: false,
        perMessage: [
          { asUserId: 'u1', wordCount: 25, inputTokens: 500, outputTokens: 200, latencyMs: 150 },
          { asUserId: 'u2', wordCount: 40, inputTokens: 500, outputTokens: 200, latencyMs: 150 },
        ],
      },
    });
    const log = tracer.finalize();
    expect(log.nodeResults.generator.extra.perMessage).toHaveLength(2);
  });
});
