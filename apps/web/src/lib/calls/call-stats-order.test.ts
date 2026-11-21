import { describe, expect, test } from 'bun:test';

import { readMediaQuality } from './call-analytics-read';
import { readStats } from './call-quality';

/**
 * #20256 — `RTCStatsReport` est une table : l'ordre de ses entrées n'a aucun sens.
 * Un même relevé, lu dans n'importe quel ordre, affiche le même codec, la même
 * limitation et élit la même paire ICE (miroir iOS `CallStatsStreamOrderTests`,
 * `CallStatsElectionOrderTests` ; Android `CallStatsStreamOrderTest`, `CallStatsElectionOrderTest`).
 */

type Entry = Readonly<Record<string, unknown>>;

const report = (entries: readonly Entry[]) => ({ forEach: (fn: (entry: Entry) => void) => entries.forEach(fn) });

const rotations = <T>(list: readonly T[]): readonly (readonly T[])[] => list.map((_, index) => [...list.slice(index), ...list.slice(0, index)]);

const orders = <T>(list: readonly T[]): readonly (readonly T[])[] => [...rotations(list), ...rotations([...list].reverse())];

const everyOrder = <R>(entries: readonly Entry[], read: (entries: readonly Entry[]) => R): readonly R[] => [...new Set(orders(entries).map((order) => JSON.stringify(read(order))))].map((text) => JSON.parse(text) as R);

const codecOf = (entries: readonly Entry[]) => readStats(report(entries), 0).codec;
const reasonOf = (entries: readonly Entry[]) => readMediaQuality(report(entries)).qualityLimitationReason;
const linkOf = (entries: readonly Entry[]) => {
  const read = readStats(report(entries), 0);
  const media = readMediaQuality(report(entries));
  return { rtt: Math.round(read.rtt), bitrate: read.availableOutgoingBitrate, path: read.path, candidateType: media.candidateType };
};

const codec = (id: string, mimeType: string): Entry => ({ type: 'codec', id, mimeType });
const inbound = (id: string, kind: string | undefined, codecId: string | undefined): Entry => ({ type: 'inbound-rtp', id, ...(kind === undefined ? {} : { kind }), ...(codecId === undefined ? {} : { codecId }), packetsReceived: 10 });
const outbound = (id: string, reason: string | undefined, kind = 'video'): Entry => ({ type: 'outbound-rtp', id, kind, ...(reason === undefined ? {} : { qualityLimitationReason: reason }) });

const pair = (id: string, local: string, extra: Entry = {}): Entry => ({ type: 'candidate-pair', id, state: 'succeeded', nominated: true, localCandidateId: local, ...extra });
const transport = (id: string, selecting: string): Entry => ({ type: 'transport', id, selectedCandidatePairId: selecting });
const local = (id: string, candidateType: string): Entry => ({ type: 'local-candidate', id, candidateType });

describe('le codec affiché est le codec REÇU, quel que soit l’ordre des flux (#20256)', () => {
  test('l’audio reçu passe avant la vidéo listée d’abord', () => {
    expect(everyOrder([inbound('IA', 'video', 'C_h264'), inbound('IZ', 'audio', 'C_opus'), codec('C_opus', 'audio/opus'), codec('C_h264', 'video/H264')], codecOf)).toEqual(['opus']);
  });

  test('un flux sans `kind` compte comme audio', () => {
    expect(everyOrder([inbound('IA', 'video', 'C_vp8'), inbound('IZ', undefined, 'C_opus'), codec('C_opus', 'audio/opus'), codec('C_vp8', 'video/VP8')], codecOf)).toEqual(['opus']);
  });

  test('deux flux audio se départagent par le plus petit id', () => {
    expect(everyOrder([inbound('IA2', 'audio', 'C_g722'), inbound('IA1', 'audio', 'C_opus'), codec('C_opus', 'audio/opus'), codec('C_g722', 'audio/G722')], codecOf)).toEqual(['opus']);
  });

  test('un codec audio absent de la table est sauté au profit du codec vidéo résolu', () => {
    expect(everyOrder([inbound('IA', 'audio', 'ghost'), inbound('IV', 'video', 'C_vp8'), codec('C_vp8', 'video/VP8')], codecOf)).toEqual(['VP8']);
  });

  test('un codecId vide ne prend pas la place d’un codec résolu', () => {
    expect(everyOrder([inbound('IA0', 'audio', ''), inbound('IA1', 'audio', 'C_opus'), codec('', 'audio/PCMU'), codec('C_opus', 'audio/opus')], codecOf)).toEqual(['opus']);
  });

  test('le codec émis ne compte plus ; aucun codec reçu résolu ne donne aucun codec', () => {
    expect(everyOrder([inbound('IA', 'audio', 'ghost'), inbound('IV', 'video', undefined), { type: 'outbound-rtp', id: 'O', kind: 'video', bytesSent: 10, codecId: 'C_vp8' }, codec('C_vp8', 'video/VP8')], codecOf)).toEqual([null]);
  });
});

