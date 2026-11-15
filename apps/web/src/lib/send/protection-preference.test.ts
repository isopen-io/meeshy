import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { purgeAccountLocalData } from '@/lib/api/accounts';

import { EPHEMERAL_AFTER_READ_SECONDS } from './compose-protection';
import type { StorageLike } from './draft-store';
import { createProtectionPreferenceStore, stickyProtectionOf } from './protection-preference';

/**
 * UNE PROTECTION ARMÉE RESTE ARMÉE DANS LA CONVERSATION (#8306) — éphémère
 * (durée ou flamme-œil), flou, vue unique : une préférence PAR
 * conversation, restaurée à l'ouverture. Les effets DÉCORATIFS n'en font
 * jamais partie : ils restent à usage unique.
 */
function memoryBackend(): StorageLike & { readonly keys: () => readonly string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

describe('stickyProtectionOf — les protections, jamais les effets', () => {
  test('garde éphémère, flou et vue unique ; laisse tomber effectFlags', () => {
    expect(
      stickyProtectionOf({ ephemeralSeconds: 15, blurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.CONFETTI }),
    ).toEqual({ ephemeralSeconds: 15, blurred: true });
    expect(stickyProtectionOf({ viewOnce: true })).toEqual({ viewOnce: true });
    expect(stickyProtectionOf({ ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS })).toEqual({ ephemeralSeconds: 0 });
    expect(stickyProtectionOf({ effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE })).toEqual({});
  });
});

describe('createProtectionPreferenceStore — une préférence par (lecteur, conversation)', () => {
  test('restaurée après un rechargement', () => {
    const backend = memoryBackend();
    createProtectionPreferenceStore(backend).set('u_a', 'c-1', { ephemeralSeconds: 60, blurred: true });
    expect(createProtectionPreferenceStore(backend).get('u_a', 'c-1')).toEqual({ ephemeralSeconds: 60, blurred: true });
  });

  test('chaque conversation garde la sienne, chaque lecteur aussi', () => {
    const store = createProtectionPreferenceStore(memoryBackend());
    store.set('u_a', 'c-1', { viewOnce: true });
    expect(store.get('u_a', 'c-2')).toBeNull();
    expect(store.get('u_b', 'c-1')).toBeNull();
  });

  test('tout désarmer EFFACE la préférence (une préférence vide n’occupe rien)', () => {
    const backend = memoryBackend();
    const store = createProtectionPreferenceStore(backend);
    store.set('u_a', 'c-1', { blurred: true });
    store.set('u_a', 'c-1', {});
    expect(store.get('u_a', 'c-1')).toEqual({});
    expect(backend.keys()).toEqual([]);
  });

  test('une valeur corrompue se lit comme une absence', () => {
    const backend = memoryBackend();
    backend.setItem('meeshy.composer-protection.u_a.c-1', '{pas du json');
    expect(createProtectionPreferenceStore(backend).get('u_a', 'c-1')).toBeNull();
    backend.setItem('meeshy.composer-protection.u_a.c-1', JSON.stringify({ ephemeralSeconds: 'x', blurred: 1 }));
    expect(createProtectionPreferenceStore(backend).get('u_a', 'c-1')).toEqual({});
  });

  test('un stockage qui LÈVE garde la préférence pour la session', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createProtectionPreferenceStore(throwing);
    store.set('u_a', 'c-1', { blurred: true });
    expect(store.get('u_a', 'c-1')).toEqual({ blurred: true });
  });

  test('la déconnexion d’un compte efface ses préférences (#8286)', () => {
    const backend = memoryBackend();
    createProtectionPreferenceStore(backend).set('u_a', 'c-1', { blurred: true });
    purgeAccountLocalData({ storage: backend, userId: 'a', keys: backend.keys() });
    expect(backend.keys()).toEqual([]);
  });
});
