import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { conversationAccentStyle } from '../use-conversation-accent';

describe('conversationAccentStyle — un accent par conversation, jamais d’indigo en dur', () => {
  it('publishes the shared palette as CSS custom properties', () => {
    const conversation = { id: 'c1', title: 'Week-end Ardèche', type: 'group', language: 'fr' };
    const expected = conversationAccentPalette({ name: 'Week-end Ardèche', type: 'group', language: 'fr' });

    expect(conversationAccentStyle(conversation)).toEqual({
      '--conv-accent': expected.primary,
      '--conv-accent-secondary': expected.secondary,
      '--conv-accent-soft': `${expected.primary}1F`,
    });
  });

  // Deux conversations différentes ne peuvent pas partager le même accent, sinon
  // le ring de focus ne dit plus « où je suis ».
  it('gives different conversation types different accents', () => {
    const group = conversationAccentStyle({ id: 'c1', title: 'Ardèche', type: 'group', language: 'fr' });
    const direct = conversationAccentStyle({ id: 'c2', title: 'Ardèche', type: 'direct', language: 'fr' });

    expect(group!['--conv-accent']).not.toBe(direct!['--conv-accent']);
  });

  it('is deterministic — the same conversation always gets the same accent', () => {
    const conversation = { id: 'c1', title: 'Ardèche', type: 'group', language: 'fr' };

    expect(conversationAccentStyle(conversation)).toEqual(conversationAccentStyle(conversation));
  });

  it('falls back to the name hash when the type is unknown', () => {
    const style = conversationAccentStyle({ id: 'c1', title: 'Ardèche', type: '' as never });

    expect(style!['--conv-accent']).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('returns nothing without a conversation so callers can spread it safely', () => {
    expect(conversationAccentStyle(null)).toBeUndefined();
    expect(conversationAccentStyle(undefined)).toBeUndefined();
  });
});
