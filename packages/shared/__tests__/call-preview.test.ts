import { describe, it, expect } from 'vitest';
import { callPreviewRequestSchema } from '../types/call-preview.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../types/socketio-events.js';

const CALL_ID = '65f000000000000000000001';

describe('aperçu avant décroché (#8480)', () => {
  it('nomme ses événements au format entity:action-word, distincts de call:signal', () => {
    expect(CLIENT_EVENTS.CALL_PREVIEW_REQUEST).toBe('call:preview-request');
    expect(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL).toBe('call:preview-signal');
    expect(SERVER_EVENTS.CALL_PREVIEW_REQUESTED).toBe('call:preview-requested');
    expect(SERVER_EVENTS.CALL_PREVIEW_SIGNAL).toBe('call:preview-signal');
    expect(CLIENT_EVENTS.CALL_PREVIEW_SIGNAL).not.toBe(CLIENT_EVENTS.CALL_SIGNAL);
  });

  it('une demande d’aperçu ne nomme qu’un appel', () => {
    expect(callPreviewRequestSchema.safeParse({ callId: CALL_ID }).success).toBe(true);
    expect(callPreviewRequestSchema.safeParse({ callId: 'x' }).success).toBe(false);
    expect(callPreviewRequestSchema.safeParse({ callId: CALL_ID, userId: CALL_ID }).success).toBe(false);
  });
});
