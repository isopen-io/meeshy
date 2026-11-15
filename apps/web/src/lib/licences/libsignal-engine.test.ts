import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIBSIGNAL_WASM_DIRECTORY, WEB_LIBSIGNAL_ENGINE, libsignalEngineAt } from './libsignal-engine';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const bundlesTheWasmEngine = (): boolean => {
  const directory = join(webRoot, LIBSIGNAL_WASM_DIRECTORY);
  return existsSync(directory) && readdirSync(directory).some((file) => file.endsWith('.wasm'));
};

describe('le moteur libsignal du bundle web (#14628)', () => {
  test('la mention AGPL suit la présence du pont WASM, jamais un drapeau oublié', () => {
    expect(WEB_LIBSIGNAL_ENGINE !== null).toBe(bundlesTheWasmEngine());
  });

  test('les avis renvoient au tag épinglé de libsignal', () => {
    expect(libsignalEngineAt('0.105.4').acknowledgmentsUrl).toBe('https://github.com/signalapp/libsignal/tree/v0.105.4/acknowledgments');
  });
});
