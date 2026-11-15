import { describe, it, expect } from 'vitest';
import {
  resolveLastMessageSummaryKind,
  isLastMessageProtected
} from '../../utils/last-message-protection.js';

const NOW = new Date('2026-09-12T12:00:00Z');
const PAST = new Date('2026-09-12T11:00:00Z');
const FUTURE = new Date('2026-09-12T13:00:00Z');

describe('resolveLastMessageSummaryKind — miroir de LastMessageSummaryKind (iOS)', () => {
  it('returns "standard" for a message carrying no protection flag', () => {
    expect(resolveLastMessageSummaryKind({}, NOW)).toBe('standard');
  });

  it('returns "hidden" for a blurred message', () => {
    expect(resolveLastMessageSummaryKind({ isBlurred: true }, NOW)).toBe('hidden');
  });

  it('returns "viewOnce" for a view-once message', () => {
    expect(resolveLastMessageSummaryKind({ isViewOnce: true }, NOW)).toBe('viewOnce');
  });

  it('returns "expired" for a message whose expiresAt is in the past', () => {
    expect(resolveLastMessageSummaryKind({ expiresAt: PAST }, NOW)).toBe('expired');
  });

  it('treats expiresAt exactly equal to now as expired (inclusive bound)', () => {
    expect(resolveLastMessageSummaryKind({ expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('returns "ephemeralActive" for a message whose expiresAt is still in the future', () => {
    expect(resolveLastMessageSummaryKind({ expiresAt: FUTURE }, NOW)).toBe('ephemeralActive');
  });

  it('judges expiry BEFORE blur — an expired+blurred message is "expired", not "hidden"', () => {
    expect(resolveLastMessageSummaryKind({ isBlurred: true, expiresAt: PAST }, NOW)).toBe('expired');
  });

  it('judges blur BEFORE view-once — a blurred+view-once message is "hidden"', () => {
    expect(resolveLastMessageSummaryKind({ isBlurred: true, isViewOnce: true }, NOW)).toBe('hidden');
  });

  it('accepts an ISO string for expiresAt, not just a Date', () => {
    expect(resolveLastMessageSummaryKind({ expiresAt: PAST.toISOString() }, NOW)).toBe('expired');
  });
});

describe('isLastMessageProtected', () => {
  it('is false for a standard message', () => {
    expect(isLastMessageProtected({}, NOW)).toBe(false);
  });

  it('is false for a still-active ephemeral message — it stays readable until it expires', () => {
    expect(isLastMessageProtected({ expiresAt: FUTURE }, NOW)).toBe(false);
  });

  it('is true for a blurred message', () => {
    expect(isLastMessageProtected({ isBlurred: true }, NOW)).toBe(true);
  });

  it('is true for a view-once message', () => {
    expect(isLastMessageProtected({ isViewOnce: true }, NOW)).toBe(true);
  });

  it('is true for an expired ephemeral message', () => {
    expect(isLastMessageProtected({ expiresAt: PAST }, NOW)).toBe(true);
  });
});

describe('flamme-œil (#8634) — disparaît après lecture, jamais lisible dans une ligne de liste', () => {
  const AFTER_READ = 1 | 8;

  it('rend "afterRead" pour le bit EPHEMERAL_AFTER_READ, même quand la colonne porte le plafond de rétention', () => {
    expect(resolveLastMessageSummaryKind({ effectFlags: AFTER_READ, expiresAt: FUTURE }, NOW)).toBe('afterRead');
  });

  it("n'expire pas sur la colonne : c'est l'heure INTERNE de destruction, pas l'échéance d'un lecteur", () => {
    expect(resolveLastMessageSummaryKind({ effectFlags: AFTER_READ, expiresAt: PAST }, NOW)).toBe('afterRead');
  });

  it('laisse la vue unique et le flou passer devant', () => {
    expect(resolveLastMessageSummaryKind({ effectFlags: AFTER_READ, isViewOnce: true }, NOW)).toBe('viewOnce');
    expect(resolveLastMessageSummaryKind({ effectFlags: AFTER_READ, isBlurred: true }, NOW)).toBe('hidden');
  });

  it('est protégée : ni texte, ni traduction, ni pièce jointe ne partent', () => {
    expect(isLastMessageProtected({ effectFlags: AFTER_READ, expiresAt: FUTURE }, NOW)).toBe(true);
  });

  it("un éphémère à DURÉE reste lisible jusqu'à son échéance", () => {
    expect(isLastMessageProtected({ effectFlags: 1, ephemeralDuration: 300, expiresAt: FUTURE }, NOW)).toBe(false);
  });
});
