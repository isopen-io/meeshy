import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { isAppPath } from '@/routes/app-paths';

import { internalPathOf } from './internal-link';
import { canonicalAppPath, LEGACY_PATH_ALIASES } from './legacy-paths';
import { cheminDuLienEntrant } from './shell-deep-links';

/**
 * LES ANCIENNES ADRESSES DE MEESHY MÈNENT À LEUR ÉCRAN DANS L'APP (#10881).
 *
 * Le site les redirige en 308 (`nginx.conf`) et l'iPhone les ouvre dans l'app
 * (`DeepLinkRouter.swift`). Dans la coque Android, touchées dans un message,
 * elles partaient au navigateur externe ; reçues d'une autre app, elles
 * n'ouvraient pas la coque.
 */

const NGINX = readFileSync(new URL('../../../nginx.conf', import.meta.url), 'utf8');
const nginxAliases = [...NGINX.matchAll(/location ~ (\S+) \{\n\s+return 308 (\S+)\$is_args\$args;/g)].map(([, pattern = '', target = '']) => [pattern, target] as const);

const ANCIENNES: readonly (readonly [ancienne: string, canonique: string])[] = [
  ['/join/mshy_abc', '/chat/mshy_abc'],
  ['/conversation/64f0c0ffee0000000000abcd', '/c/64f0c0ffee0000000000abcd'],
  ['/conversations/64f0c0ffee0000000000abcd', '/c/64f0c0ffee0000000000abcd'],
  ['/p/post-1', '/feeds/post/post-1'],
  ['/s/story-1', '/story/story-1'],
  ['/users/alice', '/u/alice'],
];

describe('les anciennes adresses de Meeshy (#10881)', () => {
  test('la règle est celle des redirections 308 de nginx.conf, ni plus ni moins', () => {
    expect(nginxAliases.length).toBeGreaterThan(0);
    expect(LEGACY_PATH_ALIASES).toEqual(nginxAliases);
  });

  test('chacune se lit comme sa forme canonique, servie par l’app', () => {
    for (const [ancienne, canonique] of ANCIENNES) {
      expect(canonicalAppPath(ancienne)).toBe(canonique);
      expect(isAppPath(canonique)).toBe(true);
    }
  });

  test('touchée dans un message, elle reste dans l’app, requête et fragment compris', () => {
    expect(internalPathOf('https://meeshy.me/join/mshy_abc?ref=x#m', { origins: [], isAppPath })).toBe('/chat/mshy_abc?ref=x#m');
    expect(internalPathOf('https://meeshy.me/p/post-1', { origins: [], isAppPath })).toBe('/feeds/post/post-1');
  });

  test('reçue par la coque, par l’App Link ou par meeshy://, elle ouvre son écran', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/s/story-1', isAppPath)).toBe('/story/story-1');
    expect(cheminDuLienEntrant('https://meeshy.me/users/alice', isAppPath)).toBe('/u/alice');
    expect(cheminDuLienEntrant('meeshy://join/mshy_abc', isAppPath)).toBe('/chat/mshy_abc');
  });

  test('une adresse qui n’est pas un alias ne change pas, et une création de conversation n’en est pas un', () => {
    expect(canonicalAppPath('/c/abc')).toBe('/c/abc');
    expect(canonicalAppPath('/conversations/new')).toBe('/conversations/new');
    expect(canonicalAppPath('/join')).toBe('/join');
  });
});
