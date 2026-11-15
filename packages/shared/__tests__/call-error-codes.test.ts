import { describe, it, expect } from 'vitest';
import { CALL_ERROR_CODES, type CallErrorCode } from '../types/video-call';

describe('CALL_ERROR_CODES — refus « Appels hors contacts » (#8073)', () => {
  it("nomme le refus d'un appelant hors contacts par un code stable", () => {
    const code: CallErrorCode = CALL_ERROR_CODES.CALLEE_REFUSES_NON_CONTACTS;
    expect(code).toBe('CALLEE_REFUSES_NON_CONTACTS');
  });
});
