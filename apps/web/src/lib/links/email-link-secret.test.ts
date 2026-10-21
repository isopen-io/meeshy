import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { EMAIL_LINK_ALIASES, EMAIL_LINK_PATHS, emailLinkSecret, forgetEmailLinkSecret, liftEmailLinkSecret, type EmailLinkWindow } from './email-link-secret';

/**
 * LE SECRET D'UN LIEN D'E-MAIL QUITTE LA BARRE D'ADRESSE DÈS L'OUVERTURE (#10859).
 *
 * La passerelle pose le jeton dans le FRAGMENT (`#token=…`), que le navigateur
 * n'envoie jamais au serveur. La page le lit, l'efface de l'adresse et le garde
 * dans l'entrée d'historique — un rechargement le retrouve, une autre page non.
 * Les e-mails partis avant portent `?token=` : lus de la même façon, puis
 * effacés, jusqu'à leur expiration.
 */

type Fake = EmailLinkWindow & {
  readonly location: { pathname: string; search: string; hash: string };
  readonly writes: Array<{ readonly state: unknown; readonly url: string }>;
};

function fakeWindow(href: string, state: unknown = null): Fake {
  const writes: Array<{ state: unknown; url: string }> = [];
  const url = new URL(href, 'https://meeshy.me');
  const location = { pathname: url.pathname, search: url.search, hash: url.hash };
  const history = {
    state,
    replaceState(next: unknown, _unused: string, to: string) {
      const moved = new URL(to, 'https://meeshy.me');
      location.pathname = moved.pathname;
      location.search = moved.search;
      location.hash = moved.hash;
      history.state = next;
      writes.push({ state: next, url: to });
    },
  };
  return { location, history, writes };
}

describe('liftEmailLinkSecret — le fragment quitte l’adresse', () => {
  test('lien neuf : le jeton est retenu, l’adresse ne garde ni jeton ni marqueur', () => {
    const win = fakeWindow('/reset-password?via=email#token=abc-123');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/reset-password']);
    expect(win.location.hash).toBe('');
    expect(emailLinkSecret(win)).toEqual({ token: 'abc-123' });
  });

  test('vérification d’adresse : jeton ET adresse e-mail quittent l’adresse, le reste demeure', () => {
    const win = fakeWindow('/auth/verify-email?next=%2Fc%2F1&via=email#token=t0k&email=ada%40x.io');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/auth/verify-email?next=%2Fc%2F1']);
    expect(emailLinkSecret(win)).toEqual({ token: 't0k', email: 'ada@x.io' });
  });

  test('ancien lien `?token=` (e-mails déjà partis) : accepté, puis effacé de l’adresse', () => {
    const win = fakeWindow('/account/deletion?token=old-1&action=cancel');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/account/deletion?action=cancel']);
    expect(emailLinkSecret(win)).toEqual({ token: 'old-1' });
  });

  test('lien neuf, query `via=email&token=` VIDE (pour un service worker d’avant #10859) : le fragment prime, la requête est nettoyée', () => {
    const win = fakeWindow('/reset-password?via=email&token=#token=abc');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/reset-password']);
    expect(emailLinkSecret(win)).toEqual({ token: 'abc' });
  });

  test('alias du lien magique (qu’aucune application publiée n’intercepte) : ramené à l’adresse canonique, secret compris', () => {
    const win = fakeWindow('/auth/email-link/magic-link?returnUrl=%2Fc%2F1&via=email&token=#token=m1');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/auth/magic-link?returnUrl=%2Fc%2F1']);
    expect(emailLinkSecret(win)).toEqual({ token: 'm1' });
  });

  test('alias de la vérification : ramené à `/auth/verify-email`, jeton et adresse retenus', () => {
    const win = fakeWindow('/auth/email-link/verify-email?via=email&token=#token=v1&email=ada%40x.io');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/auth/verify-email']);
    expect(emailLinkSecret(win)).toEqual({ token: 'v1', email: 'ada@x.io' });
  });

  test('alias de la réinitialisation (#10868) : ramené à `/reset-password`, jeton retenu', () => {
    const win = fakeWindow('/auth/email-link/reset-password?via=email#token=r1');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/reset-password']);
    expect(emailLinkSecret(win)).toEqual({ token: 'r1' });
  });

  test('alias sans jeton : ramené à l’adresse canonique quand même, jamais une page introuvable', () => {
    const win = fakeWindow('/auth/email-link/magic-link');
    liftEmailLinkSecret(win);
    expect(win.writes.map((w) => w.url)).toEqual(['/auth/magic-link']);
    expect(emailLinkSecret(win)).toEqual({});
  });

  test('l’état d’historique existant est préservé', () => {
    const win = fakeWindow('/auth/magic-link?via=email#token=m', { backDismiss: 'x' });
    liftEmailLinkSecret(win);
    expect(win.history.state).toMatchObject({ backDismiss: 'x' });
  });

  test('un rechargement retrouve le secret : l’adresse n’en porte plus, l’historique si', () => {
    const win = fakeWindow('/reset-password?via=email#token=r1');
    liftEmailLinkSecret(win);
    liftEmailLinkSecret(win);
    expect(win.writes).toHaveLength(1);
    expect(emailLinkSecret(win)).toEqual({ token: 'r1' });
  });

  test('une autre route ne lit jamais le secret d’une entrée d’historique étrangère', () => {
    const win = fakeWindow('/reset-password?via=email#token=r1');
    liftEmailLinkSecret(win);
    win.location.pathname = '/auth/magic-link';
    expect(emailLinkSecret(win)).toEqual({});
  });

  test('hors des pages à jeton, rien ne bouge — ni le fragment, ni la requête', () => {
    for (const href of ['/login?token=abc', '/c/1#token=abc', '/auth/verify-email?email=ada%40x.io', '/auth/magic-link']) {
      const win = fakeWindow(href);
      liftEmailLinkSecret(win);
      expect({ href, writes: win.writes }).toEqual({ href, writes: [] });
    }
  });

  test('chaque page que la passerelle vise est une page à jeton', () => {
    expect([...EMAIL_LINK_PATHS].sort()).toEqual(
      [
        '/account/deletion',
        '/auth/magic-link',
        '/auth/magic-link/validate',
        '/auth/revoke-sessions',
        '/auth/verify-email',
        '/reset-password',
        '/settings/verify-email-change',
      ].sort(),
    );
  });
});

