/**
 * Tests for hooks/use-message-display.ts
 */

import { renderHook } from '@testing-library/react';
import { useMessageDisplay } from '@/hooks/use-message-display';

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeMessage = (overrides: Partial<Parameters<typeof useMessageDisplay>[0]['message']> = {}) => ({
  id: 'm1',
  content: 'Hello world',
  ...overrides,
});

const render = (
  message: Parameters<typeof useMessageDisplay>[0]['message'],
  currentDisplayLanguage: string
) =>
  renderHook(() => useMessageDisplay({ message, currentDisplayLanguage })).result.current;

// ─── displayContent ───────────────────────────────────────────────────────────

describe('displayContent', () => {
  it('returns originalContent when displayLanguage matches originalLanguage', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      originalContent: 'Bonjour',
      content: 'Bonjour-raw',
    });
    const { displayContent } = render(message, 'fr');
    expect(displayContent).toBe('Bonjour');
  });

  it('falls back to content when originalContent is absent and language matches', () => {
    const message = makeMessage({ originalLanguage: 'en', content: 'Hello' });
    const { displayContent } = render(message, 'en');
    expect(displayContent).toBe('Hello');
  });

  it('defaults to fr when originalLanguage is absent and displayLanguage is fr', () => {
    const message = makeMessage({ originalContent: 'Salut', content: 'raw' });
    const { displayContent } = render(message, 'fr');
    expect(displayContent).toBe('Salut');
  });

  it('returns translation content when language matches a translation (language field)', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      translations: [{ language: 'en', content: 'Hello translated', targetLanguage: 'en' } as any],
    });
    const { displayContent } = render(message, 'en');
    expect(displayContent).toBe('Hello translated');
  });

  it('returns translation content via targetLanguage field', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      translations: [{ targetLanguage: 'es', translatedContent: 'Hola' } as any],
    });
    const { displayContent } = render(message, 'es');
    expect(displayContent).toBe('Hola');
  });

  it('falls back to message.content when no translation matches', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      content: 'fallback',
      translations: [],
    });
    const { displayContent } = render(message, 'de');
    expect(displayContent).toBe('fallback');
  });
});

// ─── displayContentWithMentions ───────────────────────────────────────────────

describe('displayContentWithMentions', () => {
  it('leaves text unchanged when there are no mentions', () => {
    const message = makeMessage({ content: 'Hello world' });
    const { displayContentWithMentions } = render(message, 'fr');
    expect(displayContentWithMentions).toBe('Hello world');
  });

  it('converts validated @mention to markdown link', () => {
    const message = makeMessage({
      content: 'Hello @alice',
      validatedMentions: ['alice'],
    });
    const { displayContentWithMentions } = render(message, 'fr');
    expect(displayContentWithMentions).toBe('Hello [@alice](/u/alice)');
  });

  it('leaves non-validated @mention as plain text', () => {
    const message = makeMessage({
      content: 'Hello @unknown',
      validatedMentions: ['alice'],
    });
    const { displayContentWithMentions } = render(message, 'fr');
    expect(displayContentWithMentions).toBe('Hello @unknown');
  });

  it('handles multiple mentions mixing validated and unvalidated', () => {
    const message = makeMessage({
      content: '@alice and @bob are here',
      validatedMentions: ['alice'],
    });
    const { displayContentWithMentions } = render(message, 'fr');
    expect(displayContentWithMentions).toContain('[@alice](/u/alice)');
    expect(displayContentWithMentions).toContain('@bob');
  });
});

// ─── replyToContent ───────────────────────────────────────────────────────────

describe('replyToContent', () => {
  it('returns null when replyTo is absent', () => {
    const message = makeMessage();
    const { replyToContent } = render(message, 'fr');
    expect(replyToContent).toBeNull();
  });

  it('returns replyTo.originalContent when language matches replyTo.originalLanguage', () => {
    const message = makeMessage({
      replyTo: {
        id: 'r1',
        content: 'raw',
        originalContent: 'Original reply',
        originalLanguage: 'fr',
      },
    });
    const { replyToContent } = render(message, 'fr');
    expect(replyToContent).toBe('Original reply');
  });

  it('returns replyTo.content when originalContent is absent and language matches', () => {
    const message = makeMessage({
      replyTo: { id: 'r1', content: 'Reply content', originalLanguage: 'fr' },
    });
    const { replyToContent } = render(message, 'fr');
    expect(replyToContent).toBe('Reply content');
  });

  it('returns translated replyTo content when translation matches', () => {
    const message = makeMessage({
      replyTo: {
        id: 'r1',
        content: 'fallback',
        originalLanguage: 'fr',
        translations: [{ language: 'en', content: 'English reply' } as any],
      },
    });
    const { replyToContent } = render(message, 'en');
    expect(replyToContent).toBe('English reply');
  });

  it('falls back to replyTo.content when no translation matches', () => {
    const message = makeMessage({
      replyTo: { id: 'r1', content: 'fallback reply', originalLanguage: 'fr', translations: [] },
    });
    const { replyToContent } = render(message, 'de');
    expect(replyToContent).toBe('fallback reply');
  });
});

// ─── availableVersions ────────────────────────────────────────────────────────

describe('availableVersions', () => {
  it('always includes the original as first entry with isOriginal true', () => {
    const message = makeMessage({ originalLanguage: 'fr', originalContent: 'Bonjour' });
    const { availableVersions } = render(message, 'fr');
    expect(availableVersions[0].isOriginal).toBe(true);
    expect(availableVersions[0].language).toBe('fr');
    expect(availableVersions[0].content).toBe('Bonjour');
  });

  it('defaults original language to fr when absent', () => {
    const message = makeMessage({ content: 'Hello' });
    const { availableVersions } = render(message, 'fr');
    expect(availableVersions[0].language).toBe('fr');
  });

  it('includes translations after the original', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      originalContent: 'Bonjour',
      translations: [{ language: 'en', content: 'Hello', targetLanguage: 'en' } as any],
    });
    const { availableVersions } = render(message, 'fr');
    expect(availableVersions).toHaveLength(2);
    expect(availableVersions[1].language).toBe('en');
    expect(availableVersions[1].isOriginal).toBe(false);
  });

  it('returns only original entry when translations are empty', () => {
    const message = makeMessage({ translations: [] });
    const { availableVersions } = render(message, 'fr');
    expect(availableVersions).toHaveLength(1);
  });

  it('sets original confidence to 1 and model to original', () => {
    const message = makeMessage();
    const { availableVersions } = render(message, 'fr');
    expect(availableVersions[0].confidence).toBe(1);
    expect(availableVersions[0].model).toBe('original');
  });
});

// ─── missingLanguages ─────────────────────────────────────────────────────────

describe('missingLanguages', () => {
  it('excludes the original language from missing list', () => {
    const message = makeMessage({ originalLanguage: 'fr', translations: [] });
    const { missingLanguages } = render(message, 'fr');
    expect(missingLanguages.some(l => l.code === 'fr')).toBe(false);
  });

  it('excludes translated languages from missing list', () => {
    const message = makeMessage({
      originalLanguage: 'fr',
      translations: [{ language: 'en', content: 'Hello', targetLanguage: 'en' } as any],
    });
    const { missingLanguages } = render(message, 'en');
    expect(missingLanguages.some(l => l.code === 'en')).toBe(false);
  });

  it('includes languages not yet translated', () => {
    const message = makeMessage({ originalLanguage: 'fr', translations: [] });
    const { missingLanguages } = render(message, 'fr');
    expect(missingLanguages.some(l => l.code === 'en')).toBe(true);
  });
});
