import { describe, it, expect } from '@jest/globals';
import { buildAfterWatermarkClause } from '../../routes/conversations/messages';

// T8 — forward message watermark for local-first incremental backfill.
// GET /conversations/:id/messages?after=<ISO8601> must return only messages
// created strictly after the watermark, so the SDK can resume a missed-message
// gap from a high-water mark instead of refetching offset:0.
describe('buildAfterWatermarkClause — forward message watermark', () => {
  it('returns a createdAt > filter for a valid ISO8601 timestamp', () => {
    const iso = '2026-06-01T05:00:00.000Z';
    const clause = buildAfterWatermarkClause(iso);
    expect(clause).not.toBeNull();
    expect(clause!.createdAt.gt instanceof Date).toBe(true);
    expect(clause!.createdAt.gt.getTime()).toBe(new Date(iso).getTime());
  });

  it('returns null when after is undefined (falls back to default paging)', () => {
    expect(buildAfterWatermarkClause(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(buildAfterWatermarkClause('')).toBeNull();
  });

  it('returns null for an unparseable timestamp (never builds an Invalid Date filter)', () => {
    expect(buildAfterWatermarkClause('not-a-date')).toBeNull();
  });
});
