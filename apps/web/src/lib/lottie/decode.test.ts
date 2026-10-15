import { describe, expect, test } from 'bun:test';
import { strToU8, zipSync } from 'fflate';

import { LOTTIE_LIMITS } from '@meeshy/shared/utils/lottie-validate';

import { decodeLottie } from './decode';

const animation = { v: '5.7.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, layers: [{ ty: 4 }] };
const json = (value: unknown): Uint8Array => strToU8(JSON.stringify(value));

describe('lire une animation Lottie, .lottie ou JSON (#10638)', () => {
  test('un JSON valide est lu', async () => {
    expect(await decodeLottie(json(animation))).toEqual({ ok: true, animation });
  });

  test('un .lottie est dézippé : le manifeste désigne l’animation', async () => {
    const zip = zipSync({
      'manifest.json': json({ version: '1', animations: [{ id: 'mee' }] }),
      'animations/autre.json': json({ ...animation, w: 1 }),
      'animations/mee.json': json(animation),
    });
    expect(await decodeLottie(zip)).toEqual({ ok: true, animation });
  });

  test('un .lottie sans manifeste lisible retombe sur la première animation', async () => {
    const zip = zipSync({ 'manifest.json': strToU8('pas du json'), 'animations/a.json': json(animation) });
    expect((await decodeLottie(zip)).ok).toBe(true);
  });

  test('un .lottie sans animation est refusé', async () => {
    expect(await decodeLottie(zipSync({ 'manifest.json': json({}) }))).toEqual({ ok: false, reason: 'unreadable' });
  });

  test('un JSON invalide est rejeté avec sa raison', async () => {
    expect(await decodeLottie(json({ ...animation, fr: 999 }))).toEqual({ ok: false, reason: 'fps' });
    expect(await decodeLottie(strToU8('{pas json'))).toEqual({ ok: false, reason: 'unreadable' });
  });

  test('le plafond d’octets s’applique au fichier reçu', async () => {
    expect(await decodeLottie(new Uint8Array(LOTTIE_LIMITS.maxBytes + 1))).toEqual({ ok: false, reason: 'bytes' });
  });
});
