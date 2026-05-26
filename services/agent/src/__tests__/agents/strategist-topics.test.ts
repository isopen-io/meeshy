import { selectProvocationTopic, renderProvocationHint } from '../../agents/strategist';
import type { TopicCatalogEntry } from '../../topics/types';

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1', slug: 's1', label: 'L1', description: null,
    keywordPatterns: [], instructionTemplate: 'Sample {{label}}',
    searchHintTemplate: 'sample {{label}}',
    examples: [], cooldownMinutes: 60, isActive: true,
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
