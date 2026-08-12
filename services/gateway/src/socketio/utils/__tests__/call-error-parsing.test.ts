import { describe, it, expect } from '@jest/globals';
import { callErrorMessageOf, parseCallHandlerError } from '../call-error-parsing';

describe('callErrorMessageOf', () => {
  it('lit .message d\'une Error', () => {
    expect(callErrorMessageOf(new Error('CALL_ENDED: déjà terminé'), 'fallback'))
      .toBe('CALL_ENDED: déjà terminé');
  });

  it('lit .message d\'un objet jeté non-Error (parité avec l\'ancien error.message ||)', () => {
    expect(callErrorMessageOf({ message: 'NOT_A_PARTICIPANT: dehors' }, 'fallback'))
      .toBe('NOT_A_PARTICIPANT: dehors');
  });

  it('retombe sur le fallback quand la valeur jetée n\'a pas de .message', () => {
    expect(callErrorMessageOf('boom', 'Failed to join call')).toBe('Failed to join call');
    expect(callErrorMessageOf(null, 'Failed to join call')).toBe('Failed to join call');
    expect(callErrorMessageOf({ code: 42 }, 'Failed to join call')).toBe('Failed to join call');
  });

  it('retombe sur le fallback quand .message est vide ou non-string', () => {
    expect(callErrorMessageOf(new Error(''), 'fallback')).toBe('fallback');
    expect(callErrorMessageOf({ message: 7 }, 'fallback')).toBe('fallback');
  });
});

describe('parseCallHandlerError', () => {
  it('sépare « CODE: message » sur le premier deux-points', () => {
    expect(parseCallHandlerError(new Error('CALL_ENDED: cet appel est terminé'), 'fb'))
      .toEqual({ code: 'CALL_ENDED', message: 'cet appel est terminé' });
  });

  it('recolle les deux-points suivants dans le message (split historique conservé)', () => {
    expect(parseCallHandlerError(new Error('BAD_STATE: raison: détail'), 'fb'))
      .toEqual({ code: 'BAD_STATE', message: 'raison: détail' });
  });

  it('sans deux-points, code ET message valent le message entier (forme historique)', () => {
    // Comportement HISTORIQUE des 4 catch dupliqués (initiate/join/leave/end) :
    // pas de validation de code — les clients (web reconnect-rejoin) gatent sur
    // des codes précis type CALL_ENDED, le reste passe tel quel.
    expect(parseCallHandlerError(new Error('Failed hard'), 'fb'))
      .toEqual({ code: 'Failed hard', message: 'Failed hard' });
  });

  it('valeur jetée sans .message → fallback, découpé comme le reste', () => {
    expect(parseCallHandlerError(undefined, 'Failed to initiate call'))
      .toEqual({ code: 'Failed to initiate call', message: 'Failed to initiate call' });
  });

  it('trim le message après le code (parité .trim() historique)', () => {
    expect(parseCallHandlerError(new Error('CALL_NOT_FOUND:   introuvable  '), 'fb'))
      .toEqual({ code: 'CALL_NOT_FOUND', message: 'introuvable' });
  });
});
