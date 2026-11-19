/**
 * Le refus d'une demande d'entrée est annoncé au DEMANDEUR SEUL (#19879) :
 * `community:join-request-decided` sur sa room personnelle, et une
 * notification dans SA langue de cadrage. Rien ne dit QUI a tranché, rien ne
 * part vers l'intendant, ni vers un compte qui n'est plus utilisable.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const log = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => log }, notificationLogger: log };
});

import { announceJoinRequestRejected, scheduleJoinRequestRejected } from '../../../services/community-join-request-decided';
import { findManyIn } from '../../helpers/mongo-where';

const COMMUNITY = '507f1f77bcf86cd799439aaa';
const STEWARD = '507f1f77bcf86cd799439011';
const ANNA = '507f1f77bcf86cd799439021';
const DECIDED_AT = new Date('2026-11-19T10:00:00.000Z');
const SEVEN_DAYS_LATER = '2026-11-26T10:00:00.000Z';

type Requester = { id: string; systemLanguage: string | null; regionalLanguage: null; customDestinationLanguage: null; deviceLocale: string | null; isActive?: boolean; deletedAt?: Date };

function world(options: { community?: { name: string } | null; requester?: Requester | null; failNotification?: boolean; failDeliver?: boolean } = {}) {
  const community = options.community === undefined ? { name: 'Jardins &amp; Potagers' } : options.community;
  const requester = options.requester === undefined
    ? { id: ANNA, systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }
    : options.requester;
  const prisma = {
    community: { findFirst: jest.fn(async (_args: { where: Record<string, unknown> }) => community) },
    user: {
      findMany: jest.fn(async (args: Record<string, unknown>) =>
        findManyIn(requester === null ? [] : [{ isActive: true, ...requester }]).findMany(args)),
    },
  };
  const createNotification = jest.fn(async (_params: Record<string, unknown>) => {
    if (options.failNotification) throw new Error('boom');
    return { id: 'n1' };
  });
  const deliver = jest.fn((_userId: string, _payload: Record<string, unknown>) => {
    if (options.failDeliver) throw new Error('socket down');
  });
  return {
    prisma,
    createNotification,
    deliver,
    deps: { prisma: prisma as never, notifications: { createNotification } as never, deliver },
  };
}

const change = { communityId: COMMUNITY, userId: ANNA, decidedBy: STEWARD, decidedAt: DECIDED_AT };

describe('announceJoinRequestRejected (#19879)', () => {
  it('pose community:join-request-decided sur la room du demandeur SEUL, avec la date de la prochaine demande possible', async () => {
    const { deps, deliver } = world();

    await announceJoinRequestRejected(deps, change);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(ANNA, {
      communityId: COMMUNITY,
      decision: 'rejected',
      retryAt: SEVEN_DAYS_LATER,
      at: DECIDED_AT.toISOString(),
    });
  });

  it('notifie le demandeur dans SA langue de cadrage, la communauté nommée telle qu’écrite', async () => {
    const { deps, createNotification } = world();

    await announceJoinRequestRejected(deps, change);

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0]?.[0]).toMatchObject({
      userId: ANNA,
      type: 'community_invite',
      title: 'Jardins & Potagers',
      content: 'Your request to join Jardins & Potagers was not accepted',
      lang: 'en',
      context: { communityId: COMMUNITY, communityName: 'Jardins & Potagers' },
      metadata: { action: 'view_community' },
    });
  });

  it('ne nomme jamais l’intendant qui a tranché, ni dans la charge ni dans la notification', async () => {
    const { deps, createNotification, deliver } = world();

    await announceJoinRequestRejected(deps, change);

    const notification = createNotification.mock.calls[0]?.[0] ?? {};
    expect(notification['actor']).toBeUndefined();
    expect(JSON.stringify(notification)).not.toContain(STEWARD);
    expect(JSON.stringify(deliver.mock.calls)).not.toContain(STEWARD);
    expect(deliver.mock.calls.map((call) => call[0])).not.toContain(STEWARD);
  });

  it('descend le prisme de cadrage jusqu’à la locale appareil quand rien n’est configuré', async () => {
    const { deps, createNotification } = world({
      requester: { id: ANNA, systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'es-ES' },
    });

    await announceJoinRequestRejected(deps, change);

    expect(createNotification.mock.calls[0]?.[0]).toMatchObject({ lang: 'es', content: 'Tu solicitud para unirte a Jardins & Potagers no fue aceptada' });
  });

  it('ne notifie pas un compte qui n’est plus utilisable, mais sa room reçoit quand même l’état', async () => {
    const { deps, createNotification, deliver } = world({
      requester: { id: ANNA, systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null, deletedAt: new Date('2026-11-01T00:00:00.000Z') },
    });

    await announceJoinRequestRejected(deps, change);

    expect(createNotification).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('une communauté désactivée ou disparue entre-temps n’annonce rien', async () => {
    const { deps, createNotification, deliver, prisma } = world({ community: null });

    await announceJoinRequestRejected(deps, change);

    expect(prisma.community.findFirst.mock.calls[0]?.[0].where).toMatchObject({ id: COMMUNITY, isActive: true });
    expect(createNotification).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('une émission qui lève n’empêche pas la notification, et l’inverse', async () => {
    const socketDown = world({ failDeliver: true });
    await expect(announceJoinRequestRejected(socketDown.deps, change)).resolves.toBeUndefined();
    expect(socketDown.createNotification).toHaveBeenCalledTimes(1);

    const notificationsDown = world({ failNotification: true });
    await expect(announceJoinRequestRejected(notificationsDown.deps, change)).resolves.toBeUndefined();
    expect(notificationsDown.deliver).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleJoinRequestRejected', () => {
  it('travaille APRÈS la réponse, et n’échoue jamais vers la route', async () => {
    const { prisma, createNotification, deliver } = world();
    const queued: Array<() => Promise<void>> = [];

    scheduleJoinRequestRejected(prisma as never, change, {
      afterResponse: (work) => { queued.push(work); },
      notifications: { createNotification } as never,
      deliver,
    });

    expect(deliver).not.toHaveBeenCalled();
    await queued[0]?.();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});
