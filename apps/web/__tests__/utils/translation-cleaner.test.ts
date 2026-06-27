/**
 * Tests for utils/translation-cleaner.ts
 */

import { cleanTranslationOutput, deepCleanTranslationOutput } from '@/utils/translation-cleaner';

// ─── cleanTranslationOutput ───────────────────────────────────────────────────

describe('cleanTranslationOutput', () => {
  it('returns empty string for empty input', () => {
    expect(cleanTranslationOutput('')).toBe('');
  });

  it('returns empty string for falsy input', () => {
    expect(cleanTranslationOutput(null as unknown as string)).toBe('');
    expect(cleanTranslationOutput(undefined as unknown as string)).toBe('');
  });

  it('removes <extra_id_N> tokens', () => {
    expect(cleanTranslationOutput('Hello <extra_id_0> world')).toBe('Hello world');
    expect(cleanTranslationOutput('<extra_id_99>')).toBe('');
  });

  it('replaces ▁ tokenisation char with space', () => {
    expect(cleanTranslationOutput('Hello▁world')).toBe('Hello world');
  });

  it('removes <pad> and </pad>', () => {
    expect(cleanTranslationOutput('<pad>text</pad>')).toBe('text');
  });

  it('removes <unk> and </unk>', () => {
    expect(cleanTranslationOutput('<unk>word</unk>')).toBe('word');
  });

  it('removes </s> and <s>', () => {
    expect(cleanTranslationOutput('<s>sentence</s>')).toBe('sentence');
    expect(cleanTranslationOutput('</s>')).toBe('');
  });

  it('collapses multiple spaces into one', () => {
    expect(cleanTranslationOutput('too   many   spaces')).toBe('too many spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(cleanTranslationOutput('  hello  ')).toBe('hello');
  });

  it('passes through clean text unchanged', () => {
    expect(cleanTranslationOutput('Bonjour le monde')).toBe('Bonjour le monde');
  });
});

// ─── deepCleanTranslationOutput ──────────────────────────────────────────────

describe('deepCleanTranslationOutput', () => {
  it('returns empty string for empty input', () => {
    expect(deepCleanTranslationOutput('')).toBe('');
  });

  it('applies base cleanTranslationOutput logic first', () => {
    expect(deepCleanTranslationOutput('<pad>Hello</pad>')).toBe('Hello');
  });

  it('adds space after punctuation attached to next word', () => {
    expect(deepCleanTranslationOutput('Hello,world')).toBe('Hello, world');
  });

  it('normalises double quotes around content', () => {
    expect(deepCleanTranslationOutput('"quoted"')).toBe('"quoted"');
  });

  it('removes non-printable control characters', () => {
    expect(deepCleanTranslationOutput('Hello\x00World')).toBe('HelloWorld');
    expect(deepCleanTranslationOutput('Test\x1FEnd')).toBe('TestEnd');
  });

  it('removes space before French punctuation', () => {
    expect(deepCleanTranslationOutput('Bonjour !')).toBe('Bonjour!');
    expect(deepCleanTranslationOutput('Comment allez-vous ?')).toBe('Comment allez-vous?');
  });

  it('trims the result', () => {
    expect(deepCleanTranslationOutput('  clean  ')).toBe('clean');
  });
});
