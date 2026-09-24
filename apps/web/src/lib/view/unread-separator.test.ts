import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { threadOpenScrollDecision, unreadSeparatorLabel } from './unread-separator';

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('de');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

describe('unreadSeparatorLabel — pluriel, dans la langue de l’interface', () => {
  test('le SINGULIER a sa clé (#7182/#7226, même convention que stories.count)', () => {
    expect(unreadSeparatorLabel('fr', 1)).toBe('1 message non lu');
  });

  test('le PLURIEL, en français', () => {
    expect(unreadSeparatorLabel('fr', 3)).toBe('3 messages non lus');
  });

  test('une SECONDE langue, jamais une recopie du français', () => {
    expect(unreadSeparatorLabel('de', 3)).not.toContain('non lus');
    expect(unreadSeparatorLabel('de', 3)).toContain('3');
  });
});

const placedOf = (ids: readonly string[]) => ids.map((id) => ({ message: { id }, head: true, tail: true, opensDay: null }));

describe('threadOpenScrollDecision — D-L2 : sur le séparateur à l’OUVERTURE, jamais ensuite', () => {
  test('ouverture initiale + séparateur dans la fenêtre chargée ⇒ saut à son index', () => {
    const decision = threadOpenScrollDecision({
      isInitialOpen: true,
      unreadBoundary: { firstUnreadId: 'm-2', unreadCount: 2 },
      placed: placedOf(['m-1', 'm-2', 'm-3']),
    });
    expect(decision).toEqual({ kind: 'jump-to-separator', index: 1 });
  });

  test('ouverture initiale, tout est lu (unreadBoundary null) ⇒ ancrage en bas, comme aujourd’hui', () => {
    const decision = threadOpenScrollDecision({
      isInitialOpen: true,
      unreadBoundary: null,
      placed: placedOf(['m-1', 'm-2', 'm-3']),
    });
    expect(decision).toEqual({ kind: 'pin-to-bottom' });
  });

  test('le premier non-lu n’est PAS dans la fenêtre chargée (borne assumée S1) ⇒ repli sur l’ancrage en bas', () => {
    const decision = threadOpenScrollDecision({
      isInitialOpen: true,
      unreadBoundary: { firstUnreadId: 'm-trop-ancien', unreadCount: 40 },
      placed: placedOf(['m-1', 'm-2', 'm-3']),
    });
    expect(decision).toEqual({ kind: 'pin-to-bottom' });
  });

  test('un NOUVEAU message arrive en cours de session (pas une ouverture) ⇒ toujours l’ancrage en bas, MÊME avec un séparateur gelé non nul', () => {
    const decision = threadOpenScrollDecision({
      isInitialOpen: false,
      unreadBoundary: { firstUnreadId: 'm-2', unreadCount: 2 },
      placed: placedOf(['m-1', 'm-2', 'm-3', 'm-4']),
    });
    expect(decision).toEqual({ kind: 'pin-to-bottom' });
  });
});
