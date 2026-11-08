import { describe, expect, test } from 'bun:test';

import { createTalkiePlayer, type TalkieAudio } from './talkie-player';

/**
 * LE LECTEUR DE FRAGMENTS (#16638) — chaque fragment AAC ADTS se décode dès son
 * arrivée (en parallèle) et se PLANIFIE à la suite du précédent (dans l'ordre),
 * derrière un tampon de gigue minimal : la voix sort sans trou ni chevauchement.
 */

type Started = { readonly at: number; readonly duration: number; stopped: boolean };

function fakeAudio({ currentTime = 10 }: { readonly currentTime?: number } = {}) {
  const started: Started[] = [];
  const pending: { readonly bytes: Uint8Array; resolve: (duration: number) => void; reject: () => void }[] = [];
  let resumed = 0;
  const audio: TalkieAudio = {
    currentTime: () => currentTime,
    resume: () => {
      resumed += 1;
    },
    decode: (bytes) =>
      new Promise((resolve, reject) => {
        pending.push({ bytes, resolve: (duration) => resolve({ duration }), reject: () => reject(new Error('illisible')) });
      }),
    start: (buffer, at) => {
      const entry: Started = { at, duration: buffer.duration, stopped: false };
      started.push(entry);
      return () => {
        entry.stopped = true;
      };
    },
  };
  return { audio, started, pending, resumes: () => resumed };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const bytes = (first: number) => new Uint8Array([first]);

describe('le lecteur de fragments du talkie', () => {
  test('le premier fragment sort derrière un tampon de gigue minimal, le suivant EXACTEMENT à sa fin', async () => {
    const { audio, started, pending } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    player.play('t1', bytes(1));
    pending[0]!.resolve(0.4);
    pending[1]!.resolve(0.5);
    await flush();
    expect(started.map((entry) => entry.at)).toEqual([10.08, 10.48]);
  });

  test('un décodage qui finit dans le désordre se joue quand même DANS L’ORDRE', async () => {
    const { audio, started, pending } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    player.play('t1', bytes(1));
    pending[1]!.resolve(0.5);
    await flush();
    expect(started).toEqual([]);
    pending[0]!.resolve(0.4);
    await flush();
    expect(started.map((entry) => entry.duration)).toEqual([0.4, 0.5]);
  });

  test('un fragment illisible est sauté, la voix continue', async () => {
    const { audio, started, pending } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    player.play('t1', bytes(1));
    pending[0]!.reject();
    pending[1]!.resolve(0.5);
    await flush();
    expect(started.map((entry) => entry.duration)).toEqual([0.5]);
  });

  test('se taire arrête ce qui sonne et jette ce qui se décodait encore', async () => {
    const { audio, started, pending } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    player.play('t1', bytes(1));
    pending[0]!.resolve(0.4);
    await flush();
    player.silence('t1');
    pending[1]!.resolve(0.5);
    await flush();
    expect(started).toHaveLength(1);
    expect(started[0]!.stopped).toBe(true);
  });

  test('une prise de parole relâchée finit de sonner, puis le lecteur l’oublie', async () => {
    const { audio, started, pending } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    player.release('t1');
    pending[0]!.resolve(0.4);
    await flush();
    expect(started.map((entry) => entry.stopped)).toEqual([false]);
    expect(player.size()).toBe(0);
  });

  test('le contexte audio est réveillé au premier fragment (politique de lecture automatique)', () => {
    const { audio, resumes } = fakeAudio();
    const player = createTalkiePlayer({ audio: () => audio });
    player.play('t1', bytes(0));
    expect(resumes()).toBe(1);
  });

  test('sans audio dans ce navigateur, rien ne casse : la copie vocale prendra le relais', () => {
    const player = createTalkiePlayer({ audio: () => null });
    expect(() => player.play('t1', bytes(0))).not.toThrow();
    expect(() => player.silence('t1')).not.toThrow();
  });
});
