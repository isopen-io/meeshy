import { describe, expect, test } from 'bun:test';

import {
  CAPTIONS_JOURNAL_KEPT,
  captionText,
  captureAction,
  decodeChannelMessage,
  decodeTranscriptionActive,
  decodeTranslatedSegment,
  mergeCaption,
  nextCaptionsMode,
  overlayCaptions,
  segmentEvent,
  someoneListens,
  transcriptEntryMessage,
  type CallCaption,
  type Utterance,
} from './call-captions';

const caption = (overrides: Partial<CallCaption> = {}): CallCaption => ({
  id: 'u1',
  speakerId: 'u-peer',
  speakerName: 'Nadia',
  original: 'Hello',
  translated: null,
  isFinal: true,
  at: 1_000,
  mine: false,
  ...overrides,
});

const utterance = (overrides: Partial<Utterance> = {}): Utterance => ({
  id: 'w-1',
  callId: 'call-1',
  speakerId: 'u-me',
  speakerName: 'Moi',
  text: 'Bonjour à tous',
  language: 'fr',
  confidence: 0.92,
  startMs: 1200,
  endMs: 2400,
  capturedAtMs: 1_700_000_000_000,
  isFinal: true,
  ...overrides,
});

describe('les sous-titres d’un appel (#8048)', () => {
  test('le bouton suit le cycle d’iOS : off → traduit → original → off', () => {
    expect(nextCaptionsMode('off')).toBe('translated');
    expect(nextCaptionsMode('translated')).toBe('original');
    expect(nextCaptionsMode('original')).toBe('off');
  });

  test('en mode traduit, la parole d’un autre se lit dans sa traduction ; en original, telle qu’elle a été dite', () => {
    const line = caption({ translated: 'Bonjour' });
    expect(captionText(line, 'translated')).toBe('Bonjour');
    expect(captionText(line, 'original')).toBe('Hello');
  });

  test('sans traduction arrivée, le mode traduit montre l’original ; ma parole reste toujours la mienne', () => {
    expect(captionText(caption(), 'translated')).toBe('Hello');
    expect(captionText(caption({ mine: true, translated: 'Hallo' }), 'translated')).toBe('Hello');
  });

  test('le même énoncé arrivé en P2P puis traduit par la passerelle fait UNE ligne, traduite', () => {
    const p2p = mergeCaption([], caption({ original: 'Hello there' }));
    const both = mergeCaption(p2p, caption({ original: 'Hello there', translated: 'Bonjour à vous', speakerName: '' }));
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ original: 'Hello there', translated: 'Bonjour à vous', speakerName: 'Nadia', isFinal: true });
  });

  test('une révision partielle se remplace en place, et un final ne redevient jamais partiel', () => {
    const partial = mergeCaption([], caption({ original: 'Hel', isFinal: false }));
    const revised = mergeCaption(partial, caption({ original: 'Hello', isFinal: false }));
    expect(revised.map((line) => line.original)).toEqual(['Hello']);
    const final = mergeCaption(revised, caption({ original: 'Hello world', isFinal: true }));
    const late = mergeCaption(final, caption({ original: 'Hello wo', isFinal: false }));
    expect(late[0]).toMatchObject({ original: 'Hello world', isFinal: true });
  });

  test('une traduction arrivée reste quand l’entrée P2P la rejoue après coup', () => {
    const translated = mergeCaption([], caption({ translated: 'Bonjour' }));
    expect(mergeCaption(translated, caption())[0]?.translated).toBe('Bonjour');
  });

  test('le journal se range par l’heure de capture et reste borné', () => {
    const journal = mergeCaption(mergeCaption([], caption({ id: 'b', at: 2_000 })), caption({ id: 'a', at: 1_000 }));
    expect(journal.map((line) => line.id)).toEqual(['a', 'b']);
    const long = Array.from({ length: CAPTIONS_JOURNAL_KEPT + 5 }, (_, n) => n).reduce<readonly CallCaption[]>((acc, n) => mergeCaption(acc, caption({ id: `s${n}`, at: n })), []);
    expect(long).toHaveLength(CAPTIONS_JOURNAL_KEPT);
    expect(long[0]?.id).toBe('s5');
  });

  test('le bandeau montre les deux dernières lignes dites', () => {
    const journal = [caption({ id: 'a' }), caption({ id: 'b' }), caption({ id: 'c' })];
    expect(overlayCaptions(journal).map((line) => line.id)).toEqual(['b', 'c']);
  });

  test('ce device transcrit son micro dès que QUELQU’UN écoute : mon panneau, ou un pair encore dans l’appel', () => {
    const members = { 'u-peer': {} };
    expect(someoneListens({ mode: 'translated', peers: [], members })).toBe(true);
    expect(someoneListens({ mode: 'off', peers: ['u-peer'], members })).toBe(true);
    expect(someoneListens({ mode: 'off', peers: ['u-gone'], members })).toBe(false);
    expect(someoneListens({ mode: 'off', peers: [], members })).toBe(false);
    expect(captureAction(true, false)).toBe('start');
    expect(captureAction(false, true)).toBe('stop');
    expect(captureAction(true, true)).toBe('none');
  });
});

