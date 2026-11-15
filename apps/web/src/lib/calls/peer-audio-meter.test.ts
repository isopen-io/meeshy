import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { SPEECH_ENTER, SPEECH_HOLD_MS } from './call-speaking';
import { meterPeer } from './peer-audio-meter';

/**
 * LA MESURE DU NIVEAU REÇU D'UN PAIR (P9.6, #17611) — l'hôte n'est prévenu qu'au BASCULEMENT
 * de la parole (aucun rendu par relevé), et la fin de la mesure rend tout : minuterie, nœuds,
 * `AudioContext` fermé, parole remise à « se tait ». Rien ne s'ouvre pour une mesure déjà close.
 */

type Ledger = { opened: number; closed: number; disconnected: number };

const ledger: Ledger = { opened: 0, closed: 0, disconnected: 0 };
const level = { now: 0 };
const saved: { audio?: PropertyDescriptor | undefined } = {};

class FakeAudioContext {
  constructor() {
    ledger.opened += 1;
  }
  createMediaStreamSource() {
    return { connect: () => undefined, disconnect: () => void (ledger.disconnected += 1) };
  }
  createAnalyser() {
    return { fftSize: 0, getFloatTimeDomainData: (into: Float32Array) => into.fill(level.now) };
  }
  resume = async () => undefined;
  close = async () => void (ledger.closed += 1);
}

const audible = { getAudioTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream;
const silentStream = { getAudioTracks: () => [] } as unknown as MediaStream;

beforeEach(() => {
  Object.assign(ledger, { opened: 0, closed: 0, disconnected: 0 });
  level.now = 0;
  saved.audio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  if (saved.audio === undefined) Reflect.deleteProperty(globalThis, 'AudioContext');
  else Object.defineProperty(globalThis, 'AudioContext', saved.audio);
});

describe('meterPeer — le niveau reçu ne prévient l’hôte qu’au basculement', () => {
  test('un relevé qui ne change pas l’état ne rappelle pas l’hôte : un appel par bascule, pas par échantillon', () => {
    const heard: boolean[] = [];
    const stop = new AbortController();
    meterPeer(audible, (speaking) => heard.push(speaking), stop.signal);
    jest.advanceTimersByTime(2000);
    expect(heard).toEqual([]);
    level.now = SPEECH_ENTER * 2;
    jest.advanceTimersByTime(2000);
    expect(heard).toEqual([true]);
    level.now = 0;
    jest.advanceTimersByTime(SPEECH_HOLD_MS + 1000);
    expect(heard).toEqual([true, false]);
    stop.abort();
  });
});

describe('meterPeer — la fin de la mesure ne laisse rien derrière elle', () => {
  test('clore la mesure arrête les relevés, débranche la source, ferme l’AudioContext et remet la parole à « se tait »', () => {
    const heard: boolean[] = [];
    const stop = new AbortController();
    meterPeer(audible, (speaking) => heard.push(speaking), stop.signal);
    level.now = SPEECH_ENTER * 2;
    jest.advanceTimersByTime(400);
    stop.abort();
    expect(ledger).toEqual({ opened: 1, closed: 1, disconnected: 1 });
    expect(heard).toEqual([true, false]);
    jest.advanceTimersByTime(5000);
    expect(heard).toEqual([true, false]);
  });

  test('en groupe, les mesures de toutes les vignettes partagent UN AudioContext, fermé quand la dernière se clôt (P11.5)', () => {
    const tiles = [0, 1, 2, 3, 4, 5].map(() => new AbortController());
    tiles.forEach((tile) => meterPeer(audible, () => undefined, tile.signal));
    expect(ledger.opened).toBe(1);
    tiles.slice(1).forEach((tile) => tile.abort());
    expect(ledger).toEqual({ opened: 1, closed: 0, disconnected: 5 });
    tiles[0]?.abort();
    expect(ledger).toEqual({ opened: 1, closed: 1, disconnected: 6 });
    const again = new AbortController();
    meterPeer(audible, () => undefined, again.signal);
    expect(ledger.opened).toBe(2);
    again.abort();
  });

  test('une mesure close avant d’avoir commencé n’ouvre aucun AudioContext', () => {
    const stop = new AbortController();
    stop.abort();
    meterPeer(audible, () => undefined, stop.signal);
    expect(ledger.opened).toBe(0);
  });

  test('un flux sans piste audio n’ouvre rien', () => {
    meterPeer(silentStream, () => undefined, new AbortController().signal);
    expect(ledger.opened).toBe(0);
  });
});
