import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { menuLadderFor } from '@/lib/view/floating-menu';

import { ANDROID_SHELL_CALLS_ENABLED, callsAvailable } from './calls-availability';

/**
 * LES APPELS COUPÉS DANS LA COQUE ANDROID (directive porteur du 2026-10-14) :
 * la première version du Play Store part sans appels, le web et iOS gardent
 * les leurs, et un seul drapeau les rend à la coque.
 */

const coque = (platform: string): CoqueNative => ({ getPlatform: () => platform });

describe('callsAvailable', () => {
  test('la coque Android de la première version ne propose aucun appel', () => {
    expect(ANDROID_SHELL_CALLS_ENABLED).toBe(false);
    expect(callsAvailable(coque('android'))).toBe(false);
  });

  test('un navigateur garde ses appels', () => {
    expect(callsAvailable(undefined)).toBe(true);
    expect(callsAvailable(coque('web'))).toBe(true);
  });

  test('la coque iOS garde ses appels', () => {
    expect(callsAvailable(coque('ios'))).toBe(true);
  });

  test('rallumer le drapeau rend les appels à la coque Android', () => {
    expect(callsAvailable(coque('android'), true)).toBe(true);
  });

  test('le jumeau natif est coupé en même temps que le drapeau web', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../android/app/src/main/java/me/meeshy/app/CallPush.java'),
      'utf8',
    );
    expect(source).toContain(`public static final boolean CALLS_ENABLED = ${String(ANDROID_SHELL_CALLS_ENABLED)};`);
  });
});

describe('le menu flottant sans appels', () => {
  test('le barreau « Appels » disparaît quand les appels sont coupés, les autres gardent leur ordre', () => {
    const keys = menuLadderFor({ canAccessAdmin: false, calls: false }).map((entry) => entry.key);
    expect(keys).not.toContain('calls');
    expect(keys).toEqual(['links', 'notifications', 'discover', 'communities', 'settings']);
  });

  test("l'administration reste en dernier", () => {
    expect(menuLadderFor({ canAccessAdmin: true, calls: false }).map((entry) => entry.key).at(-1)).toBe('admin');
  });
});
