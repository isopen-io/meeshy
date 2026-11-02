import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as glue from '../libsignal/libsignal.js';
import { createLibsignalEngine } from '../libsignal-engine';
import type { E2EECryptoEngine, EngineLocalDevice, RecordReader, RecordWrite } from '../engine';

let engine: E2EECryptoEngine | null = null;

/** Le VRAI libsignal (WASM), initialisé depuis les octets du binaire versionné. */
export function testEngine(): E2EECryptoEngine {
  if (engine) return engine;
  const wasm = readFileSync(fileURLToPath(new URL('../libsignal/libsignal_bg.wasm', import.meta.url)));
  glue.initSync({ module: wasm });
  engine = createLibsignalEngine(glue);
  return engine;
}

/** Des enregistrements en mémoire, sans scellement : pour les témoins du moteur seul. */
export function memoryRecords() {
  const map = new Map<string, Uint8Array>();
  const id = (kind: string, key: string) => `${kind}\u0000${key}`;
  const read: RecordReader = (kind, key) => map.get(id(kind, key));
  const apply = (writes: readonly RecordWrite[]) =>
    writes.forEach((w) => (w.value === null ? map.delete(id(w.kind, w.key)) : map.set(id(w.kind, w.key), w.value)));
  return { read, apply, map };
}

export function testDevice(userId: string, deviceId: number): EngineLocalDevice {
  return { identity: testEngine().generateIdentity(), registrationId: 1 + ((deviceId * 977) % 0x3ffe), userId, deviceId };
}
