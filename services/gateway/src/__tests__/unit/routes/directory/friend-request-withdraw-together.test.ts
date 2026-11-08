/**
 * #17012 — retirer un lien accepté rejuge la séance « ensemble » de la paire : la coupure
 * n'attend pas la synchronisation suivante.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));
const rejudgeTogetherAfter = jest.fn(async (_params: unknown, _pair: unknown) => undefined);
jest.mock('../../../../services/together/togetherDeps', () => ({
  rejudgeTogetherAfter: (params: unknown, pair: unknown) => rejudgeTogetherAfter(params, pair),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import { AUTRE, MOI, NOW, buildRelationApp, demande, freezeClock, lien, thawClock } from '../../../helpers/relation-app';

const DIR = '/api/v1/directory';
const FR = 'aaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => { freezeClock(NOW); rejudgeTogetherAfter.mockClear(); });
afterEach(() => thawClock());

describe('#17012 — retirer un lien rejuge la séance « ensemble »', () => {
  it('l\'émetteur retire une amitié Proche acceptée : la paire est rejugée', async () => {
    const app = await buildRelationApp(async (a) => { await a.register(directoryFriendRequestsRoutes, { prefix: DIR }); }, {
      demandes: [demande(FR, 'accepted', MOI, AUTRE, { targetLevel: 'CLOSE' })],
      liens: [lien('CLOSE', 'CLOSE')],
    });
    const res = await app.call('PATCH', `${DIR}/friend-requests/${FR}`, { action: 'cancel' }, MOI);
    await app.close();

    expect(res.status).toBe(200);
    expect(rejudgeTogetherAfter).toHaveBeenCalledWith(expect.anything(), { userA: MOI, userB: AUTRE });
  });
});