describe('les formes du fil (#8048)', () => {
  test('call:translated-segment : le locuteur de la passerelle, la traduction si elle diffère de l’original', () => {
    const decoded = decodeTranslatedSegment({
      callId: 'call-1',
      segment: { id: 'w-9', text: 'Hello', translatedText: 'Bonjour', speakerId: 'u-peer', speakerDisplayName: 'Nadia', startMs: 0, endMs: 900, isFinal: true, sourceLanguage: 'en', targetLanguage: 'fr', confidence: 0.9, capturedAtMs: 42 },
    });
    expect(decoded).toEqual({ callId: 'call-1', speakerName: 'Nadia', caption: { id: 'w-9', speakerId: 'u-peer', speakerName: 'Nadia', original: 'Hello', translated: 'Bonjour', isFinal: true, at: 42 } });
    const same = decodeTranslatedSegment({ callId: 'call-1', segment: { text: 'Salut', speakerId: 'u-peer', startMs: 7, endMs: 9, isFinal: false, sourceLanguage: 'fr', targetLanguage: 'fr' } });
    expect(same?.caption).toMatchObject({ id: 'u-peer:7', translated: null, isFinal: false });
    expect(decodeTranslatedSegment({ callId: 'call-1', segment: { speakerId: 'u-peer' } })).toBeNull();
  });

  test('call:transcription-active', () => {
    expect(decodeTranscriptionActive({ callId: 'c', speakerId: 'u', active: true })).toEqual({ callId: 'c', speakerId: 'u', active: true });
    expect(decodeTranscriptionActive({ callId: 'c', speakerId: 'u' })).toBeNull();
  });

  test('le canal de données : bye, transcript-entry, et le bruit ignoré', () => {
    expect(decodeChannelMessage('{"type":"bye","reason":"completed"}')).toEqual({ kind: 'bye' });
    expect(decodeChannelMessage(JSON.stringify(transcriptEntryMessage(utterance())))).toEqual({ kind: 'entry', id: 'w-1', callId: 'call-1', text: 'Bonjour à tous', speakerName: 'Moi', at: 1_700_000_000_000, isFinal: true });
    expect(decodeChannelMessage('{"type":"ping"}')).toBeNull();
    expect(decodeChannelMessage('pas du json')).toBeNull();
  });

  test('call:transcription-segment respecte les bornes du schéma de la passerelle', () => {
    const event = segmentEvent(utterance({ confidence: 1.4, startMs: 900.4, endMs: 300, text: 'x'.repeat(6000) }));
    expect(event.callId).toBe('call-1');
    expect(event.segment).toMatchObject({ id: 'w-1', speakerId: 'u-me', language: 'fr', isFinal: true, confidence: 1, startMs: 900, endMs: 900 });
    expect(event.segment.text).toHaveLength(5000);
    expect(segmentEvent(utterance({ confidence: Number.NaN })).segment.confidence).toBe(0);
  });
});
