/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { isEmojiOnly } from '../emoji-only';

describe('isEmojiOnly — un contenu fait uniquement d’emojis', () => {
  it('reconnaît un emoji, plusieurs, une séquence ZWJ et un teint', () => {
    expect(isEmojiOnly('😂')).toBe(true);
    expect(isEmojiOnly('❤️👍🏽')).toBe(true);
    expect(isEmojiOnly(' 👨‍👩‍👧 ')).toBe(true);
  });

  it('refuse un texte, un texte avec emoji, un contenu vide et un chiffre nu', () => {
    expect(isEmojiOnly('Bravo')).toBe(false);
    expect(isEmojiOnly('Bravo 😂')).toBe(false);
    expect(isEmojiOnly('   ')).toBe(false);
    expect(isEmojiOnly('7')).toBe(false);
  });
});
