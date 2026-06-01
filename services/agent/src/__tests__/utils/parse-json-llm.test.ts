import { parseJsonLlm } from '../../utils/parse-json-llm';

describe('parseJsonLlm', () => {
  describe('well-formed input (regression)', () => {
    it('parses raw JSON object', () => {
      expect(parseJsonLlm('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
    });

    it('parses raw JSON array', () => {
      expect(parseJsonLlm('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('strips ```json fences', () => {
      expect(parseJsonLlm('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it('strips bare ``` fences', () => {
      expect(parseJsonLlm('```\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it('extracts JSON surrounded by prose', () => {
      expect(parseJsonLlm('Voici le plan: {"a":1} merci')).toEqual({ a: 1 });
    });
  });

  describe('tolerant repair of common LLM deviations', () => {
    it('handles trailing comma in object (prod failure: "Expected double-quoted property name")', () => {
      expect(parseJsonLlm('{"shouldIntervene":true,"interventions":[],}')).toEqual({
        shouldIntervene: true,
        interventions: [],
      });
    });

    it('handles trailing comma in array', () => {
      expect(parseJsonLlm('{"interventions":[{"type":"reaction"},]}')).toEqual({
        interventions: [{ type: 'reaction' }],
      });
    });

    it('handles single-quoted property names', () => {
      expect(parseJsonLlm("{'type':'message','asUserId':'abc'}")).toEqual({
        type: 'message',
        asUserId: 'abc',
      });
    });

    it('handles single-quoted string values', () => {
      expect(parseJsonLlm('{"emoji":\'✨\'}')).toEqual({ emoji: '✨' });
    });

    it('handles the exact prod-shaped nested plan with trailing comma', () => {
      const llmOutput = [
        '```json',
        '{',
        '  "shouldIntervene": true,',
        '  "reason": "relance",',
        '  "interventions": [',
        '    {',
        '      "type": "message",',
        '      "asUserId": "68f76b6f",',
        '      "topic": "actualite",',
        '      "needsWebSearch": false,',
        '    },',
        '  ],',
        '}',
        '```',
      ].join('\n');
      expect(parseJsonLlm(llmOutput)).toEqual({
        shouldIntervene: true,
        reason: 'relance',
        interventions: [
          { type: 'message', asUserId: '68f76b6f', topic: 'actualite', needsWebSearch: false },
        ],
      });
    });

    it('does not corrupt apostrophes inside double-quoted values', () => {
      expect(parseJsonLlm('{"content":"C\'est la vérité, non?"}')).toEqual({
        content: "C'est la vérité, non?",
      });
    });

    it('does not corrupt commas inside string values', () => {
      expect(parseJsonLlm('{"reason":"un, deux, trois"}')).toEqual({
        reason: 'un, deux, trois',
      });
    });
  });

  describe('truncated output (LLM hit the token cap)', () => {
    it('repairs JSON cut off mid-array', () => {
      const truncated = '{"shouldIntervene":true,"interventions":[{"type":"reaction","emoji":"✨"';
      expect(parseJsonLlm(truncated)).toEqual({
        shouldIntervene: true,
        interventions: [{ type: 'reaction', emoji: '✨' }],
      });
    });

    it('repairs JSON cut off mid-string', () => {
      const truncated = '{"reason":"la conversation est mort';
      const result = parseJsonLlm<{ reason: string }>(truncated);
      expect(result.reason.startsWith('la conversation est mort')).toBe(true);
    });
  });

  describe('unrecoverable input', () => {
    it('throws on input with no JSON structure', () => {
      expect(() => parseJsonLlm('no json here at all')).toThrow();
    });
  });
});
