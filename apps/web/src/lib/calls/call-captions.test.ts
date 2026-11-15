import { describe, expect, test } from 'bun:test';

import {
  TRANSLATION_WAIT_MS,
  captionLanguageLabel,
  captionReveal,
  captionOrigin,
  isAwaitingTranslation,
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
  pair: null,
  isFinal: true,
  at: 1_000,
  mine: false,
  ...overrides,
});

describe('l’étiquette de langue d’une ligne traduite (#8393)', () => {
  const translated = caption({ translated: 'Bonjour', pair: { from: 'en', to: 'fr' } });

  test('« EN → FR » quand la ligne lue est une traduction', () => {
    expect(captionLanguageLabel(translated, 'translated')).toBe('EN → FR');
  });

  test('rien en mode original, rien sur l’original servi, rien sur ma propre parole', () => {
    expect(captionLanguageLabel(translated, 'original')).toBeNull();
    expect(captionLanguageLabel(caption(), 'translated')).toBeNull();
    expect(captionLanguageLabel({ ...translated, mine: true }, 'translated')).toBeNull();
  });

  test('une traduction arrivée sans ses langues ne ment pas : pas d’étiquette', () => {
    expect(captionLanguageLabel(caption({ translated: 'Bonjour' }), 'translated')).toBeNull();
  });

  test('la fusion garde les langues arrivées avec la traduction', () => {
    const merged = mergeCaption(mergeCaption([], translated), caption({ isFinal: true }));
    expect(merged[0]?.pair).toEqual({ from: 'en', to: 'fr' });
  });

  test('un tag régional se lit par sa langue : pt-BR → PT', () => {
    expect(captionLanguageLabel(caption({ translated: 'Olá', pair: { from: 'en-US', to: 'pt-BR' } }), 'translated')).toBe('EN → PT');
  });
});

/**
 * LA PHRASE DIT SA LANGUE (planche P3-P5, miroir de `CallCaptionLine.make` d'iOS) : l'original
 * part tout de suite, étiqueté de sa langue quand elle est hors du Prisme du lecteur, avec
 * trois points tant qu'une traduction est attendue — au plus `TRANSLATION_WAIT_MS`.
 */
