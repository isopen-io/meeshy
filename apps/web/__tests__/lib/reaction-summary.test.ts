import { decrementReactionSummary } from '@/lib/reaction-summary';

describe('decrementReactionSummary', () => {
  it('removes the emoji key when the count drops to zero', () => {
    expect(decrementReactionSummary({ '❤️': 1 }, '❤️')).toEqual({});
  });

  it('keeps the emoji when the count stays above zero', () => {
    expect(decrementReactionSummary({ '❤️': 3 }, '❤️')).toEqual({ '❤️': 2 });
  });

  it('leaves other emojis untouched', () => {
    expect(decrementReactionSummary({ '❤️': 1, '😂': 2 }, '❤️')).toEqual({ '😂': 2 });
  });

  it('does not introduce a zero entry for an absent emoji', () => {
    expect(decrementReactionSummary({ '😂': 2 }, '❤️')).toEqual({ '😂': 2 });
  });

  it('handles an undefined summary without adding a residual key', () => {
    expect(decrementReactionSummary(undefined, '❤️')).toEqual({});
  });

  it('handles a null summary without adding a residual key', () => {
    expect(decrementReactionSummary(null, '❤️')).toEqual({});
  });

  it('does not mutate the input summary', () => {
    const input = { '❤️': 1 };
    decrementReactionSummary(input, '❤️');
    expect(input).toEqual({ '❤️': 1 });
  });
});
