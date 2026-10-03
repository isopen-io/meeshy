import { describe, it, expect } from 'vitest';
import {
  CALL_LIVE_FRAME_ID_MAX,
  CALL_LIVE_FRAME_TEXT_MAX,
  callLiveFrameSelectSchema,
} from '../types/call-live-frame.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../types/socketio-events.js';

const CALL_ID = '65f000000000000000000001';

describe('cadre en direct d’un appel à deux (#9214)', () => {
  it('nomme ses deux événements au format entity:action-word', () => {
    expect(CLIENT_EVENTS.CALL_FRAME_SELECT).toBe('call:frame-select');
    expect(SERVER_EVENTS.CALL_FRAME_SELECTED).toBe('call:frame-selected');
  });

  it('accepte un identifiant de cadre du catalogue, et `null` pour retirer le cadre', () => {
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: 'corporate.conseil.duo' }).success).toBe(true);
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: null }).success).toBe(true);
  });

  it('refuse un identifiant hors de la forme du catalogue ou trop long', () => {
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: '' }).success).toBe(false);
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: 'Corporate Duo' }).success).toBe(false);
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: '<script>' }).success).toBe(false);
    const long = `a.${'b'.repeat(CALL_LIVE_FRAME_ID_MAX)}`;
    expect(callLiveFrameSelectSchema.safeParse({ callId: CALL_ID, frameId: long }).success).toBe(false);
  });

  it('borne les textes partagés et refuse toute autre clé', () => {
    const fine = { callId: CALL_ID, frameId: 'jovial.fete.duo', texts: { name: 'Jacques', city: 'Lyon' } };
    expect(callLiveFrameSelectSchema.safeParse(fine).success).toBe(true);
    const tooLong = { ...fine, texts: { name: 'x'.repeat(CALL_LIVE_FRAME_TEXT_MAX + 1) } };
    expect(callLiveFrameSelectSchema.safeParse(tooLong).success).toBe(false);
    const extraText = { ...fine, texts: { name: 'Jacques', address: '1 rue X' } };
    expect(callLiveFrameSelectSchema.safeParse(extraText).success).toBe(false);
    const extraKey = { ...fine, userId: 'x' };
    expect(callLiveFrameSelectSchema.safeParse(extraKey).success).toBe(false);
  });

  it('exige un appel désigné par un ObjectId', () => {
    expect(callLiveFrameSelectSchema.safeParse({ callId: 'abc', frameId: null }).success).toBe(false);
    expect(callLiveFrameSelectSchema.safeParse({ frameId: null }).success).toBe(false);
  });

  it('rogne les textes partagés et oublie un texte vide', () => {
    const parsed = callLiveFrameSelectSchema.parse({
      callId: CALL_ID,
      frameId: 'jovial.fete.duo',
      texts: { name: '  Ana  ', city: '   ' },
    });
    expect(parsed.texts).toEqual({ name: 'Ana' });
  });
});
