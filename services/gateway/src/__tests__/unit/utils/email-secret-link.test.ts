/**
 * #10859 — UN LIEN D'E-MAIL NE PORTE PLUS SON SECRET DANS LA CHAÎNE DE REQUÊTE.
 *
 * Traefik journalise le chemin avec sa chaîne de requête : un `?token=…` y
 * restait en clair jusqu'à la rotation (#10855). Le fragment (`#token=…`)
 * n'est jamais envoyé au serveur ; la page le lit, l'efface de la barre
 * d'adresse et le remet à la passerelle dans le corps d'un POST.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { EMAIL_LINK_PATHS, emailSecretLink } from '../../../utils/email-secret-link';

const SRC = join(__dirname, '../../..');

describe('emailSecretLink — le secret voyage dans le fragment', () => {
  it('pose le jeton après « # », jamais dans la requête', () => {
    const link = emailSecretLink({ base: 'https://meeshy.me', path: '/reset-password', secret: { token: 'abc-123_XY' } });
    const url = new URL(link);
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('token')).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe('abc-123_XY');
  });

  it('marque la requête « via=email&token= » (vide) : les service workers, neuf et d’avant #10859, laissent la page au réseau', () => {
    const link = emailSecretLink({ base: 'https://meeshy.me', path: EMAIL_LINK_PATHS.magicLink, secret: { token: 't' } });
    const url = new URL(link);
    expect(url.search).toBe('?via=email&token=');
    expect(url.searchParams.get('token')).toBe('');
  });

  it('les liens magiques et de vérification visent un ALIAS qu’aucune application publiée n’intercepte', () => {
    expect(EMAIL_LINK_PATHS.magicLink.startsWith('/auth/magic-link')).toBe(false);
    expect(EMAIL_LINK_PATHS.verifyEmail).not.toBe('/auth/verify-email');
  });

  it('garde les paramètres NON secrets dans la requête, les secrets dans le fragment', () => {
    const url = new URL(
      emailSecretLink({
        base: 'https://meeshy.me/',
        path: '/auth/verify-email',
        secret: { token: 't0k', email: 'a+b@exemple.fr' },
        query: { next: '/c/1' },
      }),
    );
    expect(url.origin + url.pathname).toBe('https://meeshy.me/auth/verify-email');
    expect(url.searchParams.get('next')).toBe('/c/1');
    expect(url.searchParams.get('email')).toBeNull();
    const fragment = new URLSearchParams(url.hash.slice(1));
    expect(fragment.get('token')).toBe('t0k');
    expect(fragment.get('email')).toBe('a+b@exemple.fr');
  });
});

/**
 * La garde d'inventaire : aucun site de la passerelle ne recompose un lien à
 * jeton en `?token=` — c'est ainsi que les sept sites relevés par #10859
 * étaient nés, chacun écrit à la main.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const SECRET_IN_URL: readonly RegExp[] = [
  /[?&](token|revokeToken|code|secret)=\$\{/,
  /searchParams\.(set|append)\(\s*['"](token|code|secret)['"]/,
  /new URLSearchParams\(\{[^}]*\b(token|code)\s*:/,
];

describe('aucun lien de la passerelle ne compose « ?token=${…} »', () => {
  it('chaque lien à jeton passe par emailSecretLink', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${relative(SRC, file)}:${index + 1}` }))
        .filter(({ line }) => SECRET_IN_URL.some((pattern) => pattern.test(line)))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });

  it('le balayage voit bien les sources de la passerelle — une garde négative à balayage vide resterait verte', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(300);
    expect(SECRET_IN_URL.some((pattern) => pattern.test('const l = `${base}/x?token=${t}`;'))).toBe(true);
    expect(SECRET_IN_URL.some((pattern) => pattern.test("url.searchParams.set('token', t);"))).toBe(true);
    expect(SECRET_IN_URL.some((pattern) => pattern.test('new URLSearchParams({ token: t })'))).toBe(true);
  });
});
