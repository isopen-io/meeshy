import { describe, expect, test } from 'bun:test';

import {
  INITIAL_MESSAGE_CARD_FORMAT,
  MESSAGE_CARD_FORMAT_KEY,
  parseMessageCardFormat,
  readDefaultMessageCardFormat,
  sameMessageCardFormat,
  writeDefaultMessageCardFormat,
} from './message-card-format';

describe('le format par défaut d’une carte d’export', () => {
  test('s’écrit puis se relit à l’identique', () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => void entries.set(key, value) };
    const format = { style: 'manuscrit', showConversationTitle: true, showAuthors: false, showDate: true } as const;
    writeDefaultMessageCardFormat(storage, format);
    expect(entries.has(MESSAGE_CARD_FORMAT_KEY)).toBe(true);
    expect(readDefaultMessageCardFormat(storage)).toEqual(format);
  });

  test('aucun défaut enregistré ⇒ null, jamais un format inventé', () => {
    expect(readDefaultMessageCardFormat({ getItem: () => null })).toBeNull();
  });

  test('une valeur abîmée ou d’un autre âge retombe sur « aucun défaut »', () => {
    expect(parseMessageCardFormat('{pas du json')).toBeNull();
    expect(parseMessageCardFormat('"aurore"')).toBeNull();
    expect(parseMessageCardFormat(JSON.stringify({ ...INITIAL_MESSAGE_CARD_FORMAT, style: 'neon' }))).toBeNull();
    expect(parseMessageCardFormat(JSON.stringify({ style: 'aurore', showAuthors: true }))).toBeNull();
  });

  test('deux formats égaux champ à champ sont le même format', () => {
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT })).toBe(true);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, showDate: true })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, null)).toBe(false);
  });
});
