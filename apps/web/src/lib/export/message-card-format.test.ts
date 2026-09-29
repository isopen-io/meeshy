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
    const format = { template: 'manuscrit.plume.fil', showConversationTitle: true, showAuthors: true, showDate: true, anonymizeQuoted: true, anonymizeReply: false } as const;
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
    expect(parseMessageCardFormat(JSON.stringify({ ...INITIAL_MESSAGE_CARD_FORMAT, template: 'neon.rond.orbite' }))).toBeNull();
    expect(parseMessageCardFormat(JSON.stringify({ style: 'aurore', showConversationTitle: false, showAuthors: true, showDate: false }))).toBeNull();
    expect(parseMessageCardFormat(JSON.stringify({ ...INITIAL_MESSAGE_CARD_FORMAT, anonymizeReply: 'oui' }))).toBeNull();
  });

  test('deux formats égaux champ à champ sont le même format', () => {
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT })).toBe(true);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, showDate: true })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, anonymizeQuoted: true })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, template: 'minuit.affiche.fleche' })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, null)).toBe(false);
  });

  test('par défaut, les auteurs sont nommés et personne n’est anonymisé', () => {
    expect(INITIAL_MESSAGE_CARD_FORMAT.showAuthors).toBe(true);
    expect(INITIAL_MESSAGE_CARD_FORMAT.anonymizeQuoted || INITIAL_MESSAGE_CARD_FORMAT.anonymizeReply).toBe(false);
  });
});
