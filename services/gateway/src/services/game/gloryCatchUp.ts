import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GloryService } from './GloryService';

export const GLORY_CATCH_UP_VERSION = 'rattrapage-bareme-2026-11';
export type GloryCatchUpSource = 'mint' | 'level' | 'flame-record' | 'mission' | 'mission-gold';
export type GloryLedgerFact = { readonly reason: string; readonly requestId: string; readonly delta: number };
export type GloryCatchUpFacts = {
  readonly mintsProven: number;
  readonly longestStreakDays: number | null;
  readonly ledger: readonly GloryLedgerFact[];
  readonly completedMissions: readonly { readonly id: string; readonly difficulty: string }[];
};
export type GloryCatchUpLine = { readonly source: GloryCatchUpSource; readonly reason: GloryCatchUpSource; readonly requestId: string; readonly delta: number; readonly paid: number; readonly target: number };
export type ApparentGaps = { readonly achievement: number; readonly league: number; readonly season: number; readonly prestige: number; readonly missionsBelowScale: number };

export const gloryCatchUpRequestId = (source: GloryCatchUpSource): string => `${GLORY_CATCH_UP_VERSION}:${source}`;

export function gloryCatchUpLines(_facts: GloryCatchUpFacts): { readonly lines: readonly GloryCatchUpLine[]; readonly apparentGaps: ApparentGaps } {
  return { lines: [], apparentGaps: { achievement: 0, league: 0, season: 0, prestige: 0, missionsBelowScale: 0 } };
}

export async function runGloryCatchUp(_params: {
  readonly prisma: PrismaClient;
  readonly glory: Pick<GloryService, 'credit' | 'openLevels'>;
  readonly dryRun: boolean;
  readonly batchSize: number;
  readonly out: (line: string) => void;
}): Promise<{ readonly accounts: number; readonly gloryAdded: number }> {
  return { accounts: 0, gloryAdded: 0 };
}
