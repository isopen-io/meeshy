/**
 * Les bornes comptent des ACTES, jamais des points (précision du porteur,
 * 2026-10-08, #9667) : un plafond de N actes laisse passer exactement N actes,
 * qu'un acte vaille 1 point ou 300.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementOperationRule } from '@meeshy/shared/types/engagement-scale';
import { EngagementQuotas } from '../../../../services/engagement/EngagementQuotas';
import {
  isDailyCapReached,
  nextConversationEngagement,
  type ConversationEngagementRow,
} from '../../../../services/engagement/ConversationEngagementRecorder';

const TODAY = new Date('2026-10-08T00:00:00.000Z');

function quotaStore() {
  const counts = new Map<string, number>();
  const bump = async ({ where }: { where: { userId_operationKey_bucket: { userId: string; operationKey: string; bucket: string } } }) => {
    const { userId, operationKey, bucket } = where.userId_operationKey_bucket;
    const key = `${userId}|${operationKey}|${bucket}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { count };
  };
  return { engagementQuota: { upsert: bump, update: bump } } as unknown as Pick<PrismaClient, 'engagementQuota'>;
}

async function admittedActs(operationKey: EngagementOperationKey, rule: EngagementOperationRule, attempts: number): Promise<number> {
  const quotas = new EngagementQuotas(quotaStore());
  const verdicts = [];
  for (let n = 0; n < attempts; n += 1) {
    verdicts.push(await quotas.admit({ userId: 'u1', operationKey, rule, today: TODAY, heavy: false }));
  }
  return verdicts.filter(Boolean).length;
}

describe('un plafond par jour compte des actes', () => {
  it.each([1, 300, 1000])('10 réels par jour, qu’un réel vaille %i points', async (points) => {
    const rule = { ...DEFAULT_ENGAGEMENT_SCALE.operations['content.reel'], points };
    expect(rule.cap).toBe(10);
    expect(await admittedActs('content.reel', rule, 25)).toBe(10);
  });

  it('3 humeurs par jour, à 5 points chacune', async () => {
    expect(await admittedActs('content.status', DEFAULT_ENGAGEMENT_SCALE.operations['content.status'], 8)).toBe(3);
  });
});

describe('un plafond par conversation et par jour compte des actes', () => {
  const actsAdmitted = (points: number, cap: number, attempts: number): number => {
    let row: ConversationEngagementRow | null = null;
    let admitted = 0;
    for (let n = 0; n < attempts; n += 1) {
      if (isDailyCapReached(row, TODAY, 'content.text_message', cap)) continue;
      const next = nextConversationEngagement(row, { today: TODAY, axisKey: 'content.text_message', points });
      row = { ...next, conversationId: 'c1', userId: 'u1' } as unknown as ConversationEngagementRow;
      admitted += 1;
    }
    return admitted;
  };

  it.each([2, 4, 6, 8])('un message à %i points : 300 messages, ni plus ni moins', (points) => {
    expect(actsAdmitted(points, DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].cap ?? 0, 320)).toBe(300);
  });
});
