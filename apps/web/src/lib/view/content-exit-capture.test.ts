import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { CAPTURE_ROW_ATTRIBUTE, captureOf, captureProps, type SealedSubject } from './content-exit';

/* CE QU'UNE RANGÉE DU FIL MONTRE À UNE CAPTURE (#9617, #9574). `announced` :
   un éphémère lisible à l'écran, déclaré si l'écran est capturé. `blocked` :
   la nature ne se lit pas (champ de protection absent, citation non déclarée)
   — compté comme une vue unique, la coque noircit ; jamais l'inverse. Une vue
   unique au repos ne montre qu'une puce : sa rangée est `free`, c'est son
   ouverture qui tient le bouclier (`ProtectedContent`). */

const NOW = 1_700_000_000_000;
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE } = MESSAGE_EFFECT_FLAGS;

const message = (overrides: Partial<SealedSubject> = {}): SealedSubject => ({
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

describe('la capture vue depuis une rangée du fil', () => {
  test('un message ordinaire est libre', () => {
    expect(captureOf(message(), NOW, { isMine: false })).toBe('free');
  });

  test('les deux flammes sont annoncées', () => {
    expect(captureOf(message({ effectFlags: EPHEMERAL, ephemeralDuration: 300 }), NOW, { isMine: false })).toBe('announced');
    expect(captureOf(message({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }), NOW, { isMine: false })).toBe('announced');
  });

  test('un éphémère déclaré sans durée lisible reste annoncé', () => {
    expect(captureOf(message({ effectFlags: EPHEMERAL }), NOW, { isMine: false })).toBe('announced');
  });

  test('une vue unique au repos ne montre qu’une puce : sa rangée est libre', () => {
    expect(captureOf(message({ isViewOnce: true, effectFlags: VIEW_ONCE }), NOW, { isMine: false })).toBe('free');
  });

  test('une nature illisible ferme : la rangée compte comme bloquée', () => {
    const { effectFlags: _absent, ...unreadable } = message();
    expect(captureOf(unreadable, NOW, { isMine: false })).toBe('blocked');
  });

  test('une citation dont la nature n’est pas déclarée ferme aussi, même sous mon propre message', () => {
    const { effectFlags: _absent, ...quoted } = message();
    expect(captureOf(message({ replyTo: quoted }), NOW, { isMine: false })).toBe('blocked');
    expect(captureOf(message({ replyTo: quoted }), NOW, { isMine: true })).toBe('blocked');
  });

  test('mon propre message n’annonce rien et ne ferme pas sur sa propre nature', () => {
    const { effectFlags: _absent, ...unreadable } = message();
    expect(captureOf(unreadable, NOW, { isMine: true })).toBe('free');
    expect(captureOf(message({ effectFlags: EPHEMERAL, ephemeralDuration: 60 }), NOW, { isMine: true })).toBe('free');
  });

  test('un éphémère échu ne montre plus rien', () => {
    const expired = message({ effectFlags: EPHEMERAL, ephemeralDuration: 60, expiresAt: new Date(NOW - 1000) });
    expect(captureOf(expired, NOW, { isMine: false })).toBe('free');
  });

  test('l’attribut de la rangée porte le verdict, rien pour un message libre', () => {
    expect(captureProps(message(), NOW, { isMine: false })).toEqual({});
    expect(captureProps(message({ effectFlags: EPHEMERAL, ephemeralDuration: 60 }), NOW, { isMine: false })).toEqual({
      [CAPTURE_ROW_ATTRIBUTE]: 'announced',
    });
  });
});
