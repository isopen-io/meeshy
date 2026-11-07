import { describe, it, expect } from 'vitest';
import {
  CALL_CAPTURE_EVENT_KINDS,
  isCallCaptureEventKind,
  screenCaptureKindOf,
} from '../types/call-capture';

describe('screenCaptureKindOf — un kind absent se lit « recording » (#16665)', () => {
  it('lit « screenshot » quand le client le dit', () => {
    expect(screenCaptureKindOf('screenshot')).toBe('screenshot');
  });

  it('lit « recording » quand le kind est absent, comme l’envoient les clients d’avant', () => {
    expect(screenCaptureKindOf(undefined)).toBe('recording');
  });

  it('lit « recording » pour une valeur inconnue', () => {
    expect(screenCaptureKindOf('selfie')).toBe('recording');
  });
});

describe('isCallCaptureEventKind — les quatre lignes que le journal garde', () => {
  it('reconnaît les captures d’écran et les deux moments de l’enregistrement consenti', () => {
    expect(CALL_CAPTURE_EVENT_KINDS.every(isCallCaptureEventKind)).toBe(true);
    expect(CALL_CAPTURE_EVENT_KINDS).toEqual(['recording', 'screenshot', 'call-recording-started', 'call-recording-stopped']);
  });

  it('refuse une sorte inconnue', () => {
    expect(isCallCaptureEventKind('call-recording-paused')).toBe(false);
  });
});
