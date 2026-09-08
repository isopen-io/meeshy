/**
 * @jest-environment jsdom
 */

import { COOKIE_DE_L_APPAREIL_PUSH, lisLAppareilPush, poseLAppareilPush } from '@/lib/api/push-appareil';

/**
 * `lib/api/push-appareil.ts` — l'identité d'appareil du push web (#5391),
 * spécification § 3.3 : une écriture, deux lectures, jamais un doublon
 * `localStorage`.
 */

describe('lisLAppareilPush', () => {
  it('lit la valeur du cookie quand il est présent', () => {
    expect(lisLAppareilPush('meeshy_auth=x; meeshy_v3_push_appareil=abc-123')).toBe('abc-123');
  });

  it('rend null en son absence', () => {
    expect(lisLAppareilPush('meeshy_auth=x')).toBeNull();
    expect(lisLAppareilPush(null)).toBeNull();
  });
});

describe('poseLAppareilPush', () => {
  beforeEach(() => {
    document.cookie.split(';').forEach((c) => {
      const nom = c.split('=')[0]?.trim();
      if (nom) document.cookie = `${nom}=; Max-Age=0; path=/`;
    });
  });

  it('pose un identifiant neuf quand aucun n’existe, et le cookie porte le bon nom', () => {
    const identifiant = poseLAppareilPush({ secure: false });

    expect(identifiant).toMatch(/^[0-9a-f-]{36}$/i);
    expect(lisLAppareilPush(document.cookie)).toBe(identifiant);
    expect(document.cookie).toContain(`${COOKIE_DE_L_APPAREIL_PUSH}=`);
  });

  it('est IDEMPOTENTE — un identifiant déjà posé survit à un second appel', () => {
    const premier = poseLAppareilPush({ secure: false });
    const second = poseLAppareilPush({ secure: false });

    expect(second).toBe(premier);
  });
});
