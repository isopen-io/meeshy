/**
 * call-push-mirroring — politique des pushes silencieux d'appel
 * (audit appels 2026-07-11, findings #2 et #3)
 *
 * #2 : les pushes `call_cancel` et `call_answered_elsewhere` étaient
 * hardcodés `types:['apns'], platforms:['ios']` — un device Android
 * backgrounded (socket mort) ne recevait jamais le stop-ring et sonnait
 * dans le vide. La politique devient cross-platform mobile (apns+fcm,
 * ios+android), web exclu (pas de sonnerie background côté web).
 *
 * #3 : le prédicat du mirror answered-elsewhere est extrait en fonction
 * pure pour être appliqué à l'IDENTIQUE dans les deux branches du relais
 * d'answer (sockets appelant présents OU absents — cf. early return
 * TARGET_NOT_FOUND qui sautait le push).
 */

import {
  buildCallSilentPush,
  shouldMirrorAnsweredElsewhere,
} from '../services/call-push-mirroring';

describe('buildCallSilentPush', () => {
  it('targets BOTH mobile platforms (apns+fcm, ios+android) — never web', () => {
    const push = buildCallSilentPush({
      userId: 'user-1',
      type: 'call_cancel',
      callId: 'call-1',
    });

    expect(push.types).toEqual(['apns', 'fcm']);
    expect(push.platforms).toEqual(['ios', 'android']);
    expect(push.platforms).not.toContain('web');
  });

  it('builds a silent DND-bypassing payload carrying type and callId', () => {
    const push = buildCallSilentPush({
      userId: 'user-9',
      type: 'call_answered_elsewhere',
      callId: 'call-42',
    });

    expect(push.userId).toBe('user-9');
    expect(push.bypassDnd).toBe(true);
    expect(push.payload).toEqual({
      title: '',
      body: '',
      silent: true,
      data: { type: 'call_answered_elsewhere', callId: 'call-42' },
    });
  });
});

describe('shouldMirrorAnsweredElsewhere', () => {
  const base = {
    signalType: 'answer',
    answererUserId: 'callee-1',
    initiatorId: 'caller-1',
    alreadyAnswered: false,
  };

  it('mirrors the FIRST answer of a callee', () => {
    expect(shouldMirrorAnsweredElsewhere(base)).toBe(true);
  });

  it('never mirrors a non-answer signal (offer, ice, ice-restart)', () => {
    expect(shouldMirrorAnsweredElsewhere({ ...base, signalType: 'offer' })).toBe(false);
    expect(shouldMirrorAnsweredElsewhere({ ...base, signalType: 'ice' })).toBe(false);
    expect(shouldMirrorAnsweredElsewhere({ ...base, signalType: 'ice-restart' })).toBe(false);
  });

  it("never mirrors the initiator's own answer (renegotiation)", () => {
    expect(
      shouldMirrorAnsweredElsewhere({ ...base, answererUserId: 'caller-1' })
    ).toBe(false);
  });

  it('never mirrors a LATER answer (video upgrade renegotiation)', () => {
    expect(
      shouldMirrorAnsweredElsewhere({ ...base, alreadyAnswered: true })
    ).toBe(false);
  });
});
