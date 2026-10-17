import { describe, expect, it } from 'vitest';

import { EMAIL_LINK_ALIASES, EMAIL_LINK_PATHS, carriesEmailLinkSecret, urlCarriesEmailLinkSecret } from './email-link-secret';

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
];

const SAFE_URLS = [
  'https://meeshy.me/',
  'https://meeshy.me/chat/abc',
  'https://meeshy.me/p/123?token=abc',
  'https://meeshy.me/auth/login',
  'https://meeshy.me/auth/magic-linker',
  'https://example.com/blog/reset-password-tips',
  'https://meeshy.me/#token=abc',
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
