import { describe, expect, it } from 'vitest';
import { FORWARD_REFUSAL_CODES, isForwardRefusalCode } from '../forward-refusal.js';

describe('FORWARD_REFUSAL_CODES — le motif stable d’un transfert refusé (#9598)', () => {
  it('garde les trois motifs que le web lit déjà comme `code` (rétrocompatible)', () => {
    expect(FORWARD_REFUSAL_CODES.VIEW_ONCE).toBe('view-once-not-forwardable');
    expect(FORWARD_REFUSAL_CODES.EPHEMERAL).toBe('ephemeral-not-forwardable');
    expect(FORWARD_REFUSAL_CODES.SOURCE_UNAVAILABLE).toBe('forward-source-unavailable');
  });

  it('nomme les deux refus neufs : la source chiffrée (D7) et la pièce étrangère (#9914)', () => {
    expect(FORWARD_REFUSAL_CODES.ENCRYPTED_SOURCE).toBe('encrypted-source-not-server-copyable');
    expect(FORWARD_REFUSAL_CODES.ATTACHMENT_NOT_IN_SOURCE).toBe('forwarded-attachment-not-in-source');
  });

  it('reconnaît chaque code et rien d’autre', () => {
    Object.values(FORWARD_REFUSAL_CODES).forEach((code) => expect(isForwardRefusalCode(code)).toBe(true));
    expect(isForwardRefusalCode('Un message à vue unique ne peut pas être transféré')).toBe(false);
    expect(isForwardRefusalCode(undefined)).toBe(false);
    expect(isForwardRefusalCode(42)).toBe(false);
  });
});
