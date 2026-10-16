import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { shellStartHref } from '@/lib/links/shell-start';

/**
 * LA COQUE DÉMARRE SUR LA LISTE QUAND UN COMPTE EST LÀ, SUR LA CONNEXION
 * SINON (#10353, #10784).
 *
 * La PWA installée s'ouvre sur `/chats` (`start_url`). La coque charge
 * toujours `https://localhost/`, et `/` y montait `home-shell` — un écran vide
 * qui redirigeait APRÈS son premier rendu : un chunk et un rendu de plus,
 * en série, avant la liste. L'adresse se réécrit désormais avant `createRoot`,
 * par `navigate` (le routeur lit l'adresse dès l'import : un `replaceState`
 * nu ne le préviendrait pas).
 *
 * Sans compte, la coque mène DIRECTEMENT à `/login` (directive porteur du
 * 2026-10-16) : plus de détour par `/chats` et la garde de session.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = { listHref: '/chats', loginHref: '/login' };

describe('le démarrage à froid de la coque (#10353, #10784)', () => {
  test('avec un compte, `/` mène à la liste, requête et fragment gardés', () => {
    expect(shellStartHref({ pathname: '/', search: '', hash: '' }, { ...targets, authenticated: true })).toBe('/chats');
    expect(shellStartHref({ pathname: '/', search: '?x=1', hash: '#y' }, { ...targets, authenticated: true })).toBe('/chats?x=1#y');
  });

  test('sans compte, `/` mène directement à la connexion', () => {
    expect(shellStartHref({ pathname: '/', search: '', hash: '' }, { ...targets, authenticated: false })).toBe('/login');
    expect(shellStartHref({ pathname: '/', search: '?x=1', hash: '#y' }, { ...targets, authenticated: false })).toBe('/login?x=1#y');
  });

  test('toute autre adresse de départ est laissée telle quelle', () => {
    for (const authenticated of [true, false]) {
      expect(shellStartHref({ pathname: '/c/abc', search: '', hash: '' }, { ...targets, authenticated })).toBeNull();
      expect(shellStartHref({ pathname: '/chats', search: '', hash: '' }, { ...targets, authenticated })).toBeNull();
      expect(shellStartHref({ pathname: '/world', search: '', hash: '' }, { ...targets, authenticated })).toBeNull();
    }
  });

  test('main.tsx réécrit l’adresse dans la coque AVANT le premier rendu, par le routeur, selon la session tenue', () => {
    const main = readFileSync(join(APP, 'src', 'main.tsx'), 'utf8');
    const reecriture = main.search(
      /if \(__SHELL__\) \{\s*const start = shellStartHref\(window\.location, \{\s*listHref: href\('list'\),\s*loginHref: href\('login'\),\s*authenticated: sessionStore\.getState\(\)\.session\.status === 'authenticated',\s*\}\);\s*if \(start !== null\) navigate\(start, true\);/,
    );
    expect(reecriture).toBeGreaterThan(-1);
    expect(reecriture).toBeLessThan(main.indexOf('createRoot(root)'));
  });
});
