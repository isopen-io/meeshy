/**
 * admin-schemas validation tests
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  AnalyticsMessageTypesQuerySchema,
  AnalyticsLanguageDistQuerySchema,
  AnalyticsKpisQuerySchema,
  AnonymousUsersQuerySchema,
  BroadcastIdParamSchema,
  BroadcastsListQuerySchema,
  CreateBroadcastBodySchema,
  UpdateBroadcastBodySchema,
  InvitationsListQuerySchema,
  InvitationIdParamSchema,
  UpdateInvitationBodySchema,
  LanguageStatsQuerySchema,
  LanguageTimelineQuerySchema,
  TranslationAccuracyQuerySchema,
  AdminMessagesStatsQuerySchema,
  AdminMessagesEngagementQuerySchema,
  RankingsQuerySchema,
} from '../../../validation/admin-schemas';

// ─── Analytics ───────────────────────────────────────────────────────────────

describe('AnalyticsMessageTypesQuerySchema', () => {
  it('accepts valid period values', () => {
    expect(AnalyticsMessageTypesQuerySchema.parse({ period: '24h' })).toMatchObject({ period: '24h' });
    expect(AnalyticsMessageTypesQuerySchema.parse({ period: '7d' })).toMatchObject({ period: '7d' });
    expect(AnalyticsMessageTypesQuerySchema.parse({ period: '30d' })).toMatchObject({ period: '30d' });
  });

  it('defaults to 7d when period is omitted', () => {
    expect(AnalyticsMessageTypesQuerySchema.parse({})).toMatchObject({ period: '7d' });
  });

  it('rejects invalid period', () => {
    expect(() => AnalyticsMessageTypesQuerySchema.parse({ period: '1y' })).toThrow();
  });
});

describe('AnalyticsLanguageDistQuerySchema', () => {
  it('transforms limit string to number', () => {
    const result = AnalyticsLanguageDistQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('defaults limit to 5', () => {
    const result = AnalyticsLanguageDistQuerySchema.parse({});
    expect(result.limit).toBe(5);
  });
});

describe('AnalyticsKpisQuerySchema', () => {
  it('accepts valid periods', () => {
    expect(AnalyticsKpisQuerySchema.parse({ period: '7d' })).toMatchObject({ period: '7d' });
    expect(AnalyticsKpisQuerySchema.parse({ period: '90d' })).toMatchObject({ period: '90d' });
  });

  it('defaults to 30d', () => {
    expect(AnalyticsKpisQuerySchema.parse({})).toMatchObject({ period: '30d' });
  });

  it('rejects invalid period like 60d', () => {
    expect(() => AnalyticsKpisQuerySchema.parse({ period: '60d' })).toThrow();
  });
});

// ─── Anonymous Users ──────────────────────────────────────────────────────────

describe('AnonymousUsersQuerySchema', () => {
  it('accepts all fields with valid values', () => {
    const result = AnonymousUsersQuerySchema.parse({ offset: '5', limit: '10', search: 'hello', status: 'active' });
    expect(result).toMatchObject({ offset: 5, limit: 10, search: 'hello', status: 'active' });
  });

  it('defaults offset=0, limit=20', () => {
    const result = AnonymousUsersQuerySchema.parse({});
    expect(result).toMatchObject({ offset: 0, limit: 20 });
  });

  it('accepts inactive status', () => {
    expect(AnonymousUsersQuerySchema.parse({ status: 'inactive' })).toMatchObject({ status: 'inactive' });
  });

  it('rejects invalid status', () => {
    expect(() => AnonymousUsersQuerySchema.parse({ status: 'banned' })).toThrow();
  });

  it('allows search to be omitted', () => {
    const result = AnonymousUsersQuerySchema.parse({});
    expect(result.search).toBeUndefined();
  });
});

// ─── Broadcasts ──────────────────────────────────────────────────────────────

describe('BroadcastIdParamSchema', () => {
  it('accepts valid 24-char hex mongo id', () => {
    expect(BroadcastIdParamSchema.parse({ id: '507f1f77bcf86cd799439011' })).toMatchObject({ id: '507f1f77bcf86cd799439011' });
  });

  it('rejects non-hex or wrong-length id', () => {
    expect(() => BroadcastIdParamSchema.parse({ id: 'short' })).toThrow();
    expect(() => BroadcastIdParamSchema.parse({ id: '507f1f77bcf86cd79943901Z' })).toThrow();
  });
});

describe('BroadcastsListQuerySchema', () => {
  it('accepts valid offset/limit/status', () => {
    const result = BroadcastsListQuerySchema.parse({ offset: '10', limit: '50', status: 'sent' });
    expect(result).toMatchObject({ offset: 10, limit: 50, status: 'sent' });
  });

  it('defaults offset=0, limit=20', () => {
    const result = BroadcastsListQuerySchema.parse({});
    expect(result).toMatchObject({ offset: 0, limit: 20 });
  });

  it('rejects limit > 100', () => {
    expect(() => BroadcastsListQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => BroadcastsListQuerySchema.parse({ limit: '0' })).toThrow();
  });
});

describe('CreateBroadcastBodySchema', () => {
  const valid = {
    name: 'My Broadcast',
    subject: 'Hello',
    body: 'World',
    sourceLanguage: 'fr',
  };

  it('accepts valid broadcast body without targeting', () => {
    expect(CreateBroadcastBodySchema.parse(valid)).toMatchObject(valid);
  });

  it('accepts targeting within 32KB', () => {
    const result = CreateBroadcastBodySchema.parse({ ...valid, targeting: { role: 'USER' } });
    expect(result.targeting).toMatchObject({ role: 'USER' });
  });

  it('rejects body with missing required fields', () => {
    expect(() => CreateBroadcastBodySchema.parse({ name: 'x' })).toThrow();
  });

  it('rejects targeting that cannot be serialized (circular reference fails refine)', () => {
    // The refine uses JSON.stringify → circular would throw, caught as false
    const circular: any = {};
    circular.self = circular;
    expect(() => CreateBroadcastBodySchema.parse({ ...valid, targeting: circular })).toThrow();
  });
});

describe('UpdateBroadcastBodySchema', () => {
  it('accepts all fields optional', () => {
    expect(UpdateBroadcastBodySchema.parse({})).toEqual({});
  });

  it('accepts partial updates', () => {
    const result = UpdateBroadcastBodySchema.parse({ name: 'New Name' });
    expect(result.name).toBe('New Name');
  });

  it('accepts targeting within 32KB (invokes refine callback)', () => {
    const result = UpdateBroadcastBodySchema.parse({ targeting: { role: 'USER' } });
    expect(result.targeting).toMatchObject({ role: 'USER' });
  });

  it('rejects targeting that cannot be serialized (circular reference)', () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => UpdateBroadcastBodySchema.parse({ targeting: circular })).toThrow();
  });
});

// ─── Invitations ──────────────────────────────────────────────────────────────

describe('InvitationsListQuerySchema', () => {
  it('accepts all filters', () => {
    const result = InvitationsListQuerySchema.parse({
      offset: '5', limit: '10', status: 'pending',
      communityId: '507f1f77bcf86cd799439011',
      senderId: '507f1f77bcf86cd799439022',
    });
    expect(result.offset).toBe(5);
    expect(result.communityId).toBe('507f1f77bcf86cd799439011');
  });

  it('defaults offset=0, limit=20', () => {
    const result = InvitationsListQuerySchema.parse({});
    expect(result).toMatchObject({ offset: 0, limit: 20 });
  });

  it('rejects limit > 100', () => {
    expect(() => InvitationsListQuerySchema.parse({ limit: '200' })).toThrow();
  });

  it('rejects invalid mongo id for communityId', () => {
    expect(() => InvitationsListQuerySchema.parse({ communityId: 'bad' })).toThrow();
  });
});

describe('InvitationIdParamSchema', () => {
  it('accepts valid mongo id', () => {
    expect(InvitationIdParamSchema.parse({ id: '507f1f77bcf86cd799439011' })).toMatchObject({ id: '507f1f77bcf86cd799439011' });
  });

  it('rejects invalid id', () => {
    expect(() => InvitationIdParamSchema.parse({ id: 'xyz' })).toThrow();
  });
});

describe('UpdateInvitationBodySchema', () => {
  it('accepts pending status', () => {
    expect(UpdateInvitationBodySchema.parse({ status: 'pending' })).toMatchObject({ status: 'pending' });
  });

  it('accepts accepted and rejected', () => {
    expect(UpdateInvitationBodySchema.parse({ status: 'accepted' })).toMatchObject({ status: 'accepted' });
    expect(UpdateInvitationBodySchema.parse({ status: 'rejected' })).toMatchObject({ status: 'rejected' });
  });

  it('rejects invalid status', () => {
    expect(() => UpdateInvitationBodySchema.parse({ status: 'cancelled' })).toThrow();
  });

  it('rejects missing status', () => {
    expect(() => UpdateInvitationBodySchema.parse({})).toThrow();
  });
});

// ─── Languages ────────────────────────────────────────────────────────────────

describe('LanguageStatsQuerySchema', () => {
  it('accepts valid period and limit', () => {
    const result = LanguageStatsQuerySchema.parse({ period: '90d', limit: '20' });
    expect(result).toMatchObject({ period: '90d', limit: 20 });
  });

  it('defaults period=30d, limit=10', () => {
    const result = LanguageStatsQuerySchema.parse({});
    expect(result).toMatchObject({ period: '30d', limit: 10 });
  });

  it('rejects invalid period', () => {
    expect(() => LanguageStatsQuerySchema.parse({ period: '1d' })).toThrow();
  });
});

describe('LanguageTimelineQuerySchema', () => {
  it('accepts period and optional language', () => {
    const result = LanguageTimelineQuerySchema.parse({ period: '7d', language: 'fr' });
    expect(result).toMatchObject({ period: '7d', language: 'fr' });
  });

  it('defaults to 7d, no language', () => {
    const result = LanguageTimelineQuerySchema.parse({});
    expect(result.period).toBe('7d');
    expect(result.language).toBeUndefined();
  });

  it('rejects invalid period', () => {
    expect(() => LanguageTimelineQuerySchema.parse({ period: '90d' })).toThrow();
  });
});

describe('TranslationAccuracyQuerySchema', () => {
  it('transforms limit string to number', () => {
    expect(TranslationAccuracyQuerySchema.parse({ limit: '5' })).toMatchObject({ limit: 5 });
  });

  it('defaults limit to 10', () => {
    expect(TranslationAccuracyQuerySchema.parse({})).toMatchObject({ limit: 10 });
  });
});

// ─── Admin Messages ───────────────────────────────────────────────────────────

describe('AdminMessagesStatsQuerySchema', () => {
  it('accepts all valid periods', () => {
    for (const period of ['24h', '7d', '30d', '90d']) {
      expect(AdminMessagesStatsQuerySchema.parse({ period })).toMatchObject({ period });
    }
  });

  it('defaults to 30d', () => {
    expect(AdminMessagesStatsQuerySchema.parse({})).toMatchObject({ period: '30d' });
  });

  it('rejects invalid period', () => {
    expect(() => AdminMessagesStatsQuerySchema.parse({ period: '1y' })).toThrow();
  });
});

describe('AdminMessagesEngagementQuerySchema', () => {
  it('accepts 7d and 30d', () => {
    expect(AdminMessagesEngagementQuerySchema.parse({ period: '7d' })).toMatchObject({ period: '7d' });
    expect(AdminMessagesEngagementQuerySchema.parse({ period: '30d' })).toMatchObject({ period: '30d' });
  });

  it('defaults to 7d', () => {
    expect(AdminMessagesEngagementQuerySchema.parse({})).toMatchObject({ period: '7d' });
  });
});

// ─── System Rankings ──────────────────────────────────────────────────────────

describe('RankingsQuerySchema', () => {
  it('accepts all entityType values', () => {
    for (const entityType of ['users', 'conversations', 'messages', 'links']) {
      const result = RankingsQuerySchema.parse({ entityType, limit: '10' });
      expect(result.entityType).toBe(entityType);
    }
  });

  it('defaults entityType=users, period=30d, limit=50', () => {
    const result = RankingsQuerySchema.parse({});
    expect(result).toMatchObject({ entityType: 'users', period: '30d', limit: 50 });
  });

  it('accepts all valid periods', () => {
    for (const period of ['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all']) {
      expect(RankingsQuerySchema.parse({ period, limit: '10' })).toMatchObject({ period });
    }
  });

  it('rejects limit > 100', () => {
    expect(() => RankingsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => RankingsQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('accepts optional criterion', () => {
    const result = RankingsQuerySchema.parse({ criterion: 'messageCount', limit: '10' });
    expect(result.criterion).toBe('messageCount');
  });

  it('rejects invalid entityType', () => {
    expect(() => RankingsQuerySchema.parse({ entityType: 'posts' })).toThrow();
  });
});
