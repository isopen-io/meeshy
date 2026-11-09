/**
 * Le pont libsignal se charge À LA DEMANDE et une seule fois (#17114) : le
 * chargeur mémorise l'instance, ne mémorise pas un échec, et aucun module de
 * l'application n'importe le pont ou son WASM statiquement — sinon ses 229 Ko
 * entreraient dans le chunk de l'écran qui l'importe. Le binaire livré est
 * celui que `packages/libsignal-wasm/build.sh` a consigné, à la version que
 * l'écran Licences annonce.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIBSIGNAL_WASM_DIRECTORY, LIBSIGNAL_WASM_FILE, WEB_LIBSIGNAL_ENGINE } from '@/lib/licences/libsignal-engine';

import { libsignalBridgeLoader } from './libsignal-loader';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO = join(WEB_ROOT, '..', '..');

type FakeBridge = { readonly version: string };
const fakeBridge: FakeBridge = { version: 'test' };

const countingImport = (outcomes: readonly ('ok' | 'fail')[]) => {
  const calls: number[] = [];
  const load = (): Promise<FakeBridge> => {
    calls.push(calls.length);
    return outcomes[calls.length - 1] === 'fail' ? Promise.reject(new Error('réseau coupé')) : Promise.resolve(fakeBridge);
  };
  return { load, calls };
};

const sourceFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const STATIC_BRIDGE_IMPORT = /^\s*import\s+(?!type\b)[^;]*from\s+['"][^'"]*(libsignal-bridge|libsignal\/libsignal_wasm)(\.js)?['"]/m;
const ALLOWED_STATIC_IMPORTERS = ['src/lib/e2ee/libsignal-bridge.ts'];

describe('le chargement du pont libsignal (#17114)', () => {
  test('deux appels concurrents ne chargent le pont qu’une fois', async () => {
    const { load, calls } = countingImport(['ok']);
    const loadBridge = libsignalBridgeLoader(load);
    const [first, second] = await Promise.all([loadBridge(), loadBridge()]);
    expect(first).toBe(second);
    expect(calls.length).toBe(1);
  });

  test('un échec de téléchargement n’est pas mémorisé : l’appel suivant retente', async () => {
    const { load, calls } = countingImport(['fail', 'ok']);
    const loadBridge = libsignalBridgeLoader(load);
    expect(await loadBridge().then(() => 'chargé', (error: unknown) => (error instanceof Error ? error.message : 'inconnu'))).toBe('réseau coupé');
    expect((await loadBridge()).version).toBe('test');
    expect(calls.length).toBe(2);
  });

  test('aucun module de l’application n’importe le pont ou son WASM statiquement', () => {
    const offenders = sourceFiles(join(WEB_ROOT, 'src'))
      .map((path) => relative(WEB_ROOT, path))
      .filter((path) => !ALLOWED_STATIC_IMPORTERS.includes(path))
      .filter((path) => STATIC_BRIDGE_IMPORT.test(readFileSync(join(WEB_ROOT, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('le binaire du pont est celui que la construction a consigné (#17114)', () => {
  type Manifest = { readonly libsignal: string; readonly wasmSha256: string; readonly rustToolchain: string; readonly wasmBindgen: string };
  const manifest = JSON.parse(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_DIRECTORY, 'manifest.json'), 'utf8')) as Manifest;
  const cargo = readFileSync(join(REPO, 'packages', 'libsignal-wasm', 'Cargo.toml'), 'utf8');

  test('le condensat du WASM livré est celui du manifeste', () => {
    expect(createHash('sha256').update(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE))).digest('hex')).toBe(manifest.wasmSha256);
  });

  test('le manifeste, la crate, son tag libsignal et l’écran Licences portent la même version', () => {
    expect({
      manifest: manifest.libsignal,
      crate: cargo.match(/^version = "([^"]+)"/m)?.[1],
      tag: cargo.match(/libsignal-protocol = \{[^}]*tag = "v([^"]+)"/)?.[1],
      licences: WEB_LIBSIGNAL_ENGINE?.version,
    }).toEqual({ manifest: manifest.libsignal, crate: manifest.libsignal, tag: manifest.libsignal, licences: manifest.libsignal });
  });

  test('la construction est épinglée : chaîne Rust du dépôt et wasm-bindgen exact', () => {
    expect(manifest.rustToolchain).toBe(readFileSync(join(REPO, 'packages', 'libsignal-wasm', 'rust-toolchain'), 'utf8').trim());
    expect(cargo).toContain(`wasm-bindgen = "=${manifest.wasmBindgen}"`);
  });
});
