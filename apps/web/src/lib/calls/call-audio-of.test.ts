import { describe, expect, test } from 'bun:test';

import { callAudioOf } from './call-view';

/**
 * LE SON QU'UN MODE FILME (#8625) — composé par le mode lui-même, depuis l'appel
 * que l'écran lui remet : mon micro d'abord, puis la voix de chacun des autres.
 */
describe('callAudioOf', () => {
  const stream = (id: string) => ({ id }) as unknown as MediaStream;

  test('mon micro, puis les autres ; ce qui n’a pas de flux n’entre pas', () => {
    const mine = stream('mine');
    const amina = stream('amina');
    expect(callAudioOf({ localStream: mine, remoteStreams: { 'u-a': amina } })).toEqual([mine, amina]);
    expect(callAudioOf({ localStream: null, remoteStreams: { 'u-a': amina } })).toEqual([amina]);
  });

  test('sans appel, aucun son', () => {
    expect(callAudioOf()).toEqual([]);
    expect(callAudioOf({})).toEqual([]);
  });
});
