import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const CSS = readFileSync(new URL('./lens-section.css', import.meta.url), 'utf8');

const blockOf = (selector: string): string => {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) return '';
  return CSS.slice(start, CSS.indexOf('}', start));
};

describe('lens-section.css — le DOM de la liste reste borné', () => {
  test('les lignes portent content-visibility:auto et contain-intrinsic-size 84', () => {
    const rows = blockOf('li[data-row]');
    expect(rows).toContain('content-visibility: auto');
    expect(rows).toContain('contain-intrinsic-size: auto 84px');
  });

  test('l’entrée d’une ligne est une animation coupée sous prefers-reduced-motion', () => {
    expect(blockOf('.lens-row-entering')).toContain('animation:');
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.lens-row-entering');
    expect(reduced).toContain('animation: none');
  });
});
