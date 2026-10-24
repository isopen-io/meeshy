import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

const LAW = stripComments(read('./longpress-veil.css'));

const VEILS = [
  { sheet: './thread-menu.css', selector: '.message-menu-backdrop' },
  { sheet: './conversation-peek.css', selector: '.conversation-peek-veil' },
] as const;

const COMPONENTS = ['../components/message-menu.tsx', '../components/row-actions.tsx', '../components/contact-card-sheet.tsx'];

const blockOf = (css: string, selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return '';
  return css.slice(start, css.indexOf('}', start));
};

const declaration = (block: string, property: string): string | undefined =>
  new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim();

describe('longpress-veil.css — le voile de l’appui long est le matériau système (#11222)', () => {
  test('le jeton porte UN flou de 20 px saturé et UN assombrissement de 30 %', () => {
    const root = blockOf(`\n${LAW}`, ':root');
    expect(declaration(root, '--longpress-veil-backdrop')).toMatch(/^blur\(20px\) saturate\(\d+%\)$/);
    expect(declaration(root, '--longpress-veil-tint')).toBe('color-mix(in srgb, black 30%, transparent)');
  });

  test('sans backdrop-filter, le voile se replie sur une teinte plus dense', () => {
    const fallback = LAW.slice(LAW.indexOf('@supports not'));
    expect(fallback).toContain('backdrop-filter: blur(1px)');
    expect(fallback).toContain('--longpress-veil-tint');
  });

  test('sous prefers-reduced-transparency, le voile est OPAQUE et ne floute plus', () => {
    const reduced = LAW.slice(LAW.indexOf('@media (prefers-reduced-transparency: reduce)'));
    expect(reduced).toContain('--longpress-veil-backdrop: none');
    const tint = /--longpress-veil-tint:\s*([^;]+);/.exec(reduced)?.[1] ?? '';
    expect(tint).not.toContain('transparent');
  });
});

describe('les voiles de l’appui long lisent le jeton, et rien d’autre', () => {
  for (const { sheet, selector } of VEILS) {
    const css = stripComments(read(sheet));

    test(`${selector} importe la loi et lit ses deux jetons`, () => {
      expect(css).toContain("@import './longpress-veil.css';");
      const block = blockOf(css, selector);
      expect(declaration(block, 'backdrop-filter')).toBe('var(--longpress-veil-backdrop)');
      expect(declaration(block, 'background-color')).toBe('var(--longpress-veil-tint)');
    });

    test(`${sheet} ne pose aucun flou littéral ni surcharge de schéma sur le voile`, () => {
      expect(css).not.toMatch(/backdrop-filter\s*:\s*blur\(/);
      expect(css).not.toContain(`:root.light ${selector}`);
    });
  }

  for (const component of COMPONENTS) {
    test(`${component} ne réécrit pas le voile en style inline`, () => {
      expect(read(component)).not.toMatch(/[bB]ackdropFilter\s*:/);
    });
  }
});
