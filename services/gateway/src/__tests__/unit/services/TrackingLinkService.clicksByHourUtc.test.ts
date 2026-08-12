/**
 * TrackingLinkService — clicksByHour UTC coherence
 *
 * getTrackingLinkStats derives two time histograms from the SAME click set:
 *   - clicksByDate  → click.clickedAt.toISOString()  (UTC calendar day)
 *   - clicksByHour  → click.clickedAt.getUTCHours()  (UTC hour)
 *
 * Both MUST bucket in the same (UTC) reference frame so the histograms stay
 * coherent regardless of the deployment/runner timezone. A prior version used
 * getHours() (server-local time) for the hour bucket — masked in production
 * (node:22-slim runs TZ=UTC, so getHours() === getUTCHours()) but silently
 * wrong on any non-UTC host.
 *
 * Because CI runs under TZ=UTC (where local and UTC hours coincide) an
 * ambient-timezone test cannot distinguish the two implementations. Instead we
 * feed a click whose clickedAt reports a DIFFERENT local vs UTC hour, so the
 * assertion has teeth under any runner timezone.
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { TrackingLinkService } from '../../../services/TrackingLinkService';

const LINK_FIXTURE = {
  id: 'link_001',
  token: 'AbCd12',
  shortUrl: '/l/AbCd12',
  originalUrl: 'https://example.com/page',
  isActive: true,
  expiresAt: null,
  totalClicks: 0,
  uniqueClicks: 0,
  createdBy: 'user_001',
  conversationId: null,
  messageId: null,
  targetType: 'URL',
  targetId: null,
  name: null,
  campaign: null,
  source: null,
  medium: null,
  createdAt: new Date('2024-01-01'),
  lastClickedAt: null,
};

function makePrisma(clicks: unknown[]) {
  return {
    trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
    trackingLinkClick: { findMany: jest.fn().mockResolvedValue(clicks) },
    conversationShareLink: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
}

/**
 * A clickedAt double whose local hour (getHours) and UTC hour (getUTCHours)
 * deliberately differ, so the histogram bucketing reveals which one the code
 * uses — independent of the runner timezone.
 */
function clickAt(opts: { utcHour: number; localHour: number; isoDay: string }) {
  const iso = `${opts.isoDay}T${String(opts.utcHour).padStart(2, '0')}:30:00.000Z`;
  return {
    country: null, device: null, browser: null, os: null, language: null,
    socialSource: null, referrer: null, ipAddress: null, deviceFingerprint: null,
    redirectStatus: null,
    clickedAt: {
      getHours: () => opts.localHour,
      getUTCHours: () => opts.utcHour,
      toISOString: () => iso,
    },
  };
}

describe('getTrackingLinkStats — clicksByHour buckets by UTC, coherent with clicksByDate', () => {
  it('uses the UTC hour, not the server-local hour', async () => {
    // Local hour 08 (e.g. Asia/Tokyo) vs UTC hour 23 for the same instant.
    const clicks = [clickAt({ utcHour: 23, localHour: 8, isoDay: '2024-06-01' })];
    const svc = new TrackingLinkService(makePrisma(clicks));

    const stats = await svc.getTrackingLinkStats('AbCd12');

    expect(stats.clicksByHour).toEqual({ '23': 1 });
    // Same instant → same UTC day, so the two histograms agree.
    expect(stats.clicksByDate).toEqual({ '2024-06-01': 1 });
  });

  it('aggregates multiple clicks by their UTC hour', async () => {
    const clicks = [
      clickAt({ utcHour: 0, localHour: 9, isoDay: '2024-06-01' }),
      clickAt({ utcHour: 0, localHour: 9, isoDay: '2024-06-01' }),
      clickAt({ utcHour: 15, localHour: 0, isoDay: '2024-06-01' }),
    ];
    const svc = new TrackingLinkService(makePrisma(clicks));

    const stats = await svc.getTrackingLinkStats('AbCd12');

    expect(stats.clicksByHour).toEqual({ '00': 2, '15': 1 });
  });
});
