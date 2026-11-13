import { describe, expect, it } from 'vitest';

import * as bounds from '../types/call-live-frame-bounds';
import { CALL_LIVE_FRAME_ID_MAX, CALL_LIVE_FRAME_ID_PATTERN, CALL_LIVE_FRAME_REPLIES, CALL_LIVE_FRAME_TEXT_MAX, callLiveFrameSelectSchema } from '../types/call-live-frame';

describe('les bornes du cadre en direct, sans validateur (#16943)', () => {
  it('sont les MÊMES valeurs que celles que le schéma de la frontière exécute', () => {
    expect(bounds.CALL_LIVE_FRAME_ID_MAX).toBe(CALL_LIVE_FRAME_ID_MAX);
    expect(bounds.CALL_LIVE_FRAME_TEXT_MAX).toBe(CALL_LIVE_FRAME_TEXT_MAX);
    expect(bounds.CALL_LIVE_FRAME_ID_PATTERN).toBe(CALL_LIVE_FRAME_ID_PATTERN);
    expect(bounds.CALL_LIVE_FRAME_REPLIES).toBe(CALL_LIVE_FRAME_REPLIES);
  });

  it('le schéma refuse un identifiant hors de la forme que les clients relisent', () => {
    const callId = '6650c0ffee0000000000c411';
    expect(callLiveFrameSelectSchema.safeParse({ callId, frameId: 'jovial.fete.duo' }).success).toBe(true);
    expect(bounds.CALL_LIVE_FRAME_ID_PATTERN.test('Jovial')).toBe(false);
    expect(callLiveFrameSelectSchema.safeParse({ callId, frameId: 'Jovial' }).success).toBe(false);
    expect(callLiveFrameSelectSchema.safeParse({ callId, frameId: 'a.b'.padEnd(bounds.CALL_LIVE_FRAME_ID_MAX + 1, 'c') }).success).toBe(false);
  });
});
