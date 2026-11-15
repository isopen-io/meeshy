import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const css = readFileSync(new URL('./glass.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const blockOf = (selector: string): string => {
  const start = css.search(new RegExp(`(^|\\n)${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{`));
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

const reducedTransparency = (): string => {
  const start = css.indexOf('@media (prefers-reduced-transparency: reduce)');
  return start < 0 ? '' : css.slice(start);
};

/**
 * #17345 · #17418 — le DISQUE de verre dessiné d'un bouton de l'appel : un
 * voile et un liseré, JAMAIS de flou à lui. Le seul `backdrop-filter` d'une
 * pilule est celui de la pilule (60 images par seconde).
 */
describe('glass.css — le disque de verre d’un bouton de l’appel (#17345)', () => {
  test('le disque existe : un voile clair et un liseré', () => {
    const disc = blockOf('.glass-call-disc');
    expect(disc).toContain('background-color');
    expect(disc).toMatch(/border:\s*1px solid/);
  });

  test('le disque ne floute rien : un seul backdrop-filter par pilule', () => {
    expect(blockOf('.glass-call-disc')).not.toContain('backdrop-filter');
    expect(css.match(/\.glass-call-disc[^{]*\{[^}]*backdrop-filter/g)).toBeNull();
  });

  test('le voile est LU depuis une variable : le contraste se mesure sur elle', () => {
    expect(blockOf('.glass-call-disc')).toMatch(/--glass-disc-veil:\s*\d+%/);
  });

  test('sous le doigt, le disque s’éclaircit (le verre dessiné ne réagit pas seul)', () => {
    expect(css).toMatch(/:active\s*>\s*\.glass-call-disc|\.glass-call-disc:active/);
  });

  test('sous Réduire la transparence, le disque devient OPAQUE et la pilule ne floute plus', () => {
    const reduced = reducedTransparency();
    expect(reduced).toContain('.glass-call-disc');
    expect(reduced).toMatch(/\.glass-call-disc[^{]*\{[^}]*background-color:\s*var\(--ios-indigo-/);
    expect(reduced).toMatch(/\.glass-call,[^{]*\.glass-call-prominent[^{]*\{[^}]*backdrop-filter:\s*none/);
  });

  test('sous Réduire la transparence, le verre rouge du bandeau « Vous partagez » ne floute plus non plus (P16.12)', () => {
    expect(reducedTransparency()).toMatch(/\.glass-call-danger[^{]*\{[^}]*backdrop-filter:\s*none/);
  });

  test('sous Réduire les animations, le retour au doigt ne s’anime pas', () => {
    expect(blockOf('.glass-call-disc')).not.toMatch(/transition/);
  });
});
