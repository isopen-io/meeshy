/**
 * Tests for `protectedPreview`, `contentTypeIcon`, and
 * `formatEphemeralDuration` pure helpers.
 *
 * The gateway now produces icon-only sanitised bodies for protected messages
 * (view-once / blurred / ephemeral / encrypted) so the recipient instantly
 * recognises the protection type + content type without the actual content
 * leaking. These tests pin the exact format of the body so:
 *  - iOS push banner (NSE), iOS in-app toast and Android push see the same
 *    icon-only string;
 *  - precedence (ephemeral > view-once > blurred > encrypted) is stable;
 *  - duration formatting stays compact (`30s`, `5min`, `2h`, `3j`);
 *  - the matching `notificationLocKey` is propagated so iOS NSE can fall
 *    back to a localised string ONLY for E2EE-undecryptable pushes.
 *
 * @jest-environment node
 */
import {
  protectedPreview,
  contentTypeIcon,
  formatEphemeralDuration,
} from '../../../../services/notifications/notification-preview';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { ephemeralSendFields } from '../../../../services/messaging/ephemeralSendFields';

describe('contentTypeIcon', () => {
  it.each([
    ['text', '💬'],
    ['audio', '🎵'],
    ['image', '🖼️'],
    ['video', '🎬'],
    ['file', '📎'],
    ['location', '📍'],
    ['system', '⚙️'],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(contentTypeIcon(input)).toBe(expected);
  });

  it('falls back to 💬 for unknown / null / empty messageType', () => {
    expect(contentTypeIcon('unknown')).toBe('💬');
    expect(contentTypeIcon(null)).toBe('💬');
    expect(contentTypeIcon(undefined)).toBe('💬');
    expect(contentTypeIcon('')).toBe('💬');
  });

  it('is case-insensitive', () => {
    expect(contentTypeIcon('AUDIO')).toBe('🎵');
    expect(contentTypeIcon('Image')).toBe('🖼️');
  });
});

describe('formatEphemeralDuration — depuis la DURÉE déclarée (secondes), jamais la colonne (#8344)', () => {
  it('returns "Ns" for sub-minute TTLs', () => {
    expect(formatEphemeralDuration(30)).toBe('30s');
  });

  it('returns "Nmin" for sub-hour TTLs', () => {
    expect(formatEphemeralDuration(300)).toBe('5min');
  });

  it('returns "Nh" for sub-day TTLs', () => {
    expect(formatEphemeralDuration(7200)).toBe('2h');
  });

  it('returns "Nj" for multi-day TTLs', () => {
    expect(formatEphemeralDuration(3 * 86400)).toBe('3j');
  });

  it('returns undefined for non-positive or missing durations', () => {
    expect(formatEphemeralDuration(0)).toBeUndefined();
    expect(formatEphemeralDuration(-5)).toBeUndefined();
    expect(formatEphemeralDuration(Number.NaN)).toBeUndefined();
    expect(formatEphemeralDuration(null)).toBeUndefined();
    expect(formatEphemeralDuration(undefined)).toBeUndefined();
  });
});

