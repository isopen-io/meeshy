import { describe, expect, it } from '@jest/globals';

import { buildIncomingCallPushes, type IncomingCallPushInput } from '../../../services/call-incoming-push';

const input = (overrides: Partial<IncomingCallPushInput> = {}): IncomingCallPushInput => ({
  calleeUserId: 'callee-1',
  callId: 'call-1',
  conversationId: 'conv-1',
  callerUserId: 'caller-1',
  callerName: 'Alice',
  callerAvatar: undefined,
  isVideo: false,
  language: 'fr',
  iceServersJson: '[]',
  isChinaDevice: false,
  voipCapable: true,
  conversationType: 'direct',
  isGroup: false,
  ...overrides,
});

describe('buildIncomingCallPushes', () => {
  it('rings Apple devices through CallKit and Android + web through FCM', () => {
    const [apple, fcm] = buildIncomingCallPushes(input());

    expect(apple).toMatchObject({ userId: 'callee-1', types: ['voip'], bypassDnd: true });
    expect(apple).not.toHaveProperty('platforms');
    expect(fcm).toMatchObject({ userId: 'callee-1', types: ['fcm'], platforms: ['android', 'web'], bypassDnd: true });
  });

  it('localizes the title, body and the web actions to the callee language', () => {
    const [, fcm] = buildIncomingCallPushes(input({ language: 'en', isVideo: true }));

    expect(fcm?.payload.title).toBe('Alice is calling you');
    expect(fcm?.payload.data).toMatchObject({ type: 'call', isVideo: 'true', answerLabel: 'Answer', declineLabel: 'Decline' });
  });

  it('keeps the same call data on both families, action labels aside', () => {
    const [apple, fcm] = buildIncomingCallPushes(input({ callerAvatar: 'https://a/b.png' }));
    const { answerLabel, declineLabel, ...fcmData } = fcm?.payload.data ?? {};

    expect(answerLabel).toBe('Répondre');
    expect(declineLabel).toBe('Refuser');
    expect(fcmData).toEqual(apple?.payload.data);
    expect(apple?.payload.data).toEqual({
      type: 'call',
      callId: 'call-1',
      conversationId: 'conv-1',
      callerName: 'Alice',
      callerUserId: 'caller-1',
      callerAvatar: 'https://a/b.png',
      isVideo: 'false',
      iceServers: '[]',
      conversationType: 'direct',
      isGroup: 'false',
    });
  });

  it('falls back to an APNs alert for a China-region device or one without a voip token', () => {
    expect(buildIncomingCallPushes(input({ isChinaDevice: true }))[0]?.types).toEqual(['apns']);
    expect(buildIncomingCallPushes(input({ voipCapable: false }))[0]?.types).toEqual(['apns']);
  });

  it('tells a callee woken by the push that a group call is ringing, on both families', () => {
    const pushes = buildIncomingCallPushes(input({ conversationType: 'group', isGroup: true }));

    for (const push of pushes) {
      expect(push.payload.data).toMatchObject({ conversationType: 'group', isGroup: 'true' });
      expect(push.payload.data).not.toHaveProperty('invitedBy');
    }
  });

  it('names the inviter of a person rung into a call already under way', () => {
    const pushes = buildIncomingCallPushes(
      input({ conversationType: 'direct', isGroup: true, invitedByUserId: 'caller-1' })
    );

    for (const push of pushes) {
      expect(push.payload.data).toMatchObject({ conversationType: 'direct', isGroup: 'true', invitedBy: 'caller-1' });
    }
  });
});
