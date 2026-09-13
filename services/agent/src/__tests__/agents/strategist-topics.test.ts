import { selectProvocationTopic, rankProvocationTopics, renderProvocationHint } from '../../agents/strategist';
import type { TopicCatalogEntry } from '../../topics/types';

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1', slug: 's1', label: 'L1', description: null,
    keywordPatterns: [], instructionTemplate: 'Sample {{label}}',
    searchHintTemplate: 'sample {{label}}',
    examples: [], cooldownMinutes: 60, isActive: true, priority: 0,
    ...overrides,
  };
}

describe('strategist topic selection', () => {
  test('selectProvocationTopic returns null if eligible empty', () => {
    const compiled = new Map<string, RegExp[]>();
    const result = selectProvocationTopic([], compiled, 'haystack text');
    expect(result).toBeNull();
  });

  test('selectProvocationTopic picks from top-3 by regex score', () => {
    const compiled = new Map<string, RegExp[]>([
      ['t1', [/ai/i]],
      ['t2', [/ai/i, /llm/i]],
      ['t3', []],
    ]);
    const topics = [
      makeTopic({ id: 't1', label: 'AI' }),
      makeTopic({ id: 't2', label: 'AI-LLM' }),
      makeTopic({ id: 't3', label: 'Other' }),
    ];
    const result = selectProvocationTopic(topics, compiled, 'ai is great llm too');
    expect(['t1', 't2', 't3']).toContain(result?.id);
  });

  test('renderProvocationHint substitutes template variables', () => {
    const topic = makeTopic({
      label: 'IA',
      instructionTemplate: 'Sujet sur {{label}} dans {{conversationTitle}}',
      searchHintTemplate: '{{label}} news',
    });
    const hint = renderProvocationHint(topic, {
      conversationTitle: 'Devs talk',
      conversationDescription: '',
    });
    expect(hint.instruction).toBe('Sujet sur IA dans Devs talk');
    expect(hint.searchHint).toBe('IA news');
    expect(hint.topicCategory).toBe('s1');
  });
});

describe('strategist topic ranking — priority and ties', () => {
  test('rankProvocationTopics adds the admin priority to the regex score', () => {
    const compiled = new Map<string, RegExp[]>([
      ['tech', [/kubernetes/i]],
      ['kongossa', []],
    ]);
    const topics = [
      makeTopic({ id: 'tech', slug: 'tech', priority: 0 }),
      makeTopic({ id: 'kongossa', slug: 'kongossa', priority: 3 }),
    ];
    const ranked = rankProvocationTopics(topics, compiled, 'on parle de kubernetes ici');
    expect(ranked.map((r) => r.topic.id)).toEqual(['kongossa', 'tech']);
    expect(ranked.map((r) => r.score)).toEqual([3, 1]);
  });

  test('a strong regex match still beats a modest priority', () => {
    const compiled = new Map<string, RegExp[]>([
      ['tech', [/kubernetes/i, /docker/i]],
      ['kongossa', []],
    ]);
    const topics = [
      makeTopic({ id: 'tech', slug: 'tech', priority: 0 }),
      makeTopic({ id: 'kongossa', slug: 'kongossa', priority: 2 }),
    ];
    const ranked = rankProvocationTopics(topics, compiled, 'kubernetes docker kubernetes');
    expect(ranked[0].topic.id).toBe('tech');
  });

  test('a topic without priority behaves as priority 0', () => {
    const compiled = new Map<string, RegExp[]>();
    const ranked = rankProvocationTopics([makeTopic({ id: 'x' })], compiled, '');
    expect(ranked[0].score).toBe(0);
  });

  test('selectProvocationTopic draws among tied topics instead of taking the first three of the list', () => {
    const compiled = new Map<string, RegExp[]>();
    const topics = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeTopic({ id, slug: id }));
    const picked = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const t = selectProvocationTopic(topics, compiled, 'no signal at all');
      if (t) picked.add(t.id);
    }
    expect(picked.size).toBeGreaterThan(3);
  });

  test('selectProvocationTopic always keeps the best-scored topic in the pool', () => {
    const compiled = new Map<string, RegExp[]>([['best', [/douala/i]]]);
    const topics = [
      ...['a', 'b', 'c', 'd'].map((id) => makeTopic({ id, slug: id })),
      makeTopic({ id: 'best', slug: 'best' }),
    ];
    const picked = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = selectProvocationTopic(topics, compiled, 'ça se passe à Douala');
      if (t) picked.add(t.id);
    }
    expect(picked.has('best')).toBe(true);
    expect(picked.size).toBeLessThanOrEqual(topics.length);
  });
});