describe('forgetEmailLinkSecret — un jeton servi ne reste pas dans l’historique (#10864)', () => {
  test('après usage, l’entrée d’historique ne porte plus le jeton : un retour arrière ne le relit pas', () => {
    const win = fakeWindow('/reset-password?via=email#token=r1', { backDismiss: 'x' });
    liftEmailLinkSecret(win);
    forgetEmailLinkSecret(win);
    expect(emailLinkSecret(win)).toEqual({});
    expect(JSON.stringify(win.history.state)).not.toContain('r1');
  });

  test('l’adresse et le reste de l’état d’historique demeurent', () => {
    const win = fakeWindow('/auth/verify-email?next=%2Fc%2F1&via=email#token=t0k&email=ada%40x.io', { backDismiss: 'x' });
    liftEmailLinkSecret(win);
    forgetEmailLinkSecret(win);
    expect(win.writes.at(-1)?.url).toBe('/auth/verify-email?next=%2Fc%2F1');
    expect(win.history.state).toEqual({ backDismiss: 'x' });
  });

  test('sans secret dans l’entrée, rien ne s’écrit', () => {
    const win = fakeWindow('/reset-password', { backDismiss: 'x' });
    forgetEmailLinkSecret(win);
    expect(win.writes).toEqual([]);
  });
});

describe('les alias ne sont revendiqués par AUCUNE application publiée (#10859)', () => {
  const here = dirname(fileURLToPath(import.meta.url));

  test('l’AASA ne revendique pas les alias, ni la réinitialisation que les versions publiées avaleraient (#10868)', () => {
    const aasa = JSON.parse(readFileSync(join(here, '../../../public/.well-known/apple-app-site-association'), 'utf8')) as {
      readonly applinks: { readonly details: ReadonlyArray<{ readonly components: ReadonlyArray<Record<string, unknown>> }> };
    };
    const claimed = aasa.applinks.details.flatMap((detail) => detail.components).filter((c) => c['exclude'] !== true).map((c) => String(c['/']));
    const claims = (path: string) => claimed.some((pattern) => new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(path));
    expect([...Object.keys(EMAIL_LINK_ALIASES), '/reset-password', '/auth/reset-password'].filter(claims)).toEqual([]);
  });

  for (const [name, manifestPath] of [
    ['la coque Android', '../../../android/app/src/main/AndroidManifest.xml'],
    ['l’application Kotlin publiée', '../../../../android/app/src/main/AndroidManifest.xml'],
  ] as const) {
    test(`${name} ne revendique pas les alias`, () => {
      const manifest = readFileSync(join(here, manifestPath), 'utf8');
      const prefixes = [...manifest.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1] ?? '');
      const paths = [...manifest.matchAll(/android:path="([^"]+)"/g)].map((m) => m[1] ?? '');
      const claims = (path: string) => prefixes.some((prefix) => path.startsWith(prefix)) || paths.includes(path);
      expect(prefixes.length).toBeGreaterThan(3);
      expect(Object.keys(EMAIL_LINK_ALIASES).filter(claims)).toEqual([]);
    });
  }
});
