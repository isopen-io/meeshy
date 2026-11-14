import { describe, expect, test } from 'bun:test';

import { callJournalHeight, callJournalHeightAround, journalAround, JOURNAL_COMPACT_FLOOR } from './call-journal-height';
import { audioAvatarSize, audioStageCompact, AUDIO_AVATAR_COMPACT, AUDIO_AVATAR_TIGHT, COMPACT_HEIGHT, TIGHT_HEIGHT } from './call-view';

/**
 * #18488 — l'appel vocal à hauteur compacte : la scène audio du duo prend la forme compacte de P9b
 * (avatar resserré, nom et durée à côté) quand la HAUTEUR manque, comme elle la prend sous le journal ;
 * l'avatar passe à 40 sous 340 px de haut. Miroir de `CallDuoAudioFit` (Android, #18495) et de
 * `CallAudioStageLayout.form` (iOS, #18496).
 */
describe('la forme de la scène audio du duo', () => {
  test('au repos, sur une fenêtre haute, elle est pleine', () => {
    expect(audioStageCompact({ journalOpen: false, height: 844 })).toBe(false);
    expect(audioStageCompact({ journalOpen: false, height: COMPACT_HEIGHT })).toBe(false);
  });

  test('sous 500 px de haut, elle est compacte, journal ou non', () => {
    expect(audioStageCompact({ journalOpen: false, height: 499 })).toBe(true);
    expect(audioStageCompact({ journalOpen: false, height: 320 })).toBe(true);
    expect(audioStageCompact({ journalOpen: true, height: 320 })).toBe(true);
  });

  test('le journal ouvert la rend compacte à toute hauteur (P9b)', () => {
    expect(audioStageCompact({ journalOpen: true, height: 844 })).toBe(true);
  });

  test('une fenêtre de hauteur inconnue (0) ne la compacte pas', () => {
    expect(audioStageCompact({ journalOpen: false, height: 0 })).toBe(false);
  });
});

describe('la taille de l’avatar de la scène audio', () => {
  test('pleine : 120 connecté, 112 pendant la sonnerie (P9)', () => {
    expect(audioAvatarSize({ compact: false, height: 844, joined: true })).toBe(120);
    expect(audioAvatarSize({ compact: false, height: 844, joined: false })).toBe(112);
  });

  test('compacte : 56 (P9b)', () => {
    expect(audioAvatarSize({ compact: true, height: 844, joined: true })).toBe(AUDIO_AVATAR_COMPACT);
    expect(audioAvatarSize({ compact: true, height: 400, joined: true })).toBe(56);
    expect(audioAvatarSize({ compact: true, height: TIGHT_HEIGHT, joined: true })).toBe(56);
  });

  test('compacte sous 340 px de haut : 40, comme Android', () => {
    expect(audioAvatarSize({ compact: true, height: 339, joined: true })).toBe(AUDIO_AVATAR_TIGHT);
    expect(audioAvatarSize({ compact: true, height: 320, joined: true })).toBe(40);
    expect([AUDIO_AVATAR_COMPACT, AUDIO_AVATAR_TIGHT, TIGHT_HEIGHT]).toEqual([56, 40, 340]);
  });
});

describe('le journal du duo audio ne prend que ce qu’il reste autour de l’avatar compact et de la pilule', () => {
  test('ce qui l’entoure : l’en-tête, l’avatar compact, son écart, le cadre du panneau et la rangée de base', () => {
    expect(journalAround(56)).toBeGreaterThan(journalAround(40));
    expect(journalAround(40)).toBeGreaterThan(200);
  });

  test('à 320 de haut, la liste tient dans ce qui reste, sans passer sous son plancher lisible', () => {
    const list = callJournalHeightAround(320, journalAround(40));
    expect(list).toBe(Math.max(JOURNAL_COMPACT_FLOOR, 320 - journalAround(40)));
    expect(list).toBeLessThan(callJournalHeight(320));
  });

  test('sur une fenêtre haute, rien ne change : la part de la fenêtre', () => {
    expect(callJournalHeightAround(844, journalAround(56))).toBe(callJournalHeight(844));
  });

  test('jamais sous le plancher lisible, même sur une fenêtre très basse', () => {
    expect(callJournalHeightAround(200, journalAround(40))).toBe(JOURNAL_COMPACT_FLOOR);
  });
});