describe('la limitation retenue est la plus contraignante, quel que soit l’ordre des flux (#20256)', () => {
  test('une cause qui nomme une clé du prototype ne passe pas devant bandwidth', () => {
    ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].forEach((reason) => {
      expect(everyOrder([outbound('OA', reason), outbound('OB', 'bandwidth')], reasonOf)).toEqual(['bandwidth']);
    });
  });

  test('bandwidth l’emporte sur cpu', () => {
    expect(everyOrder([outbound('OA', 'cpu'), outbound('OB', 'bandwidth')], reasonOf)).toEqual(['bandwidth']);
  });

  test('cpu l’emporte sur other, other sur none', () => {
    expect(everyOrder([outbound('OA', 'other'), outbound('OB', 'cpu'), outbound('OC', 'none')], reasonOf)).toEqual(['cpu']);
    expect(everyOrder([outbound('OA', 'none'), outbound('OB', 'other')], reasonOf)).toEqual(['other']);
  });

  test('à égalité de rang, le plus petit id l’emporte', () => {
    expect(everyOrder([outbound('O2', 'quantum'), outbound('O1', 'none')], reasonOf)).toEqual(['none']);
  });

  test('une raison vide est ignorée, et l’audio ne compte pas', () => {
    expect(everyOrder([outbound('O0', ''), outbound('O1', 'none'), outbound('OA', 'bandwidth', 'audio')], reasonOf)).toEqual(['none']);
  });
});

describe('la paire ICE élue ne dépend pas de l’ordre du relevé (#20256)', () => {
  test('la paire nommée par le transport l’emporte sur une paire nominée plus prioritaire', () => {
    const entries = [
      transport('T1', 'CP2'),
      pair('CP1', 'L1', { priority: 900, currentRoundTripTime: 0.05, availableOutgoingBitrate: 2_000_000 }),
      pair('CP2', 'L2', { priority: 100, nominated: false, currentRoundTripTime: 0.2, availableOutgoingBitrate: 800_000 }),
      local('L1', 'host'),
      local('L2', 'relay'),
    ];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 200, bitrate: 800_000, path: 'relay', candidateType: 'relay' }]);
  });

  test('deux transports : le plus petit id nomme la paire', () => {
    const entries = [transport('T02', 'CP1'), transport('T01', 'CP2'), pair('CP1', 'L1', { currentRoundTripTime: 0.05 }), pair('CP2', 'L2', { currentRoundTripTime: 0.2 }), local('L1', 'relay'), local('L2', 'host')];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 200, bitrate: null, path: 'direct', candidateType: 'host' }]);
  });

  test('un transport qui nomme une paire absente cède au transport suivant', () => {
    const entries = [transport('T01', 'ghost'), transport('T02', 'CP2'), pair('CP1', 'L1', { priority: 900, currentRoundTripTime: 0.05 }), pair('CP2', 'L2', { currentRoundTripTime: 0.2 }), local('L1', 'relay'), local('L2', 'host')];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 200, bitrate: null, path: 'direct', candidateType: 'host' }]);
  });

  test('sans transport, la paire nominée de plus forte priorité l’emporte', () => {
    const entries = [pair('CP1', 'L1', { priority: 100, currentRoundTripTime: 0.05 }), pair('CP2', 'L2', { priority: 900, currentRoundTripTime: 0.2 }), pair('CP3', 'L1', { priority: 5000, nominated: false, currentRoundTripTime: 0.4 }), local('L1', 'host'), local('L2', 'relay')];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 200, bitrate: null, path: 'relay', candidateType: 'relay' }]);
  });

  test('à priorité égale, le plus petit id ; une priorité NaN ou négative vaut 0', () => {
    const tied = [pair('CP2', 'L2', { priority: 300, currentRoundTripTime: 0.2 }), pair('CP1', 'L1', { priority: 300, currentRoundTripTime: 0.05 }), local('L1', 'host'), local('L2', 'relay')];
    expect(everyOrder(tied, linkOf)).toEqual([{ rtt: 50, bitrate: null, path: 'direct', candidateType: 'host' }]);
    const aberrant = [pair('CP1', 'L1', { priority: Number.NaN, currentRoundTripTime: 0.05 }), pair('CP2', 'L2', { priority: -8, currentRoundTripTime: 0.2 }), pair('CP0', 'L2', { currentRoundTripTime: 0.3 }), local('L1', 'host'), local('L2', 'relay')];
    expect(everyOrder(aberrant, linkOf)).toEqual([{ rtt: 300, bitrate: null, path: 'relay', candidateType: 'relay' }]);
  });

  test('une mesure absente de la paire élue se lit sur la paire suivante qui la porte, dans l’ordre d’élection', () => {
    const entries = [
      transport('T1', 'CP1'),
      pair('CP1', 'L1', { priority: 10, availableOutgoingBitrate: 1_500_000 }),
      pair('CP2', 'L2', { priority: 500, nominated: false, state: 'in-progress', currentRoundTripTime: 0.12 }),
      pair('CP3', 'L2', { priority: 500, currentRoundTripTime: 0.3, availableOutgoingBitrate: 9 }),
      local('L1', 'relay'),
      local('L2', 'host'),
    ];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 120, bitrate: 1_500_000, path: 'relay', candidateType: 'relay' }]);
  });

  test('sans paire élue ni paire qui la porte, la latence vient du rapport du pair', () => {
    const entries = [pair('CP1', 'L1', { nominated: false }), { type: 'remote-inbound-rtp', id: 'RI', kind: 'audio', roundTripTime: 0.09 }, local('L1', 'host')];
    expect(everyOrder(entries, linkOf)).toEqual([{ rtt: 90, bitrate: null, path: null, candidateType: null }]);
  });
});
