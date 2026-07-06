import { detectInterpellation } from '../../reactive/interpellation-detector';

const controlledUserIds = new Set(['bot-alice', 'bot-bob']);

describe('InterpellationDetector', () => {
  it('detects mention of controlled user', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      content: 'Hey @alice what do you think?',
      controlledUserIds,
    });
    expect(result).toEqual({
      detected: true, type: 'mention',
      targetUserIds: ['bot-alice'], isGreeting: false,
    });
  });

  it('detects reply to controlled user', () => {
    const result = detectInterpellation({
      mentionedUserIds: [],
      replyToUserId: 'bot-bob',
      content: 'I agree with that',
      controlledUserIds,
    });
    expect(result).toEqual({
      detected: true, type: 'reply',
      targetUserIds: ['bot-bob'], isGreeting: false,
    });
  });

  it('detects greeting interpellation', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      content: 'Salut @alice!',
      controlledUserIds,
    });
    expect(result.type).toBe('greeting');
    expect(result.isGreeting).toBe(true);
  });

  it('returns not detected when no controlled user involved', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['real-user'],
      replyToUserId: undefined,
      content: 'Hey @someone',
      controlledUserIds,
    });
    expect(result.detected).toBe(false);
  });

  it('falls back to content parsing for @username mentions', () => {
    const result = detectInterpellation({
      mentionedUserIds: [],
      replyToUserId: undefined,
      content: 'Hey @alice tu penses quoi?',
      controlledUserIds,
      controlledUsernames: new Map([['alice', 'bot-alice']]),
    });
    expect(result.detected).toBe(true);
    expect(result.targetUserIds).toEqual(['bot-alice']);
  });

  it('deduplicates mention + reply to same user', () => {
    const result = detectInterpellation({
      mentionedUserIds: ['bot-alice'],
      replyToUserId: 'bot-alice',
      content: '@alice yes!',
      controlledUserIds,
    });
    expect(result.targetUserIds).toEqual(['bot-alice']);
  });
});
