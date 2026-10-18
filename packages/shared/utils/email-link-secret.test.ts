import { describe, expect, it } from 'vitest';

import { EMAIL_LINK_ALIASES, EMAIL_LINK_PATHS, carriesEmailLinkSecret } from './email-link-secret';
import { servedTrackingTarget, urlCarriesEmailLinkSecret } from './email-link-url';

/**
 * UN LIEN À JETON D'E-MAIL N'ENTRE QUE PAR L'E-MAIL (#10870, #10871). La règle
 * est UNE : le web la lit au retour d'un lien suivi, la passerelle la lit à la
 * création et au service d'un lien suivi.
 */

const SECRET_URLS = [
  'https://meeshy.me/auth/magic-link?token=abc',
  'https://meeshy.me/auth/magic-link/validate?token=abc',
  'https://meeshy.me/auth/verify-email?token=abc&email=a@b.c',
  'https://meeshy.me/reset-password?via=email#token=abc',
  'https://meeshy.me/auth/reset-password?token=abc',
  'https://meeshy.me/auth/revoke-sessions?token=abc',
  'https://meeshy.me/account/deletion?token=abc',
  'https://meeshy.me/settings/verify-email-change?token=abc',
  'https://meeshy.me/auth/email-link/magic-link#token=abc',
  'https://meeshy.me/auth/email-link/verify-email#token=abc',
  'https://meeshy.me/auth/email-link/reset-password#token=abc',
  'https://meeshy.me/auth/email-link/whatever#token=abc',
  'https://meeshy.me/AUTH/Magic-Link?token=abc',
  'https://meeshy.me//auth///magic-link?token=abc',
  'https://meeshy.me/auth/magic-link/?token=abc',
  'https://meeshy.me/auth%2Fmagic-link?token=abc',
  'https://meeshy.me/%61uth/magic-link?token=abc',
  'https://meeshy.me/x/../auth/magic-link?token=abc',
  'https://meeshy.me\\auth\\magic-link?token=abc',
  'https://evil.example/auth/magic-link?token=abc',
  'https://meeshy.me/#/auth/magic-link?token=abc',
  'https://meeshy.me/?x=1#/reset-password?token=abc',
  'https://meeshy.me/auth/magic-link%20?token=abc',
  'https://meeshy.me/auth/magic-link%09?token=abc',
  'https://meeshy.me/auth/magic-link%C2%A0?token=abc',
  'https://meeshy.me/auth/%E3%80%80magic-link?token=abc',
  'https://meeshy.me/auth/%C2%85magic-link?token=abc',
  'https://meeshy.me/auth/verify-email%20?token=abc&email=a@b.c',
  'https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.c',
  'https://meeshy.me/reset-password/x?token=abc',
  'https://meeshy.me/auth/revoke-sessions/x?token=abc',
  'https://evil.example\\@meeshy.me/auth/magic-link?token=abc',
  'https://evil.example%5C@meeshy.me/auth/magic-link?token=abc',
  'https://meeshy.me/auth/magic-link;x=1?token=abc',
  'https://meeshy.me/auth;x/magic-link?token=abc',
  'https://meeshy.me/auth%2Fmagic-link/%ZZ?token=abc',
  'https://meeshy.me/auth%252Fmagic-link?token=abc',
  'https://meeshy.me/auth/magic%E2%80%8B-link?token=abc',
  'https://meeshy.me/auth/magic-link%3Ftoken=abc',
  'https://meeshy.me/auth/magic-li\tnk?token=abc',
  'https:meeshy.me/auth/magic-link?token=abc',
  'https://meeshy.me/login?next=%2Fauth%2Fmagic-link%3Ftoken%3Dabc',
  'https://meeshy.me/signup?next=/reset-password%23token%3Dabc',
  'https://meeshy.me/auth/login?returnUrl=https%3A%2F%2Fmeeshy.me%2Fauth%2Fverify-email%3Ftoken%3Dabc',
  'https://meeshy.me/login#next=%2Fauth%2Fmagic-link%3Ftoken%3Dabc',
  'https://meeshy.me/login?next=%252Fauth%252Fmagic-link%253Ftoken%253Dabc',
];

const SAFE_URLS = [
  'https://meeshy.me/',
  'https://meeshy.me/chat/abc',
  'https://meeshy.me/p/123?token=abc',
  'https://meeshy.me/auth/login',
  'https://meeshy.me/auth/magic-linker',
  'https://example.com/blog/reset-password-tips',
  'https://meeshy.me/#token=abc',
  'https://meeshy.me/login?next=%2Fchat%2Fabc',
  'https://example.com/search?q=reset+password',
];

describe('carriesEmailLinkSecret — le chemin d’un lien à jeton d’e-mail', () => {
  it('reconnaît chaque chemin canonique et chaque alias', () => {
    [...EMAIL_LINK_PATHS, ...Object.keys(EMAIL_LINK_ALIASES)].forEach((path) => {
      expect(carriesEmailLinkSecret(path)).toBe(true);
    });
  });

  it('ne reconnaît pas un chemin voisin', () => {
    expect(carriesEmailLinkSecret('/auth/login')).toBe(false);
    expect(carriesEmailLinkSecret('/auth/magic-linker')).toBe(false);
  });
});

describe('urlCarriesEmailLinkSecret — la cible d’un lien suivi', () => {
  it.each(SECRET_URLS)('refuse %s', (url) => {
    expect(urlCarriesEmailLinkSecret(url)).toBe(true);
  });

  it.each(SAFE_URLS)('laisse passer %s', (url) => {
    expect(urlCarriesEmailLinkSecret(url)).toBe(false);
  });

  it('ferme sur une adresse illisible', () => {
    expect(urlCarriesEmailLinkSecret('not a url')).toBe(true);
    expect(urlCarriesEmailLinkSecret('')).toBe(true);
  });
});

/**
 * LA FORME JUGÉE EST LA FORME SERVIE (#10871). Foundation (iOS) et l'`Uri`
 * Android lisent `https://evil\\@meeshy.me/auth/magic-link` comme l'hôte
 * `meeshy.me` ; WHATWG comme `evil` et le chemin `/@meeshy.me/…`. La passerelle
 * ne sert donc jamais l'adresse brute : elle sert sa sérialisation WHATWG, que
 * tous les analyseurs lisent pareil — ou rien.
 */
describe('servedTrackingTarget — ce que la passerelle envoie', () => {
  it('sert la sérialisation WHATWG d’une adresse ordinaire', () => {
    expect(servedTrackingTarget('https://example.com')).toBe('https://example.com/');
    expect(servedTrackingTarget('https://example.com\\a b?x=1')).toBe('https://example.com/a%20b?x=1');
  });

  it('ne sert rien d’une adresse à secret, quelle que soit la lecture qui l’y voit', () => {
    SECRET_URLS.forEach((url) => expect(servedTrackingTarget(url)).toBeNull());
  });

  it('ne sert que du http(s)', () => {
    ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//evil.example/a', 'not a url'].forEach((url) =>
      expect(servedTrackingTarget(url)).toBeNull(),
    );
  });

  it('la forme servie, relue, garde le même hôte et le même chemin', () => {
    const served = servedTrackingTarget('https://evil.example\\@meeshy.me/x');
    expect(served).toBe('https://evil.example/@meeshy.me/x');
    expect(servedTrackingTarget(served ?? '')).toBe(served);
  });
});