describe('la langue d’origine d’une phrase', () => {
  const prism = ['fr', 'en'];
  const origin = (overrides: Partial<Parameters<typeof captionOrigin>[0]> = {}) => captionOrigin({ language: 'es', isFinal: true, translated: null, prism, now: 10_000, ...overrides });

  test('une langue hors du Prisme est étrangère, et une traduction y est attendue jusqu’à l’échéance', () => {
    expect(origin()).toEqual({ language: 'es', foreign: true, awaitingUntil: 10_000 + TRANSLATION_WAIT_MS });
  });

  test('une langue du Prisme n’attend rien et ne s’étiquette pas ; un tag régional se lit par sa langue', () => {
    expect(origin({ language: 'en' })).toEqual({ language: 'en', foreign: false, awaitingUntil: null });
    expect(origin({ language: 'EN-US' })).toMatchObject({ foreign: false });
  });

  test('une phrase non finale, ou déjà traduite, n’attend pas ; un Prisme vide non plus', () => {
    expect(origin({ isFinal: false })).toMatchObject({ foreign: true, awaitingUntil: null });
    expect(origin({ translated: 'Hola' })).toMatchObject({ awaitingUntil: null });
    expect(origin({ prism: [] })).toMatchObject({ awaitingUntil: null });
  });

  test('sans langue connue, rien', () => {
    expect(origin({ language: null })).toBeNull();
  });

  test('l’attente retombe à son échéance', () => {
    const line = caption({ origin: { language: 'es', foreign: true, awaitingUntil: 5_000 } });
    expect(isAwaitingTranslation(line, 4_999)).toBe(true);
    expect(isAwaitingTranslation(line, 5_000)).toBe(false);
    expect(isAwaitingTranslation({ ...line, translated: 'Hola' }, 4_999)).toBe(false);
    expect(isAwaitingTranslation(caption(), 0)).toBe(false);
  });

  test('l’original d’une langue étrangère porte sa langue seule : « ES » ; la mienne, ou une langue du Prisme, rien', () => {
    expect(captionLanguageLabel(caption({ origin: { language: 'es', foreign: true, awaitingUntil: null } }), 'translated')).toBe('ES');
    expect(captionLanguageLabel(caption({ origin: { language: 'es', foreign: true, awaitingUntil: null } }), 'original')).toBe('ES');
    expect(captionLanguageLabel(caption({ origin: { language: 'en', foreign: false, awaitingUntil: null } }), 'translated')).toBeNull();
    expect(captionLanguageLabel(caption({ mine: true, origin: { language: 'es', foreign: true, awaitingUntil: null } }), 'translated')).toBeNull();
  });

  test('la traduction arrivée met fin à l’attente, et une répétition ne la prolonge pas', () => {
    const waiting = caption({ origin: { language: 'es', foreign: true, awaitingUntil: 18_000 } });
    const again = mergeCaption(mergeCaption([], waiting), caption({ origin: { language: 'es', foreign: true, awaitingUntil: 40_000 } }));
    expect(again[0]?.origin).toEqual({ language: 'es', foreign: true, awaitingUntil: 18_000 });
    const served = mergeCaption(again, caption({ translated: 'Hola', pair: { from: 'es', to: 'fr' }, origin: { language: 'es', foreign: true, awaitingUntil: null } }));
    expect(served[0]?.origin).toEqual({ language: 'es', foreign: true, awaitingUntil: null });
    expect(served[0] && captionLanguageLabel(served[0], 'translated')).toBe('ES → FR');
  });

  test('le final d’une phrase d’abord partielle prend l’attente du final', () => {
    const partial = mergeCaption([], caption({ isFinal: false, origin: { language: 'es', foreign: true, awaitingUntil: null } }));
    const final = mergeCaption(partial, caption({ origin: { language: 'es', foreign: true, awaitingUntil: 18_000 } }));
    expect(final[0]?.origin?.awaitingUntil).toBe(18_000);
  });
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

  test('le journal se range par l’heure de capture', () => {
    const journal = mergeCaption(mergeCaption([], caption({ id: 'b', at: 2_000 })), caption({ id: 'a', at: 1_000 }));
    expect(journal.map((line) => line.id)).toEqual(['a', 'b']);
    const between = mergeCaption(mergeCaption(journal, caption({ id: 'c', at: 3_000 })), caption({ id: 'm', at: 1_500 }));
    expect(between.map((line) => line.id)).toEqual(['a', 'm', 'b', 'c']);
  });

  test('le journal garde TOUT l’appel : rien ne tombe, même après mille phrases (#8579)', () => {
    const long = Array.from({ length: 1_200 }, (_, n) => n).reduce<readonly CallCaption[]>((acc, n) => mergeCaption(acc, caption({ id: `s${n}`, at: n })), []);
    expect(long).toHaveLength(1_200);
    expect(long[0]?.id).toBe('s0');
    expect(long.at(-1)?.id).toBe('s1199');
  });

  test('une révision qui avance l’heure d’un énoncé le range à sa nouvelle place', () => {
    const journal = [caption({ id: 'a', at: 1_000 }), caption({ id: 'b', at: 2_000 }), caption({ id: 'c', at: 3_000 })].reduce<readonly CallCaption[]>(mergeCaption, []);
    expect(mergeCaption(journal, caption({ id: 'c', at: 500 })).map((line) => line.id)).toEqual(['c', 'a', 'b']);
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
    expect(decoded).toEqual({ callId: 'call-1', speakerName: 'Nadia', language: 'en', caption: { id: 'w-9', speakerId: 'u-peer', speakerName: 'Nadia', original: 'Hello', translated: 'Bonjour', pair: { from: 'en', to: 'fr' }, isFinal: true, at: 42 } });
    const same = decodeTranslatedSegment({ callId: 'call-1', segment: { text: 'Salut', speakerId: 'u-peer', startMs: 7, endMs: 9, isFinal: false, sourceLanguage: 'fr', targetLanguage: 'fr' } });
    expect(same?.caption).toMatchObject({ id: 'u-peer:7', translated: null, pair: null, isFinal: false });
    expect(same?.language).toBe('fr');
    expect(decodeTranslatedSegment({ callId: 'call-1', segment: { speakerId: 'u-peer' } })).toBeNull();
  });

  test('call:transcription-active', () => {
    expect(decodeTranscriptionActive({ callId: 'c', speakerId: 'u', active: true })).toEqual({ callId: 'c', speakerId: 'u', active: true });
    expect(decodeTranscriptionActive({ callId: 'c', speakerId: 'u' })).toBeNull();
  });

  test('le canal de données : bye, transcript-entry, et le bruit ignoré', () => {
    expect(decodeChannelMessage('{"type":"bye","reason":"completed"}')).toEqual({ kind: 'bye' });
    expect(decodeChannelMessage(JSON.stringify(transcriptEntryMessage(utterance())))).toEqual({ kind: 'entry', id: 'w-1', callId: 'call-1', text: 'Bonjour à tous', speakerName: 'Moi', language: 'fr', at: 1_700_000_000_000, isFinal: true });
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

describe('une phrase se révèle d’un toucher, dans les deux réglages (iOS CallCaptionLine.make, L3.9)', () => {
  const spoken = caption({ translated: 'Bonjour', pair: { from: 'en', to: 'fr' } });

  test('traduit : la traduction se lit, l’original se déplie SOUS elle', () => {
    expect(captionReveal(spoken, 'translated', false)).toEqual({ canReveal: true, mode: 'translated', originalBelow: false });
    expect(captionReveal(spoken, 'translated', true)).toEqual({ canReveal: true, mode: 'translated', originalBelow: true });
  });

  test('original : la phrase qui a une traduction reste touchable, et la toucher montre sa traduction à la place de l’original', () => {
    expect(captionReveal(spoken, 'original', false)).toEqual({ canReveal: true, mode: 'original', originalBelow: false });
    const revealed = captionReveal(spoken, 'original', true);
    expect(revealed).toEqual({ canReveal: true, mode: 'translated', originalBelow: false });
    expect(captionText(spoken, revealed.mode)).toBe('Bonjour');
    expect(captionLanguageLabel(spoken, revealed.mode)).toBe('EN → FR');
  });

  test('ma parole, une phrase sans traduction, une traduction identique, le réglage éteint : rien à révéler', () => {
    expect(captionReveal(caption({ ...spoken, mine: true }), 'original', true).canReveal).toBe(false);
    expect(captionReveal(caption(), 'original', true)).toEqual({ canReveal: false, mode: 'original', originalBelow: false });
    expect(captionReveal(caption({ translated: 'Hello' }), 'translated', true).canReveal).toBe(false);
    expect(captionReveal(spoken, 'off', true).canReveal).toBe(false);
  });
});
