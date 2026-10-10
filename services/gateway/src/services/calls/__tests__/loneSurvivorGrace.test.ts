import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { LoneSurvivorGrace, abandonedCallOf, loneSurvivorOf, type AbandonedCall, type LoneSurvivor, type LoneSurvivorCall } from '../loneSurvivorGrace';

const ANSWERED = new Date('2026-10-02T10:00:00Z');
const GRACE_MS = 60_000;

function row(userId: string, leftAt: Date | null = null) {
  return { id: `row-${userId}-${leftAt?.getTime() ?? 'live'}`, participantId: `p-${userId}`, leftAt, participant: { userId } };
}

function groupCall(participants: LoneSurvivorCall['participants'], overrides: Partial<LoneSurvivorCall> = {}): LoneSurvivorCall {
  return { id: 'call-1', status: 'active', answeredAt: ANSWERED, conversation: { type: 'group' }, participants, ...overrides };
}

describe('loneSurvivorOf — le dernier participant d’un appel de groupe (#9109)', () => {
  it('rend le seul actif et le dernier parti', () => {
    const call = groupCall([row('a'), row('b', new Date('2026-10-02T10:01:00Z')), row('c', new Date('2026-10-02T10:02:00Z'))]);
    expect(loneSurvivorOf(call)).toEqual({ callId: 'call-1', userId: 'a', participantId: 'p-a', lastLeaverUserId: 'c' });
  });

  it('rien tant que deux participants restent', () => {
    expect(loneSurvivorOf(groupCall([row('a'), row('b'), row('c', ANSWERED)]))).toBeNull();
  });

  it('rien pour un appel direct, jamais décroché ou déjà terminé', () => {
    const departed = [row('a'), row('b', ANSWERED)];
    expect(loneSurvivorOf(groupCall(departed, { conversation: { type: 'direct' } }))).toBeNull();
    expect(loneSurvivorOf(groupCall(departed, { answeredAt: null }))).toBeNull();
    expect(loneSurvivorOf(groupCall(departed, { status: 'ended' }))).toBeNull();
  });

  it('rien quand le seul actif n’a vu partir que ses propres anciennes lignes', () => {
    expect(loneSurvivorOf(groupCall([row('a'), row('a', ANSWERED)]))).toBeNull();
  });
});

describe('abandonedCallOf — un appel décroché que tous ont quitté en même temps', () => {
  it('rend le dernier parti quand plus personne n’est actif', () => {
    const call = groupCall([row('a', new Date('2026-10-02T10:01:00Z')), row('b', new Date('2026-10-02T10:01:00.050Z'))]);
    expect(abandonedCallOf(call)).toEqual({ callId: 'call-1', lastLeaverUserId: 'b' });
  });

  it('rien tant qu’un participant reste, ni pour un appel jamais décroché ou terminé', () => {
    const empty = [row('a', ANSWERED), row('b', ANSWERED)];
    expect(abandonedCallOf(groupCall([row('a'), row('b', ANSWERED)]))).toBeNull();
    expect(abandonedCallOf(groupCall(empty, { answeredAt: null }))).toBeNull();
    expect(abandonedCallOf(groupCall(empty, { status: 'ended' }))).toBeNull();
    expect(abandonedCallOf(groupCall(empty, { endedAt: ANSWERED }))).toBeNull();
  });
});

describe('LoneSurvivorGrace — la fin attend la grâce de reprise', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(read: () => LoneSurvivorCall | null) {
    const endFor = jest.fn<(survivor: LoneSurvivor) => Promise<void>>().mockResolvedValue(undefined);
    const endAbandoned = jest.fn<(abandoned: AbandonedCall) => Promise<void>>().mockResolvedValue(undefined);
    const grace = new LoneSurvivorGrace({ graceMs: GRACE_MS, readCall: async () => read(), endFor, endAbandoned, onError: jest.fn() });
    return { grace, endFor, endAbandoned };
  }

  it('termine après la grâce l’appel que les derniers ont quitté ensemble, sans retour', async () => {
    const { grace, endFor, endAbandoned } = setup(() => groupCall([row('a', ANSWERED), row('b', ANSWERED)]));
    grace.arm('call-1');

    await jest.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(endAbandoned).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2);
    expect(endAbandoned).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call-1' }));
    expect(endFor).not.toHaveBeenCalled();
  });

  it('un retour pendant la grâce garde l’appel que tous avaient quitté', async () => {
    const { grace, endAbandoned } = setup(() => groupCall([row('a', ANSWERED), row('b', ANSWERED), row('b')]));
    grace.arm('call-1');

    await jest.advanceTimersByTimeAsync(GRACE_MS + 1);
    expect(endAbandoned).not.toHaveBeenCalled();
  });

  it('finit l’appel pour le dernier après la grâce, sans retour', async () => {
    const { grace, endFor } = setup(() => groupCall([row('a'), row('b', ANSWERED)]));
    grace.arm('call-1');

    await jest.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(endFor).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2);
    expect(endFor).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a', lastLeaverUserId: 'b' }));
  });

  it('un retour pendant la grâce garde l’appel', async () => {
    const { grace, endFor } = setup(() => groupCall([row('a'), row('b', ANSWERED), row('b')]));
    grace.arm('call-1');

    await jest.advanceTimersByTimeAsync(GRACE_MS + 1);
    expect(endFor).not.toHaveBeenCalled();
  });

  it('un nouveau départ repart de zéro', async () => {
    const { grace, endFor } = setup(() => groupCall([row('a'), row('b', ANSWERED)]));
    grace.arm('call-1');
    await jest.advanceTimersByTimeAsync(GRACE_MS / 2);
    grace.arm('call-1');

    await jest.advanceTimersByTimeAsync(GRACE_MS / 2 + 1);
    expect(endFor).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(GRACE_MS / 2);
    expect(endFor).toHaveBeenCalledTimes(1);
  });

  it('destroy coupe toute échéance', async () => {
    const { grace, endFor } = setup(() => groupCall([row('a'), row('b', ANSWERED)]));
    grace.arm('call-1');
    grace.destroy();

    await jest.advanceTimersByTimeAsync(GRACE_MS + 1);
    expect(endFor).not.toHaveBeenCalled();
  });
});
