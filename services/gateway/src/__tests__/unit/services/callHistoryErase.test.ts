/**
 * Effacer le journal des appels (#8066) — POUR SOI SEULEMENT. Une ligne
 * effacée porte l'identifiant de celui qui l'a effacée
 * (`CallSession.hiddenForUserIds`) ; le journal des autres membres de la
 * conversation n'en est pas touché. On n'efface qu'un appel d'une
 * conversation dont on est membre.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { clearCallHistory, hideCallFromHistory, listCallHistory } from '../../../services/calls/callHistoryList';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439022';
const CALL_ID = '507f1f77bcf86cd799439011';

const prismaWith = (callSession: Record<string, unknown>) => ({ callSession } as unknown as PrismaClient);

describe('listCallHistory', () => {
  it('ne rend jamais un appel que le lecteur a effacé de son journal', async () => {
    const findMany = jest.fn<any>().mockResolvedValueOnce([{ id: CALL_ID }]).mockResolvedValue([]);
    await listCallHistory(prismaWith({ findMany }), USER_ID, { limit: 30, filter: 'all', viewer: { userId: USER_ID, role: 'USER' } as any });
    expect(findMany.mock.calls[0][0].where.hiddenForUserIds).toEqual({ has: USER_ID });
    expect(findMany.mock.calls[1][0].where.id).toEqual({ notIn: [CALL_ID] });
    expect(findMany.mock.calls[1][0].where.NOT).toBeUndefined();
  });
});

describe('hideCallFromHistory', () => {
  it('efface l’appel pour soi quand on est membre de sa conversation', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue({ id: CALL_ID, hiddenForUserIds: [] });
    const update = jest.fn<any>().mockResolvedValue({});
    const outcome = await hideCallFromHistory(prismaWith({ findFirst, update }), USER_ID, CALL_ID);
    expect(outcome).toBe('hidden');
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: CALL_ID,
      OR: [
        { conversation: { participants: { some: { userId: USER_ID, isActive: true } } } },
        { participants: { some: { participant: { userId: USER_ID } } } },
        { invitedUserIds: { has: USER_ID } },
      ],
    });
    expect(update).toHaveBeenCalledWith({ where: { id: CALL_ID }, data: { hiddenForUserIds: { push: USER_ID } } });
  });

  it('n’écrit rien pour un appel déjà effacé', async () => {
    const update = jest.fn<any>();
    const outcome = await hideCallFromHistory(
      prismaWith({ findFirst: jest.fn<any>().mockResolvedValue({ id: CALL_ID, hiddenForUserIds: [USER_ID] }), update }),
      USER_ID,
      CALL_ID,
    );
    expect(outcome).toBe('hidden');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuse un appel d’une conversation dont on n’est pas membre', async () => {
    const update = jest.fn<any>();
    const outcome = await hideCallFromHistory(prismaWith({ findFirst: jest.fn<any>().mockResolvedValue(null), update }), USER_ID, CALL_ID);
    expect(outcome).toBe('not-found');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('clearCallHistory', () => {
  it('efface pour soi tout le journal visible (fenêtre, statuts terminaux, conversations dont on est membre)', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 4 });
    const findMany = jest.fn<any>().mockResolvedValue([{ id: CALL_ID }]);
    const cleared = await clearCallHistory(prismaWith({ findMany, updateMany }), USER_ID);
    expect(cleared).toBe(4);
    const { where, data } = updateMany.mock.calls[0][0];
    expect(data).toEqual({ hiddenForUserIds: { push: USER_ID } });
    expect(where.id).toEqual({ notIn: [CALL_ID] });
    expect(where.AND).toEqual([
      {
        OR: [
          { conversation: { participants: { some: { userId: USER_ID, isActive: true } } } },
          { participants: { some: { participant: { userId: USER_ID } } } },
          { invitedUserIds: { has: USER_ID } },
        ],
      },
    ]);
    expect(where.startedAt.gte).toBeInstanceOf(Date);
    expect(where.status.in).toEqual(['ended', 'missed', 'rejected', 'failed']);
  });
});