describe('protectedPreview', () => {
  const baseCreatedAt = new Date('2026-01-01T10:00:00Z');

  it('returns null when the message has no protection flags', () => {
    expect(
      protectedPreview({
        messageType: 'text',
        isEncrypted: false,
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
      }),
    ).toBeNull();
  });

  it('renders ephemeral text with its declared duration: "🔥 💬 5min"', () => {
    const result = protectedPreview({
      messageType: 'text',
      ephemeralDuration: 300,
      expiresAt: new Date('2026-01-08T10:00:00Z'),
    });
    expect(result?.preview).toBe('🔥 💬 5min');
    expect(result?.locKey).toBe('notification.ephemeral_message');
  });

  it('#8344 — un éphémère de 30 s, tel que l’envoi le STOCKE (colonne = plafond de rétention), annonce 30s, jamais 7j', () => {
    const now = baseCreatedAt;
    const stored = ephemeralSendFields({ ephemeralDuration: 30, now });
    expect(stored.expiresAt?.getTime()).toBeGreaterThan(now.getTime() + 86_400_000);
    const result = protectedPreview({
      messageType: 'text',
      ephemeralDuration: stored.ephemeralDuration,
      expiresAt: stored.expiresAt,
    });
    expect(result?.preview).toBe('🔥 💬 30s');
  });

  it('#8344 — sans durée déclarée, aucun suffixe : la colonne ne dit pas la durée', () => {
    const result = protectedPreview({
      messageType: 'audio',
      expiresAt: new Date('2026-01-08T10:00:00Z'),
    });
    expect(result?.preview).toBe('🔥 🎵');
    expect(result?.locKey).toBe('notification.ephemeral_message');
  });

  it('renders ephemeral via EPHEMERAL effect bit (no expiresAt provided)', () => {
    const result = protectedPreview({
      messageType: 'audio',
      effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
    });
    expect(result?.preview).toBe('🔥 🎵');
  });

  it('renders view-once for various content types', () => {
    expect(protectedPreview({ messageType: 'audio', isViewOnce: true })?.preview).toBe('👁️ 🎵');
    expect(protectedPreview({ messageType: 'image', isViewOnce: true })?.preview).toBe('👁️ 🖼️');
    expect(protectedPreview({ messageType: 'video', isViewOnce: true })?.preview).toBe('👁️ 🎬');
    expect(protectedPreview({ messageType: 'text',  isViewOnce: true })?.preview).toBe('👁️ 💬');
    expect(protectedPreview({ messageType: 'audio', isViewOnce: true })?.locKey)
      .toBe('notification.view_once_message');
  });

  it('renders view-once via VIEW_ONCE effect bit', () => {
    expect(
      protectedPreview({
        messageType: 'audio',
        effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE,
      })?.preview,
    ).toBe('👁️ 🎵');
  });

  it('renders blurred with the fog icon', () => {
    expect(protectedPreview({ messageType: 'image', isBlurred: true })?.preview).toBe('🌫️ 🖼️');
    expect(protectedPreview({ messageType: 'image', isBlurred: true })?.locKey)
      .toBe('notification.hidden_message');
  });

  it('renders blurred via BLURRED effect bit', () => {
    expect(
      protectedPreview({
        messageType: 'image',
        effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED,
      })?.preview,
    ).toBe('🌫️ 🖼️');
  });

  it('renders encrypted with the lock icon', () => {
    expect(protectedPreview({ messageType: 'audio', isEncrypted: true })?.preview).toBe('🔒 🎵');
    expect(protectedPreview({ messageType: 'audio', isEncrypted: true })?.locKey)
      .toBe('notification.encrypted_message');
  });

  // Precedence regression: ephemeral > view-once > blurred > encrypted.
  it('ephemeral wins over view-once + blurred + encrypted', () => {
    const result = protectedPreview({
      messageType: 'audio',
      isEncrypted: true,
      isViewOnce: true,
      isBlurred: true,
      ephemeralDuration: 30,
      expiresAt: new Date('2026-01-08T10:00:00Z'),
    });
    expect(result?.preview).toBe('🔥 🎵 30s');
    expect(result?.locKey).toBe('notification.ephemeral_message');
  });

  it('view-once wins over blurred + encrypted', () => {
    const result = protectedPreview({
      messageType: 'image',
      isEncrypted: true,
      isViewOnce: true,
      isBlurred: true,
    });
    expect(result?.preview).toBe('👁️ 🖼️');
    expect(result?.locKey).toBe('notification.view_once_message');
  });

  it('blurred wins over encrypted', () => {
    const result = protectedPreview({
      messageType: 'text',
      isEncrypted: true,
      isBlurred: true,
    });
    expect(result?.preview).toBe('🌫️ 💬');
    expect(result?.locKey).toBe('notification.hidden_message');
  });

  it('preserves unknown messageType as text icon', () => {
    expect(
      protectedPreview({ messageType: 'unknown-type', isViewOnce: true })?.preview,
    ).toBe('👁️ 💬');
  });
});
