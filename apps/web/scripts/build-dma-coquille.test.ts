/**
 * La construction de la coquille « ami WhatsApp » (#17116) : l'image de la
 * passerelle de staging la lance (`services/gateway/Dockerfile`) sur les seules
 * sources `src/lib/dma-coquille/` et `src/lib/e2ee/` du web, sans aucune
 * dépendance installée. Elle rend une page, un module et le WASM du pont, à
 * l'octet près celui que le web consigne : aucune copie de libsignal.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import { buildDmaCoquille } from './build-dma-coquille';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'coquille-build-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const sources = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-support' ? [] : sources(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });

describe('la construction de la coquille', () => {
  test('rend la page, le module et le WASM du pont, sans rien appeler d’autre que la passerelle', async () => {
    await buildDmaCoquille(out);

    expect(readdirSync(out).sort()).toEqual(['coquille.js', 'index.html', 'libsignal_wasm_bg.wasm']);
    expect(sha256(readFileSync(join(out, 'libsignal_wasm_bg.wasm')))).toBe(sha256(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE))));
    const page = readFileSync(join(out, 'index.html'), 'utf8');
    expect(page).toContain('data-coquille');
    expect(page).toContain('<script type="module" src="./coquille.js"></script>');
    expect(page).not.toMatch(/https?:\/\//);
    expect(readFileSync(join(out, 'coquille.js'), 'utf8')).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  test('ses sources n’importent que la coquille elle-même et le pont libsignal du web', () => {
    const imports = sources(join(WEB_ROOT, 'src', 'lib', 'dma-coquille'))
      .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? ''));
    expect(imports.filter((specifier) => !/^\.\/|^\.\.\/e2ee\/libsignal-bridge$/.test(specifier))).toEqual([]);
  });
});
