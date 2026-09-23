import { describe, it, expect } from '@jest/globals';
import { isPreviewWithheld, resolvePreviewProtection, summarizeAttachments } from '../last-message-nature';

const NOW = new Date('2026-09-23T12:00:00Z');
const PAST = new Date('2026-09-23T11:00:00Z');

describe('resolvePreviewProtection — un prédicat pour REST, la recherche et le socket', () => {
  it('un éphémère dont la colonne interne est passée n’est PAS expiré : ephemeralDuration compte (#7451)', () => {
    expect(resolvePreviewProtection({ expiresAt: PAST, ephemeralDuration: 240 }, NOW)).toBe('ephemeral');
    expect(isPreviewWithheld('ephemeral')).toBe(false);
  });

  it('sans ephemeralDuration, une échéance passée est une péremption', () => {
    expect(resolvePreviewProtection({ expiresAt: PAST }, NOW)).toBe('expired');
  });

  it('la sécurité l’emporte dans l’ordre validé : expiré > vue unique > flou > chiffré', () => {
    expect(resolvePreviewProtection({ expiresAt: PAST, isViewOnce: true, isBlurred: true }, NOW)).toBe('expired');
    expect(resolvePreviewProtection({ isViewOnce: true, isBlurred: true, isEncrypted: true }, NOW)).toBe('view-once');
    expect(resolvePreviewProtection({ isBlurred: true, isEncrypted: true }, NOW)).toBe('blurred');
    expect(resolvePreviewProtection({ isEncrypted: true, ephemeralDuration: 60 }, NOW)).toBe('encrypted');
  });

  it('un message chiffré retient son contenu', () => {
    expect(isPreviewWithheld(resolvePreviewProtection({ isEncrypted: true }, NOW))).toBe(true);
  });

  it('un message ordinaire n’est pas protégé', () => {
    expect(resolvePreviewProtection({}, NOW)).toBeNull();
    expect(isPreviewWithheld(null)).toBe(false);
  });
});

describe('summarizeAttachments', () => {
  it('le compte Prisma l’emporte sur une lecture bornée', () => {
    expect(summarizeAttachments([{ mimeType: 'image/png', fileSize: 10 }], 60)).toEqual({
      count: 60,
      kinds: { image: 1 },
      totalSize: 10,
    });
  });
});
