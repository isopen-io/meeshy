/**
 * Contre-audit 3 #14110 — l'audience sans borne (N4) : le salon global, dont
 * tout inscrit est membre, et la frontière du 29 février.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { assessReportPriority, minorBirthDateFloor } from '../../../../services/reports/reportPriority';
import { declaredAgeClass } from '@meeshy/shared/utils/age';

const hex = (n: number) => n.toString(16).padStart(24, '0');
const ADULT = new Date('1990-01-01');

function world(members: ReadonlyArray<{ userId: string; birthDate: Date }>, conversationType: string) {
  return {
    message: { findUnique: async () => ({ conversationId: hex(9), messageType: 'text', senderId: 'p0', sender: { userId: hex(100) } }) },
    conversation: { findUnique: async () => ({ id: hex(9), type: conversationType }) },
    participant: {
      findUnique: async () => ({ userId: hex(100) }),
      findFirst: async () => ({ userId: hex(100) }),
      count: async (a: any) => members.filter((m) => m.birthDate >= a.where.user.is.birthDate.gte).length,
    },
    user: { findMany: async (a: any) => (a.where.id.in as string[]).map((id) => ({ id, birthDate: ADULT })) },
    userRelation: { findUnique: async () => null },
  } as any;
}

describe('contre-audit 3 — l\'audience d\'un signalement', () => {
  it('un spam du salon global n\'est pas prioritaire parce qu\'un mineur, quelque part, est inscrit', async () => {
    const members = [...Array.from({ length: 500 }, (_, i) => ({ userId: hex(100 + i), birthDate: ADULT })), { userId: hex(999), birthDate: new Date('2012-01-01') }];
    const verdict = await assessReportPriority(world(members, 'global'), { reportedType: 'message', reportedEntityId: hex(1), reporterId: hex(101), now: new Date('2026-11-02T12:00:00Z') });
    expect(verdict.priority).toBe(0);
  });

  it('le 29 février d\'une année bissextile, né un 1er mars il y a 18 ans = encore mineur', () => {
    const now = new Date('2024-02-29T12:00:00Z');
    const birth = new Date('2006-03-01T00:00:00Z');
    expect(declaredAgeClass(birth, now)).toBe('minor');
    expect(birth.getTime() >= minorBirthDateFloor(now).getTime()).toBe(true);
  });
});
