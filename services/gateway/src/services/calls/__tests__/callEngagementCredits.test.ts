/**
 * Les points d'un appel (#8959) : 30 s connectées au moins, deux participants
 * au moins, l'initiateur « démarre », les autres « rejoignent », une tranche
 * par cinq minutes pleines — et jamais deux fois pour le même appel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  callEngagementCredits,
  creditCallEngagement,
  creditCallInvitation,
  type CallParticipation,
} from '../callEngagementCredits';

const CALL_ID = '6650000000000000000000aa';
const CONV_ID = '6650000000000000000000bb';
const ALICE = '6650000000000000000000c1';
const BOB = '6650000000000000000000c2';
const CAROL = '6650000000000000000000c3';

const T0 = new Date('2026-09-30T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const row = (participantId: string, userId: string | null, joined: number, left: number | null): CallParticipation => ({
  participantId,
  userId,
  joinedAt: at(joined),
  leftAt: left === null ? null : at(left),
});

describe('callEngagementCredits — la règle', () => {
  it('crédite l\'initiateur (démarré) et l\'appelé (rejoint), avec les tranches de 5 min pleines', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(10),
      endedAt: at(10 + 11 * 60),
      participations: [row('p-a', ALICE, 0, null), row('p-b', BOB, 10, null)],
    });

    expect(credits).toEqual([
      { userId: ALICE, operationKey: 'conversation.call_started', minuteSlices: 2 },
      { userId: BOB, operationKey: 'conversation.call_joined', minuteSlices: 2 },
    ]);
  });

  it('ancre le temps connecté sur le décroché : la sonnerie ne compte pas', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(60),
      endedAt: at(60 + 29),
      participations: [row('p-a', ALICE, 0, null), row('p-b', BOB, 60, null)],
    });

    expect(credits).toEqual([]);
  });

  it('ne crédite rien à un appel qui n\'a jamais décroché', () => {
    expect(
      callEngagementCredits({
        initiatorId: ALICE,
        answeredAt: null,
        endedAt: at(600),
        participations: [row('p-a', ALICE, 0, null), row('p-b', BOB, 0, null)],
      }),
    ).toEqual([]);
  });

  it('exige deux participants connectés 30 s — un seul ne fait pas un appel', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(0),
      endedAt: at(600),
      participations: [row('p-a', ALICE, 0, 600), row('p-b', BOB, 0, 20)],
    });

    expect(credits).toEqual([]);
  });

  it('ne crédite pas le participant resté moins de 30 s dans un appel qui a eu lieu', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(0),
      endedAt: at(600),
      participations: [row('p-a', ALICE, 0, 600), row('p-b', BOB, 0, 600), row('p-c', CAROL, 100, 110)],
    });

    expect(credits.map((credit) => credit.userId)).toEqual([ALICE, BOB]);
  });

  it('cumule les participations d\'une même personne (rejoindre après une coupure) et la crédite une fois', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(0),
      endedAt: at(700),
      participations: [row('p-a', ALICE, 0, 700), row('p-b', BOB, 0, 200), row('p-b', BOB, 250, 400)],
    });

    expect(credits).toEqual([
      { userId: ALICE, operationKey: 'conversation.call_started', minuteSlices: 2 },
      { userId: BOB, operationKey: 'conversation.call_joined', minuteSlices: 1 },
    ]);
  });

  it('compte un anonyme pour l\'éligibilité, sans le créditer', () => {
    const credits = callEngagementCredits({
      initiatorId: ALICE,
      answeredAt: at(0),
      endedAt: at(60),
      participations: [row('p-a', ALICE, 0, null), row('p-anon', null, 0, null)],
    });

    expect(credits).toEqual([{ userId: ALICE, operationKey: 'conversation.call_started', minuteSlices: 0 }]);
  });
});

function harness(options: { claimed?: boolean } = {}) {
  const prisma = {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({
        conversationId: CONV_ID,
        initiatorId: ALICE,
        answeredAt: at(0),
        endedAt: at(620),
      }),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { participantId: 'p-a', joinedAt: at(0), leftAt: null },
        { participantId: 'p-b', joinedAt: at(0), leftAt: at(620) },
      ]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'p-a', userId: ALICE },
        { id: 'p-b', userId: BOB },
      ]),
    },
  };
  const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
  const claim = { claim: jest.fn<any>().mockResolvedValue(options.claimed ?? true) };
  const run = () => creditCallEngagement({ prisma: prisma as never, engagement, claim, callId: CALL_ID });
  return { prisma, engagement, claim, run };
}

describe('creditCallEngagement — la fin d\'appel', () => {
  it('crédite chaque compte éligible par appel, avec ses tranches', async () => {
    const h = harness();
    await h.run();

    const options = { conversationId: CONV_ID, targetId: CALL_ID };
    expect(h.engagement.recordActivity.mock.calls).toEqual([
      [ALICE, 'conversation.call_started', options],
      [ALICE, 'conversation.call_minutes', options],
      [ALICE, 'conversation.call_minutes', options],
      [BOB, 'conversation.call_joined', options],
      [BOB, 'conversation.call_minutes', options],
      [BOB, 'conversation.call_minutes', options],
    ]);
    expect(h.claim.claim).toHaveBeenCalledWith(ALICE, 'conversation.call_started', `call:${CALL_ID}`, 1);
    expect(h.claim.claim).toHaveBeenCalledWith(BOB, 'conversation.call_joined', `call:${CALL_ID}`, 1);
  });

  it('ne recrédite rien quand l\'appel a déjà été crédité', async () => {
    const h = harness({ claimed: false });
    await h.run();

    expect(h.engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne lit rien de plus pour un appel jamais décroché', async () => {
    const h = harness();
    h.prisma.callSession.findUnique.mockResolvedValue({ conversationId: CONV_ID, initiatorId: ALICE, answeredAt: null, endedAt: at(30) });
    await h.run();

    expect(h.prisma.callParticipant.findMany).not.toHaveBeenCalled();
    expect(h.engagement.recordActivity).not.toHaveBeenCalled();
  });
});

describe('creditCallInvitation', () => {
  it('crédite l\'inviteur dans la conversation de l\'appel', async () => {
    const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
    creditCallInvitation({ engagement, inviterUserId: ALICE, callId: CALL_ID, conversationId: CONV_ID, onError: jest.fn() });
    await new Promise((resolve) => setImmediate(resolve));

    expect(engagement.recordActivity).toHaveBeenCalledWith(ALICE, 'conversation.call_participant_added', {
      conversationId: CONV_ID,
      targetId: CALL_ID,
    });
  });

  it('remet une panne à onError', async () => {
    const engagement = { recordActivity: jest.fn<any>().mockRejectedValue(new Error('down')) };
    const onError = jest.fn();
    creditCallInvitation({ engagement, inviterUserId: ALICE, callId: CALL_ID, conversationId: CONV_ID, onError });
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
