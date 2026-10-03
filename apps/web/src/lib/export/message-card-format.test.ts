import { describe, expect, test } from 'bun:test';

import {
  INITIAL_MESSAGE_CARD_FORMAT,
  MESSAGE_CARD_FORMAT_KEY,
  parseMessageCardFormat,
  readDefaultMessageCardFormat,
  sameMessageCardFormat,
  writeDefaultMessageCardFormat,
} from './message-card-format';

const legacyToggles = { template: 'manuscrit.plume.fil', showConversationTitle: false, showAuthors: true, showDate: false, anonymizeQuoted: false, anonymizeReply: false };

describe('le format par défaut d’une carte d’export', () => {
  test('s’écrit puis se relit à l’identique', () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => void entries.set(key, value) };
    const format = {
      ...INITIAL_MESSAGE_CARD_FORMAT,
      template: 'manuscrit.plume.fil',
      showConversationTitle: true,
      showDate: true,
      anonymizeQuoted: true,
      aspect: 'landscape',
      header: 'letters',
      authorsAt: 'end',
      tilt: 'left',
      showTimes: true,
      usePseudonyms: true,
      mediaLayout: 'right',
      mediaArrangement: 'hero',
      showsMediaAuthor: true,
      audioStyle: 'spectre',
    } as const;
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

  test('un défaut enregistré AVANT l’onglet Frame se relit, complété des réglages par défaut', () => {
    const before = { template: 'manuscrit.plume.fil', showConversationTitle: true, showAuthors: true, showDate: false, anonymizeQuoted: false, anonymizeReply: true };
    expect(parseMessageCardFormat(JSON.stringify(before))).toEqual({ ...INITIAL_MESSAGE_CARD_FORMAT, ...before, template: 'manuscrit.plume.fil' });
  });

  test('un réglage de cadre inconnu retombe sur sa valeur par défaut, sans perdre le reste', () => {
    const parsed = parseMessageCardFormat(JSON.stringify({ ...INITIAL_MESSAGE_CARD_FORMAT, aspect: 'cinema', tilt: 12, showDate: true }));
    expect(parsed?.aspect).toBe('auto');
    expect(parsed?.tilt).toBe('none');
    expect(parsed?.showDate).toBe(true);
  });

  test('une disposition d’avant #9236 se relit : la pleine largeur est « une seule », la bande « en vague », au-dessus de la réponse', () => {
    const before = (mediaStyle: string) => parseMessageCardFormat(JSON.stringify({ ...legacyToggles, mediaStyle }));
    expect([before('mosaique'), before('pleine'), before('bande')].map((format) => [format?.mediaLayout, format?.mediaArrangement])).toEqual([
      ['above', 'mosaic'],
      ['above', 'single'],
      ['above', 'wave'],
    ]);
    expect(before('pleine')?.showsMediaAuthor).toBe(false);
  });

  test('les clés d’iOS se relisent — et l’ancienne POSITION « mosaic » d’iOS se relit au-dessus, en mosaïque', () => {
    const ios = parseMessageCardFormat(JSON.stringify({ ...legacyToggles, mediaLayout: 'left', mediaArrangement: 'sine', showsMediaAuthor: true }));
    expect([ios?.mediaLayout, ios?.mediaArrangement, ios?.showsMediaAuthor]).toEqual(['left', 'sine', true]);
    const older = parseMessageCardFormat(JSON.stringify({ ...legacyToggles, mediaLayout: 'mosaic' }));
    expect([older?.mediaLayout, older?.mediaArrangement]).toEqual(['above', 'mosaic']);
  });

  test('le visuel choisi n’est pas un réglage du format : il ne s’enregistre pas', () => {
    expect(Object.keys(INITIAL_MESSAGE_CARD_FORMAT).some((key) => key.startsWith('featured'))).toBe(false);
    expect(Object.keys(INITIAL_MESSAGE_CARD_FORMAT)).not.toContain('mediaStyle');
  });

  test('deux formats égaux champ à champ sont le même format', () => {
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, mediaLayout: 'backdrop' })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, mediaArrangement: 'wave' })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, showsMediaAuthor: true })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, aspect: 'story' })).toBe(false);
    expect(sameMessageCardFormat(INITIAL_MESSAGE_CARD_FORMAT, { ...INITIAL_MESSAGE_CARD_FORMAT, usePseudonyms: true })).toBe(false);
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
