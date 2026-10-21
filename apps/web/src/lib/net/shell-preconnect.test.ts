import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { PRODUCTION_ORIGIN, resolveApiConfig } from '@/lib/api/config';
import { shellApiOrigin, withApiPreconnect } from '@/lib/net/shell-preconnect';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const HTML = '<html><head><title>Meeshy</title></head><body></body></html>';

describe('la coque préconnecte la passerelle dès le HTML (#10534)', () => {
  for (const declared of [undefined, '', '   ', '/api/v1', 'https://gate.staging.meeshy.me', 'https://gate.staging.meeshy.me/api/v1/', 'http://10.0.2.2:3000/']) {
    test(`l'origine préconnectée est celle que la coque appellera (VITE_API_BASE=${JSON.stringify(declared)})`, () => {
      const base = resolveApiConfig(declared === undefined ? {} : { VITE_API_BASE: declared }, { shell: true }).base;
      expect(shellApiOrigin(declared)).toBe(new URL(base).origin);
    });
  }

  test('sans base déclarée, la coque vise la production', () => {
    expect(shellApiOrigin(undefined)).toBe(PRODUCTION_ORIGIN);
  });

  test('le lien part dans le <head>, en CORS anonyme comme les fetch de la passerelle', () => {
    const html = withApiPreconnect(HTML, 'https://gate.meeshy.me');
    expect(html).toContain('<link rel="preconnect" href="https://gate.meeshy.me" crossorigin /></head>');
    expect(html.indexOf('rel="preconnect"')).toBeLessThan(html.indexOf('</head>'));
  });

  test('le build de la coque, et lui seul, injecte le lien', () => {
    const config = readFileSync(join(APP, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/forCapacitor\s*\?\s*\[[^\]]*shellApiPreconnect\(\)/);
  });
});
