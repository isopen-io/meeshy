import { describe, expect, test } from 'bun:test';

import { decodeHtmlText } from './html-text';

describe('decodeHtmlText — un texte servi échappé, rendu à sa lettre', () => {
  test('les entités que DOMPurify écrit redeviennent leurs caractères', () => {
    expect(decodeHtmlText('3 &lt; 5 &amp;&amp; 6 &gt; 4')).toBe('3 < 5 && 6 > 4');
    expect(decodeHtmlText('L&#39;été &quot;chaud&quot;')).toBe(`L'été "chaud"`);
    expect(decodeHtmlText('Prix&nbsp;:')).toBe('Prix :');
  });

  test('les entités numériques, décimales et hexadécimales', () => {
    expect(decodeHtmlText('&#233;t&#xE9;')).toBe('été');
    expect(decodeHtmlText('&#x1F600;')).toBe('😀');
  });

  test('une seule passe : un double échappement ne se décode qu’une fois', () => {
    expect(decodeHtmlText('&amp;lt;')).toBe('&lt;');
  });

  test('une entité inconnue ou malformée reste telle quelle', () => {
    expect(decodeHtmlText('&bogus; &#xD800; & seul')).toBe('&bogus; &#xD800; & seul');
  });

  test('jamais de HTML produit : une balise échappée reste du TEXTE', () => {
    expect(decodeHtmlText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>');
  });
});
