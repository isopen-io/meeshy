import {
  USER_CRITERIA,
  CONVERSATION_CRITERIA,
  MESSAGE_CRITERIA,
  LINK_CRITERIA,
  RANKING_CRITERIA,
  criterionLabelKey,
  MEDAL_COLORS,
} from '@/components/admin/ranking/constants';

describe('criterionLabelKey', () => {
  it('returns ranking.criteria.{value}', () => {
    expect(criterionLabelKey('messages_sent')).toBe('ranking.criteria.messages_sent');
  });

  it('works for any arbitrary string', () => {
    expect(criterionLabelKey('foo_bar')).toBe('ranking.criteria.foo_bar');
  });
});

describe('RANKING_CRITERIA', () => {
  it('maps users to USER_CRITERIA', () => {
    expect(RANKING_CRITERIA.users).toBe(USER_CRITERIA);
  });

  it('maps conversations to CONVERSATION_CRITERIA', () => {
    expect(RANKING_CRITERIA.conversations).toBe(CONVERSATION_CRITERIA);
  });

  it('maps messages to MESSAGE_CRITERIA', () => {
    expect(RANKING_CRITERIA.messages).toBe(MESSAGE_CRITERIA);
  });

  it('maps links to LINK_CRITERIA', () => {
    expect(RANKING_CRITERIA.links).toBe(LINK_CRITERIA);
  });
});

describe('MEDAL_COLORS', () => {
  it('has 3 colors', () => {
    expect(MEDAL_COLORS).toHaveLength(3);
  });

  it('gold is yellow', () => {
    expect(MEDAL_COLORS[0]).toContain('yellow');
  });

  it('silver is gray', () => {
    expect(MEDAL_COLORS[1]).toContain('gray');
  });

  it('bronze is amber', () => {
    expect(MEDAL_COLORS[2]).toContain('amber');
  });
});

describe('USER_CRITERIA', () => {
  it('includes messages_sent', () => {
    expect(USER_CRITERIA.some((c) => c.value === 'messages_sent')).toBe(true);
  });

  it('every criterion has value and icon', () => {
    USER_CRITERIA.forEach((c) => {
      expect(c.value).toBeTruthy();
      expect(c.icon).toBeTruthy();
    });
  });
});

describe('CONVERSATION_CRITERIA', () => {
  it('includes recent_activity', () => {
    expect(CONVERSATION_CRITERIA.some((c) => c.value === 'recent_activity')).toBe(true);
  });

  it('includes message_count', () => {
    expect(CONVERSATION_CRITERIA.some((c) => c.value === 'message_count')).toBe(true);
  });
});

describe('MESSAGE_CRITERIA', () => {
  it('includes most_reactions', () => {
    expect(MESSAGE_CRITERIA.some((c) => c.value === 'most_reactions')).toBe(true);
  });
});

describe('LINK_CRITERIA', () => {
  it('includes tracking_links_most_visited', () => {
    expect(LINK_CRITERIA.some((c) => c.value === 'tracking_links_most_visited')).toBe(true);
  });
});
