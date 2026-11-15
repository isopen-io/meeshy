/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../services/participantRights';
import { acceptMessageRequest, answerMessageRequest, requesterPermissionsFor } from '../../services/messaging/messageRequests';
import { ADULT_BIRTH, messagingWorld } from '../helpers/messaging-circle-world';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const OLD = new Date('2025-01-01T00:00:00.000Z');
const A = '6400000000000000000000a1';
const B = '6400000000000000000000a2';
const C = '6400000000000000000000a3';
const DM = '6400000000000000000000d1';
const G = '6400000000000000000000d2';

const monde = () =>
  messagingWorld({
    users: [
      { id: A, birthDate: ADULT_BIRTH, createdAt: OLD },
      { id: B, birthDate: ADULT_BIRTH, createdAt: OLD },
      { id: C, birthDate: ADULT_BIRTH, createdAt: OLD },
    ],
    conversations: [{ id: DM, type: 'direct' }, { id: G, type: 'group' }],
    participants: [
      { id: 'pa', conversationId: DM, userId: A, role: 'creator', isActive: true, permissions: requesterPermissionsFor({ kind: 'request', risk: 10, recipientMinor: false }, { ...FOUNDING_MEMBER_PERMISSIONS }) },
      { id: 'pb', conversationId: DM, userId: B, role: 'member', isActive: true, permissions: { ...FOUNDING_MEMBER_PERMISSIONS }, messageRequestAt: new Date('2026-11-01T00:00:00.000Z'), messageRequestRisk: 10, messageRequestFromId: A },
      { id: 'ga', conversationId: G, userId: A, role: 'admin', isActive: false, permissions: {} },
      { id: 'gc', conversationId: G, userId: C, role: 'creator', isActive: true, permissions: {} },
      { id: 'gb', conversationId: G, userId: B, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T00:00:00.000Z'), messageRequestRisk: 10, messageRequestFromId: A },
    ],
  });

describe('audit 3 #14107 — une demande ne doit jamais rester sans issue', () => {
  it('DM : le destinataire répond (ancien client), puis l\'expéditeur ne doit pas rester privé de médias pour toujours', async () => {
    const world = monde();
    const prisma = world.prisma as unknown as PrismaClient;
    await answerMessageRequest(prisma, { conversationId: DM, userId: B, now: NOW });
    const accepted = await acceptMessageRequest(prisma, { conversationId: DM, userId: B, now: NOW });
    const sender = world.participant.rows.find((p) => p.id === 'pa') as { permissions: Record<string, boolean> };
    expect({ accepted: accepted.kind, canSendImages: sender.permissions.canSendImages }).not.toEqual({ accepted: 'not-pending', canSendImages: false });
  });

  it('groupe : celui qui a fait entrer est parti — Accepter doit lever la demande', async () => {
    const world = monde();
    const prisma = world.prisma as unknown as PrismaClient;
    await acceptMessageRequest(prisma, { conversationId: G, userId: B, now: NOW });
    const row = world.participant.rows.find((p) => p.id === 'gb') as { messageRequestAt: Date | null };
    expect(row.messageRequestAt).toBeNull();
  });
});
