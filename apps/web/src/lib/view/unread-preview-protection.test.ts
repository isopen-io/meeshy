import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { unreadPreviewText, type UnreadPreviewMessage } from './unread-below';

/**
 * LE BOUTON « REVENIR EN BAS » NE MONTRE JAMAIS CE QUE LA BULLE VOILE (#12993).
 * La passerelle sert aux membres le texte d'une vue unique ou d'un message
 * flouté, pour que le client le voile : le bouton le peignait en clair à côté
 * de la bulle voilée.
 */

const NOW = Date.parse('2026-10-25T20:00:00Z');

const message = (overrides: Partial<UnreadPreviewMessage> = {}): UnreadPreviewMessage => ({
  isEncrypted: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const SECRET = 'Le code du coffre est 4417';

describe('unreadPreviewText applique la loi de protection (#12993)', () => {
  test('un message ordinaire montre son texte servi', () => {
    expect(unreadPreviewText(message(), SECRET, NOW)).toBe(SECRET);
  });

  const protectedCases: ReadonlyArray<readonly [string, Partial<UnreadPreviewMessage>]> = [
    ['une vue unique', { isViewOnce: true }],
    ['une vue unique déclarée par ses seuls drapeaux', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
    ['un message flouté', { isBlurred: true }],
    ['un message flouté déclaré par ses seuls drapeaux', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
    ['un éphémère expiré', { expiresAt: new Date('2026-10-25T19:00:00Z'), ephemeralDuration: 60 }],
    ['un message supprimé', { deletedAt: new Date('2026-10-25T19:30:00Z') }],
  ];

  for (const [label, overrides] of protectedCases) {
    test(`${label} ne montre jamais son texte`, () => {
      expect(unreadPreviewText(message(overrides), SECRET, NOW)).toBeNull();
    });
  }

  test('un éphémère encore valable reste lisible, comme dans sa bulle', () => {
    expect(unreadPreviewText(message({ expiresAt: new Date('2026-10-25T21:00:00Z'), ephemeralDuration: 3600 }), SECRET, NOW)).toBe(SECRET);
  });
});
