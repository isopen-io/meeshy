/**
 * L'activité d'un lien en temps réel (#19446) : la room du propriétaire seule,
 * des totaux absolus, aucun visiteur, au plus une émission par seconde et par lien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { createLinkActivityRelay, SHARE_LINK_ARRIVALS_MAX, type LinkActivityScheduler } from '../../../socketio/linkActivityEvents';

function makeIO() {
  const byRoom = new Map<string, { emit: jest.Mock<any> }>();
  const io = {
    to: jest.fn((room: string) => {
      const known = byRoom.get(room);
      if (known) return known;
      const target = { emit: jest.fn<any>() };
      byRoom.set(room, target);
      return target;
    }),
  };
  return { io, rooms: () => [...byRoom.keys()], emitsTo: (room: string) => byRoom.get(room)?.emit.mock.calls ?? [] };
}

function makeScheduler() {
  const deferred: (() => void)[] = [];
  const timers: (() => void)[] = [];
  const scheduler: LinkActivityScheduler = {
    defer: (run) => { deferred.push(run); },
    after: (_ms, run) => { timers.push(run); },
  };
  return {
    scheduler,
    flushDeferred: () => deferred.splice(0).forEach((run) => run()),
    elapse: () => timers.splice(0).forEach((run) => run()),
  };
}

const LINK = {
  token: 'a1b2c3', createdBy: 'u-owner', totalClicks: 1284, uniqueClicks: 900,
  lastClickedAt: new Date('2026-11-17T10:00:00.000Z'), originalUrl: 'https://exemple.fr', id: 'tl-1',
};
const CLICK = { country: 'FR', ipAddress: '203.0.113.9', deviceFingerprint: 'fp', participantId: 'visitor-1', clickedAt: new Date('2026-11-17T10:00:00.000Z') };

describe('createLinkActivityRelay', () => {
  it("pose les compteurs ABSOLUS d'un lien de suivi dans la seule room de son créateur, sans rien du visiteur", () => {
    const { io, rooms, emitsTo } = makeIO();
    const { scheduler, flushDeferred } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });

    relay.trackingLinkClicked({ link: LINK, click: CLICK });
    expect(rooms()).toEqual([]);
    flushDeferred();

    expect(rooms()).toEqual(['user:u-owner']);
    expect(emitsTo('user:u-owner')).toEqual([[
      'tracking-link:clicked',
      { token: 'a1b2c3', totalClicks: 1284, uniqueClicks: 900, lastClickedAt: '2026-11-17T10:00:00.000Z', country: 'FR' },
    ]]);
  });

  it("ne dit rien d'un lien de suivi sans créateur", () => {
    const { io, rooms } = makeIO();
    const { scheduler, flushDeferred } = makeScheduler();
    createLinkActivityRelay({ io: () => io, scheduler }).trackingLinkClicked({ link: { ...LINK, createdBy: null }, click: CLICK });
    flushDeferred();
    expect(rooms()).toEqual([]);
  });

  it('regroupe une rafale : la première part, la dernière part à la fin de la fenêtre, celles du milieu se taisent', () => {
    const { io, emitsTo } = makeIO();
    const { scheduler, flushDeferred, elapse } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });

    relay.trackingLinkClicked({ link: { ...LINK, totalClicks: 1 }, click: CLICK });
    flushDeferred();
    relay.trackingLinkClicked({ link: { ...LINK, totalClicks: 2 }, click: CLICK });
    relay.trackingLinkClicked({ link: { ...LINK, totalClicks: 3 }, click: { ...CLICK, country: null } });
    flushDeferred();
    expect(emitsTo('user:u-owner').map(([, data]) => data.totalClicks)).toEqual([1]);

    elapse();
    expect(emitsTo('user:u-owner').map(([, data]) => [data.totalClicks, data.country])).toEqual([[1, 'FR'], [3, null]]);

    elapse();
    relay.trackingLinkClicked({ link: { ...LINK, totalClicks: 4 }, click: CLICK });
    flushDeferred();
    expect(emitsTo('user:u-owner').map(([, data]) => data.totalClicks)).toEqual([1, 3, 4]);
  });

  it("ne regroupe pas deux liens différents", () => {
    const { io, emitsTo } = makeIO();
    const { scheduler, flushDeferred } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });
    relay.trackingLinkClicked({ link: LINK, click: CLICK });
    relay.trackingLinkClicked({ link: { ...LINK, token: 'zzz999' }, click: CLICK });
    flushDeferred();
    expect(emitsTo('user:u-owner').map(([, data]) => data.token)).toEqual(['a1b2c3', 'zzz999']);
  });

  it("annonce une arrivée au créateur et aux gestionnaires, une fois chacun, sans nom ni compte de l'arrivant", () => {
    const { io, rooms, emitsTo } = makeIO();
    const { scheduler, flushDeferred } = makeScheduler();
    createLinkActivityRelay({ io: () => io, scheduler }).shareLinkArrival({
      recipientIds: ['u-creator', 'u-mod', 'u-creator'],
      linkId: 'mshy_abc', currentUses: 23, maxUses: 50,
      arrival: { participantId: 'p-1', isAnonymous: true, country: null, joinedAt: new Date('2026-11-17T10:00:00.000Z'), displayName: 'Ana', userId: 'u-x' } as never,
    });
    flushDeferred();
    expect(rooms().sort()).toEqual(['user:u-creator', 'user:u-mod']);
    expect(emitsTo('user:u-mod')).toEqual([[
      'share-link:arrival',
      {
        linkId: 'mshy_abc', currentUses: 23, maxUses: 50,
        arrival: { participantId: 'p-1', isAnonymous: true, country: null, joinedAt: '2026-11-17T10:00:00.000Z' },
        arrivals: [{ participantId: 'p-1', isAnonymous: true, country: null, joinedAt: '2026-11-17T10:00:00.000Z' }],
        arrivalsTruncated: false,
      },
    ]]);
  });

  it("trois arrivées dans la fenêtre : AUCUNE n'est perdue — la première part seule, les deux suivantes partent ensemble à la fin", () => {
    const { io, emitsTo } = makeIO();
    const { scheduler, flushDeferred, elapse } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });
    const arrive = (n: number) => relay.shareLinkArrival({
      recipientIds: ['u-creator'], linkId: 'mshy_abc', currentUses: n, maxUses: null,
      arrival: { participantId: `p-${n}`, isAnonymous: false, country: 'SN', joinedAt: new Date(Date.UTC(2026, 10, 17, 10, 0, n)) },
    });

    arrive(1);
    flushDeferred();
    arrive(2);
    arrive(3);
    flushDeferred();
    elapse();

    const charges = emitsTo('user:u-creator').map(([, data]) => data);
    expect(charges.map((c) => c.arrivals.map((a: { participantId: string }) => a.participantId))).toEqual([['p-1'], ['p-2', 'p-3']]);
    expect(charges.map((c) => c.arrival.participantId)).toEqual(['p-1', 'p-3']);
    expect(charges.map((c) => c.currentUses)).toEqual([1, 3]);
    expect(charges.every((c) => c.arrivalsTruncated === false)).toBe(true);
  });

  it("une rafale au-delà de la borne : les plus récentes partent, et la charge dit au client de relire la liste", () => {
    const { io, emitsTo } = makeIO();
    const { scheduler, flushDeferred, elapse } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });
    const arrive = (n: number) => relay.shareLinkArrival({
      recipientIds: ['u-creator'], linkId: 'mshy_abc', currentUses: n, maxUses: null,
      arrival: { participantId: `p-${n}`, isAnonymous: true, country: null, joinedAt: new Date(Date.UTC(2026, 10, 17, 10, 0, 0, n)) },
    });
    arrive(0);
    flushDeferred();
    Array.from({ length: SHARE_LINK_ARRIVALS_MAX + 5 }, (_, i) => arrive(i + 1));
    flushDeferred();
    elapse();

    const last = emitsTo('user:u-creator').map(([, data]) => data).at(-1);
    expect(last.arrivals).toHaveLength(SHARE_LINK_ARRIVALS_MAX);
    expect(last.arrivals.at(-1).participantId).toBe(`p-${SHARE_LINK_ARRIVALS_MAX + 5}`);
    expect(last.arrivalsTruncated).toBe(true);
  });

  it("annonce une entrée de communauté à ses intendants et un filleul à son parrain", () => {
    const { io, emitsTo } = makeIO();
    const { scheduler, flushDeferred } = makeScheduler();
    const relay = createLinkActivityRelay({ io: () => io, scheduler });
    relay.communityLinkEntry({ recipientIds: ['u-admin'], communityId: 'c-1', linkId: 'mshy', entries: 4, at: new Date('2026-11-17T10:00:00.000Z') });
    relay.affiliateReferralJoined({ sponsorId: 'u-sponsor', tokenId: 't-1', referralCount: 14 });
    flushDeferred();
    expect(emitsTo('user:u-admin')).toEqual([['community-link:entry', { communityId: 'c-1', linkId: 'mshy', entries: 4, at: '2026-11-17T10:00:00.000Z' }]]);
    expect(emitsTo('user:u-sponsor')).toEqual([['affiliate:referral-joined', { tokenId: 't-1', referralCount: 14 }]]);
  });

  it("n'échoue jamais : un serveur socket absent ou qui lève est sans effet", () => {
    const { scheduler, flushDeferred } = makeScheduler();
    createLinkActivityRelay({ io: () => undefined, scheduler }).trackingLinkClicked({ link: LINK, click: CLICK });
    const throwing = { to: () => { throw new Error('adaptateur'); } };
    createLinkActivityRelay({ io: () => throwing as never, scheduler }).trackingLinkClicked({ link: LINK, click: CLICK });
    expect(flushDeferred).not.toThrow();
  });
});
