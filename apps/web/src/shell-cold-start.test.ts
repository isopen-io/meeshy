import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { shellStartHref } from '@/lib/links/shell-start';

/**
 * LA COQUE DÉMARRE SUR LA LISTE, COMME LA PWA (#10353).
 *
 * La PWA installée s'ouvre sur `/chats` (`start_url`). La coque charge
 * toujours `https://localhost/`, et `/` y montait `home-shell` — un écran vide
 * qui redirigeait APRÈS son premier rendu : un chunk et un rendu de plus,
 * en série, avant la liste. L'adresse se réécrit désormais avant `createRoot`,
 * par `navigate` (le routeur lit l'adresse dès l'import : un `replaceState`
 * nu ne le préviendrait pas).
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('le démarrage à froid de la coque ouvre la liste (#10353)', () => {
  test('`/` mène à la liste, requête et fragment gardés', () => {
    expect(shellStartHref({ pathname: '/', search: '', hash: '' }, '/chats')).toBe('/chats');
    expect(shellStartHref({ pathname: '/', search: '?x=1', hash: '#y' }, '/chats')).toBe('/chats?x=1#y');
  });

  test('toute autre adresse de départ est laissée telle quelle', () => {
    expect(shellStartHref({ pathname: '/c/abc', search: '', hash: '' }, '/chats')).toBeNull();
    expect(shellStartHref({ pathname: '/chats', search: '', hash: '' }, '/chats')).toBeNull();
  });

  test('main.tsx réécrit l’adresse dans la coque AVANT le premier rendu, par le routeur', () => {
    const main = readFileSync(join(APP, 'src', 'main.tsx'), 'utf8');
    const reecriture = main.search(/if \(__SHELL__\) \{\s*const start = shellStartHref\(window\.location, href\('list'\)\);\s*if \(start !== null\) navigate\(start, true\);/);
    expect(reecriture).toBeGreaterThan(-1);
    expect(reecriture).toBeLessThan(main.indexOf('createRoot(root)'));
  });
});
