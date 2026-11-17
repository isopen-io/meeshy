/**
 * Audit de #19080, E1 (#16188) — « restaurer pour moi » était une SIXIÈME porte
 * d'entrée, hors de `newMemberRefusal`. La règle de la paire (#12966) ne compte
 * que les membres ACTIFS : un ancien troisième membre « supprimé pour lui »
 * n'empêchait pas l'activation du chiffrement, puis redevenait actif dans le
 * tête-à-tête chiffré. Trois membres actifs : Sesame exige ses appareils, et
 * chaque envoi de la paire échouait à jamais.
 *
 * La porte passe désormais par `returningMemberRefusal` : seul un membre de la
 * paire, parti après l'activation, revient. Le témoin de l'auditeur
 * (`gw10-restore-door`) AFFIRMAIT le défaut ; il est inversé ici.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';

jest.mock('../../../../routes/conversations/utils/rejoin-restored-membership', () => ({ rejoinRestoredMembership: jest.fn(async () => undefined) }));
jest.mock('../../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));
jest.mock('../../../../services/message-translation/conversationLanguageChanges', () => ({ announceConversationLanguageChange: jest.fn() }));

import { restoreConversationForMe } from '../../../../routes/conversations/restore-for-me';

const CONV = '507f1f77bcf86cd7994390c1';
const A = '507f1f77bcf86cd7994390a1';
const B = '507f1f77bcf86cd7994390b1';
const C = '507f1f77bcf86cd7994390d1';
const ENABLED = new Date('2026-11-10T00:00:00Z');

type Row = { id: string; userId: string; isActive: boolean; deletedForMe: Date | null };

function restoreBy(userId: string, params: { readonly rows: Row[]; readonly encryptionMode: string | null }) {
  const conversation = { isActive: true, communityId: null, type: 'direct', encryptionMode: params.encryptionMode, encryptionEnabledAt: params.encryptionMode ? ENABLED : null };
  const prisma = {
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { userId?: string; id?: string } }) => {
        const row = params.rows.find((candidate) => candidate.userId === where.userId || candidate.id === where.id);
        return row ? { ...row, bannedAt: null, language: 'fr', conversation } : null;
      }),
      findMany: jest.fn(async () => params.rows.filter((row) => row.isActive).map((row) => ({ userId: row.userId }))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) =>
        Object.assign(params.rows.find((row) => row.id === where.id)!, data)),
    },
    community: { findFirst: jest.fn(async () => null) },
  };
  const sent: { code?: number; body?: unknown } = {};
  const reply: Record<string, unknown> = {};
  Object.assign(reply, {
    code: (code: number) => { sent.code = code; return reply; },
    status: (code: number) => { sent.code = code; return reply; },
    header: () => reply,
    send: (body: unknown) => { sent.body = body; return reply; },
  });
  const request = { params: { conversationId: CONV }, authContext: { userId, isAnonymous: false } };
  return {
    run: () => restoreConversationForMe({ fastify: {} as never, prisma: prisma as never }, request as never, reply as never),
    sent,
    prisma,
    activeUserIds: () => params.rows.filter((row) => row.isActive).map((row) => row.userId),
  };
}

const pairWithAFormerThird = (): Row[] => [
  { id: 'pa', userId: A, isActive: true, deletedForMe: null },
  { id: 'pb', userId: B, isActive: true, deletedForMe: null },
  { id: 'pc', userId: C, isActive: false, deletedForMe: new Date('2026-11-01T00:00:00Z') },
];

describe('« restaurer pour moi » dans un tête-à-tête chiffré de bout en bout (#16188, E1)', () => {
  it('un ancien troisième membre ne redevient pas actif : 409 E2EE_DIRECT_STAYS_A_PAIR, rien d’écrit', async () => {
    const door = restoreBy(C, { rows: pairWithAFormerThird(), encryptionMode: 'e2ee' });

    await door.run();

    expect(door.sent.code).toBe(409);
    expect(door.sent.body).toMatchObject({ success: false, code: E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR });
    expect(door.prisma.participant.update).not.toHaveBeenCalled();
    expect(door.activeUserIds()).toEqual([A, B]);
  });

  it('un membre de la paire, parti après l’activation, revient (contrôle)', async () => {
    const rows: Row[] = [
      { id: 'pa', userId: A, isActive: true, deletedForMe: null },
      { id: 'pb', userId: B, isActive: false, deletedForMe: new Date('2026-11-12T00:00:00Z') },
    ];
    const door = restoreBy(B, { rows, encryptionMode: 'e2ee' });

    await door.run();

    expect(door.sent.code ?? 200).toBe(200);
    expect(door.activeUserIds()).toEqual([A, B]);
  });

  it('un tête-à-tête en clair rend sa place à son ancien troisième membre, comme avant (contrôle)', async () => {
    const door = restoreBy(C, { rows: pairWithAFormerThird(), encryptionMode: null });

    await door.run();

    expect(door.sent.code ?? 200).toBe(200);
    expect(door.activeUserIds()).toEqual([A, B, C]);
  });
});
