import { describe, it, expect } from 'vitest';
import {
  formatCallTranscriptLine,
  upsertCallTranscriptEntry,
  callTranscriptEntryKey,
  type CallTranscriptJournalEntry,
} from '../utils/call-transcript';

const baseEntry = (overrides: Partial<CallTranscriptJournalEntry> = {}): CallTranscriptJournalEntry => ({
  id: 'entry-1',
  speakerId: 'user-a',
  displayName: 'Alice',
  text: 'Bonjour le monde',
  language: 'fr',
  capturedAtMs: Date.UTC(2026, 7, 13, 14, 32, 5),
  isFinal: true,
  ...overrides,
});

describe('formatCallTranscriptLine', () => {
  it('formats as "displayName (HH:MM): message" in the given time zone', () => {
    const line = formatCallTranscriptLine(
      { displayName: 'Alice', capturedAtMs: Date.UTC(2026, 7, 13, 14, 32, 5), text: 'Bonjour le monde' },
      { timeZone: 'UTC' }
    );
    expect(line).toBe('Alice (14:32): Bonjour le monde');
  });

  it('uses a 24-hour clock with zero-padded minutes and hours', () => {
    const line = formatCallTranscriptLine(
      { displayName: 'Bob', capturedAtMs: Date.UTC(2026, 7, 13, 9, 5, 0), text: 'Hi' },
      { timeZone: 'UTC' }
    );
    expect(line).toBe('Bob (09:05): Hi');
  });

  it('respects the provided time zone offset', () => {
    const line = formatCallTranscriptLine(
      { displayName: 'Alice', capturedAtMs: Date.UTC(2026, 7, 13, 14, 32, 5), text: 'Salut' },
      { timeZone: 'Europe/Paris' }
    );
    expect(line).toBe('Alice (16:32): Salut');
  });
});

describe('callTranscriptEntryKey', () => {
  it('uses the wire id when present', () => {
    expect(callTranscriptEntryKey({ id: 'abc', speakerId: 'user-a', startMs: 0, endMs: 100 })).toBe('abc');
  });

  it('synthesizes a stable key from speaker and segment bounds when id is absent', () => {
    const a = callTranscriptEntryKey({ speakerId: 'user-a', startMs: 10, endMs: 500 });
    const b = callTranscriptEntryKey({ speakerId: 'user-a', startMs: 10, endMs: 500 });
    const c = callTranscriptEntryKey({ speakerId: 'user-b', startMs: 10, endMs: 500 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('upsertCallTranscriptEntry', () => {
  it('appends an unseen entry', () => {
    const result = upsertCallTranscriptEntry([], baseEntry());
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Bonjour le monde');
  });

  it('keeps entries ordered by capturedAtMs', () => {
    const first = baseEntry({ id: 'a', capturedAtMs: 2000 });
    const second = baseEntry({ id: 'b', capturedAtMs: 1000 });
    const result = upsertCallTranscriptEntry([first], second);
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('merges a translation onto an existing entry without losing the original text', () => {
    const original = baseEntry();
    const translated = baseEntry({
      text: 'Bonjour le monde',
      translatedText: 'Hello world',
      targetLanguage: 'en',
    });
    const result = upsertCallTranscriptEntry([original], translated);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Bonjour le monde');
    expect(result[0].translatedText).toBe('Hello world');
    expect(result[0].targetLanguage).toBe('en');
  });

  it('does not erase an existing translation when a later duplicate arrives without one', () => {
    const translated = baseEntry({ translatedText: 'Hello world', targetLanguage: 'en' });
    const duplicate = baseEntry();
    const result = upsertCallTranscriptEntry([translated], duplicate);
    expect(result).toHaveLength(1);
    expect(result[0].translatedText).toBe('Hello world');
  });

  it('keeps the earliest capturedAtMs when the same entry arrives via two transports', () => {
    const viaDataChannel = baseEntry({ capturedAtMs: 1000 });
    const viaServer = baseEntry({ capturedAtMs: 1500 });
    const result = upsertCallTranscriptEntry([viaDataChannel], viaServer);
    expect(result[0].capturedAtMs).toBe(1000);
  });

  it('fills in a missing displayName from the later transport', () => {
    const anonymous = baseEntry({ displayName: '' });
    const named = baseEntry({ displayName: 'Alice Doe', translatedText: 'Hello', targetLanguage: 'en' });
    const result = upsertCallTranscriptEntry([anonymous], named);
    expect(result[0].displayName).toBe('Alice Doe');
  });

  it('keeps the first transport displayName when both carry one', () => {
    const fromDataChannel = baseEntry({ displayName: 'Alice' });
    const fromServer = baseEntry({ displayName: 'Alice Doe' });
    const result = upsertCallTranscriptEntry([fromDataChannel], fromServer);
    expect(result[0].displayName).toBe('Alice');
  });

  it('preserves the transcription language tag on merge', () => {
    const original = baseEntry({ language: 'fr' });
    const merged = upsertCallTranscriptEntry([original], baseEntry({ language: 'fr', translatedText: 'Hello', targetLanguage: 'en' }));
    expect(merged[0].language).toBe('fr');
  });

  it('replaces the text of a non-final entry with the next revision (live correction stream)', () => {
    const partial = baseEntry({ text: 'Bonj', isFinal: false, capturedAtMs: 1000 });
    const corrected = baseEntry({ text: 'Bonjour', isFinal: false, capturedAtMs: 1200 });
    const result = upsertCallTranscriptEntry([partial], corrected);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Bonjour');
    expect(result[0].isFinal).toBe(false);
    expect(result[0].capturedAtMs).toBe(1000);
  });

  it('finalizes a streamed utterance in place — the journal keeps the LAST spoken value', () => {
    const partial = baseEntry({ text: 'Bonjour le mond', isFinal: false, capturedAtMs: 1000 });
    const final = baseEntry({ text: 'Bonjour le monde.', isFinal: true, capturedAtMs: 1600 });
    const result = upsertCallTranscriptEntry([partial], final);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Bonjour le monde.');
    expect(result[0].isFinal).toBe(true);
    expect(result[0].capturedAtMs).toBe(1000);
  });

  it('ignores a stale partial arriving after the utterance was finalized', () => {
    const final = baseEntry({ text: 'Bonjour le monde.', isFinal: true, capturedAtMs: 1000 });
    const stale = baseEntry({ text: 'Bonjour le', isFinal: false, capturedAtMs: 1400 });
    const result = upsertCallTranscriptEntry([final], stale);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Bonjour le monde.');
    expect(result[0].isFinal).toBe(true);
  });

  it('does not mutate the input array', () => {
    const entries = [baseEntry({ id: 'a' })];
    const result = upsertCallTranscriptEntry(entries, baseEntry({ id: 'b' }));
    expect(entries).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});
