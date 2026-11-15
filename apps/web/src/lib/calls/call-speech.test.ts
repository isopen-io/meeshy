import { describe, expect, test } from 'bun:test';

import type { SpeechResult } from './call-captions-controller';
import { browserSpeech, recognitionOf, SPEECH_RESTARTS_WITHOUT_RESULT, type Recognition } from './call-speech';

/**
 * LA RECONNAISSANCE VOCALE DU NAVIGATEUR (#8048) — détectée, jamais supposée ;
 * continue, relancée après un silence, abandonnée quand elle ne rend plus rien.
 */

function fakeRecognition() {
  const made: Array<Recognition & { started: number; aborted: boolean }> = [];
  class FakeRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: Recognition['onresult'] = null;
    onerror: Recognition['onerror'] = null;
    onend: Recognition['onend'] = null;
    started = 0;
    aborted = false;
    constructor() {
      made.push(this);
    }
    start() {
      this.started += 1;
    }
    abort() {
      this.aborted = true;
    }
  }
  return { Constructor: FakeRecognition, made };
}

const results = (entries: ReadonlyArray<readonly [string, boolean, number]>, resultIndex = 0) => ({
  resultIndex,
  results: Object.assign(
    entries.map(([transcript, isFinal, confidence]) => Object.assign([{ transcript, confidence }], { isFinal })),
    { length: entries.length },
  ),
});

describe('la reconnaissance vocale du navigateur (#8048)', () => {
  test('détectée sous son nom standard ou préfixé ; absente, rien ne se promet', () => {
    const { Constructor } = fakeRecognition();
    expect(recognitionOf({ SpeechRecognition: Constructor })).toBe(Constructor);
    expect(recognitionOf({ webkitSpeechRecognition: Constructor })).toBe(Constructor);
    expect(recognitionOf({})).toBeNull();
    expect(recognitionOf(null)).toBeNull();
    expect(browserSpeech(null)).toBeNull();
  });

  test('continue, avec révisions, dans la langue demandée ; chaque résultat nouveau est remis', () => {
    const { Constructor, made } = fakeRecognition();
    const heard: SpeechResult[] = [];
    browserSpeech(Constructor)?.({ language: 'fr', onResult: (result) => void heard.push(result), onFailure: () => undefined });
    const recognition = made[0];
    expect(recognition).toMatchObject({ lang: 'fr', continuous: true, interimResults: true, started: 1 });
    recognition?.onresult?.(results([['bonjour', true, 0.9], ['à to', false, 0]], 0));
    recognition?.onresult?.(results([['bonjour', true, 0.9], ['à tous', true, 0.8]], 1));
    expect(heard).toEqual([
      { text: 'bonjour', isFinal: true, confidence: 0.9 },
      { text: 'à to', isFinal: false, confidence: 0 },
      { text: 'à tous', isFinal: true, confidence: 0.8 },
    ]);
  });

  test('un silence l’arrête : elle est relancée, puis abandonnée après des relances vaines', () => {
    const { Constructor, made } = fakeRecognition();
    const failures: string[] = [];
    browserSpeech(Constructor)?.({ language: 'fr', onResult: () => undefined, onFailure: (reason) => void failures.push(reason) });
    for (let n = 0; n <= SPEECH_RESTARTS_WITHOUT_RESULT; n += 1) made.at(-1)?.onend?.();
    expect(made).toHaveLength(SPEECH_RESTARTS_WITHOUT_RESULT + 1);
    expect(failures).toEqual(['unavailable']);
  });

  test('un micro refusé se dit « denied » et n’est pas relancé', () => {
    const { Constructor, made } = fakeRecognition();
    const failures: string[] = [];
    browserSpeech(Constructor)?.({ language: 'fr', onResult: () => undefined, onFailure: (reason) => void failures.push(reason) });
    made[0]?.onerror?.({ error: 'not-allowed' });
    made[0]?.onend?.();
    expect(failures).toEqual(['denied']);
    expect(made).toHaveLength(1);
  });

  test('arrêter l’interrompt, sans relance ni résultat tardif', () => {
    const { Constructor, made } = fakeRecognition();
    const heard: SpeechResult[] = [];
    const capture = browserSpeech(Constructor)?.({ language: 'fr', onResult: (result) => void heard.push(result), onFailure: () => undefined });
    const recognition = made[0];
    capture?.stop();
    expect(recognition?.aborted).toBe(true);
    recognition?.onend?.();
    recognition?.onresult?.(results([['tard', true, 1]]));
    expect(made).toHaveLength(1);
    expect(heard).toEqual([]);
  });
});
