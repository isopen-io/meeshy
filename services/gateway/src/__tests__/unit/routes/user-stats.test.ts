/**
 * Tests for user-stats routes.
 *
 * Pure unit tests on the extracted `computeUserStats` helper (mock prisma).
 * The `/users/:id/stats` route is owned by routes/users/preferences.ts, so its
 * route-level tests live with that handler (see NOTE below).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { computeUserStats } from '../../../routes/user-stats';

type StatsPrismaOverrides = {
  totalMessages?: number;
  totalConversations?: number;
  totalTranslations?: number;
  friendRequestsReceived?: number;
  languages?: Array<string | null>;
  createdAt?: Date | null;
  resolvedId?: string | null;
};

/**
 * Minimal prisma double covering exactly the methods computeUserStats /
 * resolveUserId call. message.count returns different values based on the
 * `where` clause shape (translations filter ⇒ translations count).
 */
function buildPrisma(overrides: StatsPrismaOverrides = {}): PrismaClient {
  const {
    totalMessages = 0,
    totalConversations = 0,
    totalTranslations = 0,
    friendRequestsReceived = 0,
    languages = [],
    createdAt = new Date(),
    resolvedId = 'resolved-user-id',
  } = overrides;

  const prisma = {
    message: {
      count: jest.fn((args: { where?: { NOT?: unknown } }) =>
        Promise.resolve(args?.where?.NOT ? totalTranslations : totalMessages)
      ),
      groupBy: jest.fn(() =>
        Promise.resolve(languages.map((originalLanguage) => ({ originalLanguage })))
      ),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    participant: {
      count: jest.fn(() => Promise.resolve(totalConversations)),
    },
    friendRequest: {
      count: jest.fn(() => Promise.resolve(friendRequestsReceived)),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve(createdAt ? { createdAt } : null)
      ),
      findFirst: jest.fn(() =>
        Promise.resolve(resolvedId ? { id: resolvedId } : null)
      ),
    },
  };

  return prisma as unknown as PrismaClient;
}

describe('computeUserStats', () => {
  it('aggregates counts, languages and member days into the iOS shape', async () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const prisma = buildPrisma({
      totalMessages: 1200,
      totalConversations: 12,
      totalTranslations: 150,
      friendRequestsReceived: 60,
      languages: ['fr', 'en', 'es'],
      createdAt,
    });

    const stats = await computeUserStats(prisma, 'u1');

    expect(stats.totalMessages).toBe(1200);
    expect(stats.totalConversations).toBe(12);
    expect(stats.totalTranslations).toBe(150);
    expect(stats.friendRequestsReceived).toBe(60);
    expect(stats.languages).toEqual(['fr', 'en', 'es']);
    expect(stats.languagesUsed).toBe(3);
    expect(stats.memberDays).toBe(10);
  });

  it('returns the exact iOS UserStats keys', async () => {
    const stats = await computeUserStats(buildPrisma(), 'u1');
    expect(Object.keys(stats).sort()).toEqual(
      [
        'achievements',
        'friendRequestsReceived',
        'languages',
        'languagesUsed',
        'memberDays',
        'totalConversations',
        'totalMessages',
        'totalTranslations',
      ].sort()
    );
  });

  it('computes achievement unlock state and progress against thresholds', async () => {
    const stats = await computeUserStats(
      buildPrisma({ totalMessages: 1000, totalConversations: 5 }),
      'u1'
    );

    const bavard = stats.achievements.find((a) => a.id === 'bavard');
    const connecteur = stats.achievements.find((a) => a.id === 'connecteur');

    expect(bavard).toMatchObject({
      isUnlocked: true,
      progress: 1,
      threshold: 1000,
      current: 1000,
    });
    expect(connecteur).toMatchObject({
      isUnlocked: false,
      progress: 0.5,
      threshold: 10,
      current: 5,
    });
    // every achievement carries the full shape iOS decodes
    for (const a of stats.achievements) {
      expect(a).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          icon: expect.any(String),
          color: expect.any(String),
          isUnlocked: expect.any(Boolean),
          progress: expect.any(Number),
          threshold: expect.any(Number),
          current: expect.any(Number),
        })
      );
    }
  });

  it('preserves legacy behavior: languagesUsed counts groupBy rows including a null group, languages drops nulls', async () => {
    const stats = await computeUserStats(
      buildPrisma({ languages: ['fr', 'en', null] }),
      'u1'
    );
    expect(stats.languages).toEqual(['fr', 'en']);
    expect(stats.languagesUsed).toBe(3);
  });

  it('treats a missing user as zero member days', async () => {
    const stats = await computeUserStats(buildPrisma({ createdAt: null }), 'u1');
    expect(stats.memberDays).toBe(0);
  });
});

// NOTE: `GET /users/:id/stats` (any user by id/username) is owned by
// `getUserStats` in routes/users/preferences.ts, NOT by userStatsRoutes — a
// second registration here collided with it (same find-my-way pattern) and
// crashed the gateway at boot with FST_ERR_DUPLICATED_ROUTE. The route-level
// tests for it therefore live with that handler; this file only covers the
// pure `computeUserStats` helper (above) and the `/users/me/stats*` family.
