/**
 * Audit de #19080, E1 (#16188) — « restaurer pour moi » était une SIXIÈME porte
 * d'entrée, hors de `newMemberRefusal`. La règle de la paire (#12966) ne compte
 * que les membres ACTIFS : un ancien troisième membre « supprimé pour lui »
 * n'empêchait pas l'activation du chiffrement, puis redevenait actif dans le
 * tête-à-tête chiffré. Trois membres actifs : Sesame exige ses appareils, et
 * chaque envoi de la paire échouait à jamais.
 *
 * La porte passe désormais par `returningMemberRefusal` : seul un membre de la
 * paire, parti APRÈS l'activation, revient. Le témoin de l'auditeur
 * (`gw10-restore-door`) AFFIRMAIT le défaut ; il est inversé ici.
 *
 * Audit du delta (D1) : le double HONORE le `select` et ÉVALUE le `where`. Un
 * double qui rendait la ligne entière gardait vert un `select` privé de
 * `encryptionEnabledAt` — la date de départ ne décidait alors plus rien, et
 * seule la taille de la paire jugeait. La paire RÉDUITE à un membre (B parti
 * après l'activation, C, l'ancien tiers, avant) est le cas où seule la date
 * tient la règle : C ne prend pas la place de B.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';

jest.mock('../../../../routes/conversations/utils/rejoin-restored-membership', () => ({ rejoinRestoredMembership: jest.fn(async () => undefined) }));
jest.mock('../../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));
jest.mock('../../../../services/message-translation/conversationLanguageChanges', () => ({ announceConversationLanguageChange: jest.fn() }));

import { restoreConversationForMe } from '../../../../routes/conversations/restore-for-me';

const CONV = '507f1f77bcf86cd7994390c1';
const A = '507f1f77bcf86cd7994390a1';
const B = '507f1f77bcf86cd7994390b1';
const C = '507f1f77bcf86cd7994390d1';
const ENABLED = new Date('2026-11-10T00:00:00Z');
const BEFORE_ACTIVATION = new Date('2026-11-01T00:00:00Z');
const AFTER_ACTIVATION = new Date('2026-11-12T00:00:00Z');

type Select = { readonly [key: string]: boolean | { readonly select: Select } };

/** Ce que Prisma rend pour un `select` : les seules colonnes demandées, relations comprises. */
const projected = (row: MongoDocument, select: Select | undefined): MongoDocument =>
  select
    ? Object.fromEntries(Object.entries(select).flatMap(([key, wanted]) => {
        if (wanted === false) return [];
        if (wanted === true) return [[key, row[key]]];
        return [[key, row[key] === null || row[key] === undefined ? row[key] : projected(row[key] as MongoDocument, wanted.select)]];
      }))
    : { ...row };

function member(userId: string, leftAt: Date | null): MongoDocument {
  return { id: `p-${userId.slice(-2)}`, conversationId: CONV, userId, isActive: leftAt === null, deletedForMe: leftAt, bannedAt: null, language: 'fr' };
}

function restoreBy(userId: string, params: { readonly rows: MongoDocument[]; readonly encryptionMode: string | null }) {
  const conversation = {
    id: CONV, isActive: true, communityId: null, type: 'direct',
    encryptionMode: params.encryptionMode, encryptionEnabledAt: params.encryptionMode ? ENABLED : null,
  };
  const withConversation = (row: MongoDocument): MongoDocument => ({ ...row, conversation });
  const update = jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
    const row = params.rows.find((candidate) => matchesMongoWhere(candidate, where));
    if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
    return Object.assign(row, data);
  });
  const prisma = {
    participant: {
      findFirst: jest.fn(async ({ where, select }: { where: MongoDocument; select?: Select }) => {
        const row = params.rows.find((candidate) => matchesMongoWhere(candidate, where));
        return row ? projected(withConversation(row), select) : null;
      }),
      findMany: jest.fn(async ({ where, select }: { where: MongoDocument; select?: Select }) =>
        params.rows.filter((candidate) => matchesMongoWhere(candidate, where)).map((row) => projected(row, select))),
      update,
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
    update,
    activeUserIds: () => params.rows.filter((row) => row.isActive).map((row) => row.userId),
  };
}

describe('« restaurer pour moi » dans un tête-à-tête chiffré de bout en bout (#16188, E1)', () => {
  it('un ancien troisième membre ne redevient pas actif : 409 E2EE_DIRECT_STAYS_A_PAIR, rien d’écrit', async () => {
    const door = restoreBy(C, { rows: [member(A, null), member(B, null), member(C, BEFORE_ACTIVATION)], encryptionMode: 'e2ee' });

    await door.run();

    expect(door.sent.code).toBe(409);
    expect(door.sent.body).toMatchObject({ success: false, code: E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR });
    expect(door.update).not.toHaveBeenCalled();
    expect(door.activeUserIds()).toEqual([A, B]);
  });

  it('paire réduite à un membre : l’ancien tiers, parti AVANT l’activation, ne prend pas la place de celui parti APRÈS', async () => {
    const door = restoreBy(C, { rows: [member(A, null), member(B, AFTER_ACTIVATION), member(C, BEFORE_ACTIVATION)], encryptionMode: 'e2ee' });

    await door.run();

    expect(door.sent.code).toBe(409);
    expect(door.sent.body).toMatchObject({ code: E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR });
    expect(door.update).not.toHaveBeenCalled();
    expect(door.activeUserIds()).toEqual([A]);
  });

  it('un membre de la paire, parti après l’activation, revient — même à côté de l’ancien tiers (contrôle)', async () => {
    const door = restoreBy(B, { rows: [member(A, null), member(B, AFTER_ACTIVATION), member(C, BEFORE_ACTIVATION)], encryptionMode: 'e2ee' });

    await door.run();

    expect(door.sent.code ?? 200).toBe(200);
    expect(door.activeUserIds()).toEqual([A, B]);
  });

  it('un tête-à-tête en clair rend sa place à son ancien troisième membre, comme avant (contrôle)', async () => {
    const door = restoreBy(C, { rows: [member(A, null), member(B, null), member(C, BEFORE_ACTIVATION)], encryptionMode: null });

    await door.run();

    expect(door.sent.code ?? 200).toBe(200);
    expect(door.activeUserIds()).toEqual([A, B, C]);
  });
});
