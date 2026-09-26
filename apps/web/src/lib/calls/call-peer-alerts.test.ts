import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { peerAlert, QUALITY_ALERT_TTL_MS } from './call-peer-alerts';

const ids = new Map([['p-nadia', 'u-nadia']]);
const resolve = (userId: string | null, participantId: string | null): string | null => userId ?? (participantId === null ? null : (ids.get(participantId) ?? null));

describe('les alertes d’un pair pendant l’appel (#8047)', () => {
  test('`call:quality-alert` : le lien du pair est instable, le temps que la passerelle le redise', () => {
    const alert = peerAlert(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'c1', participantId: 'p-nadia', userId: 'u-nadia', metric: 'packetLoss', value: 9, threshold: 5 }, resolve);
    expect(alert).toEqual({ callId: 'c1', userId: 'u-nadia', patch: { weakNetwork: true }, clearAfterMs: QUALITY_ALERT_TTL_MS });
  });

  test('un invité sans `userId` se retrouve par son `participantId`', () => {
    const alert = peerAlert(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'c1', participantId: 'p-nadia', metric: 'rtt', value: 400, threshold: 300 }, resolve);
    expect(alert?.userId).toBe('u-nadia');
  });

  test('`call:screen-capture-alert` : la capture commence, puis s’arrête — sans minuterie', () => {
    expect(peerAlert(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'c1', participantId: 'p-nadia', userId: 'u-nadia', isCapturing: true }, resolve)).toEqual({ callId: 'c1', userId: 'u-nadia', patch: { capturing: true }, clearAfterMs: null });
    expect(peerAlert(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'c1', participantId: 'p-nadia', userId: 'u-nadia', isCapturing: false }, resolve)?.patch).toEqual({ capturing: false });
  });

  test('une charge mal formée, un pair inconnu ou un autre événement ne rendent rien', () => {
    expect(peerAlert(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'c1', participantId: 'p-inconnu', metric: 'rtt' }, resolve)).toBeNull();
    expect(peerAlert(SERVER_EVENTS.CALL_QUALITY_ALERT, { participantId: 'p-nadia', metric: 'rtt' }, resolve)).toBeNull();
    expect(peerAlert(SERVER_EVENTS.CALL_QUALITY_ALERT, { callId: 'c1', userId: 'u-nadia', metric: 'volume' }, resolve)).toBeNull();
    expect(peerAlert(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, { callId: 'c1', userId: 'u-nadia', isCapturing: 'oui' }, resolve)).toBeNull();
    expect(peerAlert(SERVER_EVENTS.CALL_ENDED, { callId: 'c1', userId: 'u-nadia' }, resolve)).toBeNull();
  });
});
