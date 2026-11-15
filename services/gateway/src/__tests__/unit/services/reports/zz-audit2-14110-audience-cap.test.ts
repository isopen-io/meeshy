/**
 * Contre-audit #14110 (M2) — la borne de 50 membres décide-t-elle de la priorité ?
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { assessReportPriority } from '../../../../services/reports/reportPriority';

const hex = (n: number) => n.toString(16).padStart(24, '0');
const REPORTER = hex(1);
const AUTHOR = hex(2);
const MINOR = hex(999);
const MESSAGE_ID = hex(5000);
const CONVERSATION_ID = hex(6000);

const ADULT_BIRTH = new Date('1990-01-01');
const MINOR_BIRTH = new Date('2013-01-01');

// Adapté (#14110, N4) : l'audience se lit par un seul `count` filtré sur la date de naissance — le double l'évalue sur TOUS les membres.
it('un mineur arrivé 51e dans le groupe rend le signalement prioritaire', async () => {
  const members = [...Array.from({ length: 50 }, (_, i) => ({ userId: hex(100 + i), birthDate: ADULT_BIRTH })), { userId: MINOR, birthDate: MINOR_BIRTH }];
  const prisma = {
    message: { findUnique: async () => ({ senderId: hex(7000), conversationId: CONVERSATION_ID, messageType: 'text' }) },
    // Adapté (#14627, audit 3 M2) : l'audience ne se compte que hors salons global, public et diffusion — le type se lit.
    conversation: { findUnique: async () => ({ id: CONVERSATION_ID, type: 'group' }) },
    participant: {
      findUnique: async () => ({ userId: AUTHOR }),
      findMany: async (a: any) => members.slice(0, a.take ?? members.length),
      count: async (a: any) => members.filter((m) => m.birthDate >= a.where.user.is.birthDate.gte).length,
    },
    user: { findMany: async (a: any) => (a.where.id.in as string[]).map((id) => ({ id, birthDate: id === MINOR ? MINOR_BIRTH : ADULT_BIRTH })) },
    userRelation: { findUnique: async () => null },
  } as any;
  const verdict = await assessReportPriority(prisma, { reportedType: 'message', reportedEntityId: MESSAGE_ID, reporterId: REPORTER, now: new Date('2026-11-02') });
  expect(verdict).toEqual({ priority: 1, priorityReasons: ['minor'] });
});
