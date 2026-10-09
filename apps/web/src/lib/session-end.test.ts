import { describe, expect, test } from 'bun:test';

import { createSessionEndMemory, sessionEndReasonOf } from './session-end';

/**
 * POURQUOI LA SESSION S'EST FERMÉE (#9613) — le motif de `auth:session-revoked`
 * survit au retour à la connexion, qui l'explique UNE fois.
 */

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('sessionEndReasonOf — seuls les motifs qui s’expliquent', () => {
  test('les motifs d’une fermeture subie sont reconnus', () => {
    for (const reason of ['admin_revoke', 'user_revoke', 'password_changed', 'logout', 'logout_all_devices', 'session_expired']) {
      expect(sessionEndReasonOf(reason)).toBe(reason);
    }
  });

  test('`activation_required` mène à l’activation, pas à une explication ; un motif inconnu n’invente rien', () => {
    expect(sessionEndReasonOf('activation_required')).toBeNull();
    expect(sessionEndReasonOf('pirate')).toBeNull();
    expect(sessionEndReasonOf(undefined)).toBeNull();
  });
});

describe('la mémoire du motif', () => {
  test('notée, elle se relit jusqu’à ce qu’on la congédie', () => {
    const memory = createSessionEndMemory(memoryStorage());
    memory.note('admin_revoke');
    expect(memory.pending()).toBe('admin_revoke');
    expect(memory.pending()).toBe('admin_revoke');
    memory.dismiss();
    expect(memory.pending()).toBeNull();
  });

  test('survit au rechargement de la page (stockage de la session du navigateur)', () => {
    const storage = memoryStorage();
    createSessionEndMemory(storage).note('user_revoke');
    expect(createSessionEndMemory(storage).pending()).toBe('user_revoke');
  });

  test('un stockage qui refuse ne casse rien : la mémoire vive suffit', () => {
    const refusing = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => { throw new Error('bloqué'); } };
    const memory = createSessionEndMemory(refusing);
    memory.note('password_changed');
    expect(memory.pending()).toBe('password_changed');
  });

  test('un motif qui ne s’explique pas efface le précédent', () => {
    const memory = createSessionEndMemory(memoryStorage());
    memory.note('admin_revoke');
    memory.note('activation_required');
    expect(memory.pending()).toBeNull();
  });
});
