import { describe, expect, test } from 'bun:test';

import { brandingIdentityOf, type BrandingAuthor } from './scene-export-branding-identity';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const secondsAgo = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();

const authorWith = (overrides: Partial<BrandingAuthor> = {}): BrandingAuthor => ({
  authorId: 'u-author',
  displayName: 'Windie Nh',
  username: 'windie',
  avatarSrc: 'https://cdn.example/a.jpg',
  bannerSrc: null,
  accentHex: '6366F1',
  moodEmoji: '🎉',
  moodMessage: 'Fête ce soir',
  presence: { isOnline: true, lastActiveAt: secondsAgo(5) },
  self: false,
  ...overrides,
});

describe("l'identité peinte sur l'intro et la fin d'une story exportée", () => {
  test("la présence est la projection de ce que le serveur a SERVI : en ligne → point vert, absente → aucun point", () => {
    expect(brandingIdentityOf({ author: authorWith(), level: null, now: NOW }).presenceDotHex).toBe('#34D399');
    expect(brandingIdentityOf({ author: authorWith({ presence: null }), level: null, now: NOW }).presenceDotHex).toBeNull();
  });

  test('actif depuis 2 minutes → orange ; depuis 4 minutes → gris ; depuis 10 minutes → aucun point', () => {
    const dot = (seconds: number) => brandingIdentityOf({ author: authorWith({ presence: { isOnline: false, lastActiveAt: secondsAgo(seconds) } }), level: null, now: NOW }).presenceDotHex;
    expect(dot(120)).toBe('#FBBF24');
    expect(dot(240)).toBe('#9CA3AF');
    expect(dot(600)).toBeNull();
  });

  test('un auteur hors ligne sans activité récente ne montre aucun point', () => {
    expect(brandingIdentityOf({ author: authorWith({ presence: { isOnline: false, lastActiveAt: null } }), level: null, now: NOW }).presenceDotHex).toBeNull();
  });

  test('sa propre story : soi est toujours visible, donc en ligne, même sans présence servie', () => {
    expect(brandingIdentityOf({ author: authorWith({ self: true, presence: null }), level: null, now: NOW }).presenceDotHex).toBe('#34D399');
  });

  test('Proche → 🔥, Sang → 🩸 ; Ami et en dessous → rien ; le doute → rien', () => {
    const badge = (level: unknown) => brandingIdentityOf({ author: authorWith(), level, now: NOW }).circleBadge;
    expect(badge('CLOSE')).toBe('🔥');
    expect(badge('BLOOD')).toBe('🩸');
    expect(badge('FRIEND')).toBeNull();
    expect(badge('ACQUAINTANCE')).toBeNull();
    expect(badge(null)).toBeNull();
    expect(badge('???')).toBeNull();
  });

  test('sa propre story : jamais de logo de cercle, même si un niveau est fourni', () => {
    expect(brandingIdentityOf({ author: authorWith({ self: true }), level: 'BLOOD', now: NOW }).circleBadge).toBeNull();
  });

  test("le mood est peint tel qu'il est détenu, sans mood la capsule est absente", () => {
    const identity = brandingIdentityOf({ author: authorWith(), level: null, now: NOW });
    expect(identity.moodEmoji).toBe('🎉');
    expect(identity.moodMessage).toBe('Fête ce soir');
    expect(brandingIdentityOf({ author: authorWith({ moodEmoji: '  ', moodMessage: 'seul' }), level: null, now: NOW }).moodEmoji).toBeNull();
    expect(brandingIdentityOf({ author: authorWith({ moodEmoji: '  ', moodMessage: 'seul' }), level: null, now: NOW }).moodMessage).toBeNull();
  });

  test("sans nom affiché, l'identité retombe sur le @username", () => {
    expect(brandingIdentityOf({ author: authorWith({ displayName: '  ' }), level: null, now: NOW }).displayName).toBe('windie');
  });
});
