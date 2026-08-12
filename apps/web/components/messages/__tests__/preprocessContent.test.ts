import { preprocessContent } from '../preprocess-content';

/**
 * Couverture réelle de `preprocessContent` (pipeline de prétraitement de TOUT
 * message markdown web). Extrait de `MarkdownMessage.tsx` (mocké par Jest à
 * cause de l'ESM `react-markdown`) vers un module pur pour être testable — même
 * pattern que `normalize-markdown` (iter 125).
 *
 * L'environnement Jest est `jsdom`, donc `window.location.origin`
 * (`http://localhost`) est disponible : les liens `m+TOKEN` pointent vers
 * `http://localhost/l/<token>`.
 */
describe('preprocessContent', () => {
  it('leaves plain text untouched', () => {
    expect(preprocessContent('bonjour tout le monde')).toBe('bonjour tout le monde');
  });

  it('preserves an empty string', () => {
    expect(preprocessContent('')).toBe('');
  });

  it('transforms an m+TOKEN short link into a markdown link', () => {
    expect(preprocessContent('m+abc123')).toBe('[m+abc123](http://localhost/l/abc123)');
  });

  it('transforms an m+TOKEN embedded in surrounding text without touching the text', () => {
    expect(preprocessContent('voir m+abc123 stp')).toBe(
      'voir [m+abc123](http://localhost/l/abc123) stp'
    );
  });

  it('transforms every m+TOKEN when several appear in the same message', () => {
    expect(preprocessContent('m+aaa11 et m+bbb22')).toBe(
      '[m+aaa11](http://localhost/l/aaa11) et [m+bbb22](http://localhost/l/bbb22)'
    );
  });

  it('leaves a bare http(s) URL untouched (ReactMarkdown handles it)', () => {
    const url = 'https://example.com/page';
    expect(preprocessContent(`lien ${url} ici`)).toBe(`lien ${url} ici`);
  });

  it('leaves a full tracking link untouched', () => {
    const tracking = 'https://meeshy.me/l/tok99';
    expect(preprocessContent(tracking)).toBe(tracking);
  });

  it('is a lossless reconstruction for text with no special links', () => {
    const content = 'Ligne 1\nLigne 2\n\n- item\n> quote';
    expect(preprocessContent(content)).toBe(content);
  });
});
