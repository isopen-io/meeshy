import { describe, expect, test } from 'bun:test';

import { CARD_CONTEXT_CAP, cardContextOf, interactionOf, negativeOf, prismOf, rememberCard } from './card-context';

/** LE CONTEXTE D'UN GESTE (#10502, #10503). */
const ID = (n: number) => n.toString(16).padStart(24, '0');

describe('interactionOf — réagir dans le fil', () => {
  test('porte la surface, la position, le Prisme servi et la lecture écoulée', () => {
    rememberCard(ID(1), {
      targetKind: 'post',
      surface: 'feed',
      listing: { position: 4, rankingSource: 'following' },
      prism: { displayedLanguage: 'fr', originalLanguage: 'en', translated: true, translationSource: 'server' },
      shownAt: 1000,
    });
    expect(interactionOf(ID(1), 'react', {}, 4500)).toEqual({
      type: 'interaction',
      action: 'react',
      target: { kind: 'post', id: ID(1) },
      surface: 'feed',
      listing: { position: 4, rankingSource: 'following' },
      prism: { displayedLanguage: 'fr', originalLanguage: 'en', translated: true, translationSource: 'server' },
      dwellBeforeMs: 3500,
    });
  });

  test('une carte inconnue : la cible seule', () => {
    expect(interactionOf('f'.repeat(24), 'save', {}, 0)).toEqual({ type: 'interaction', action: 'save', target: { kind: 'post', id: 'f'.repeat(24) } });
  });

  test('un partage dit sa destination', () => {
    expect(interactionOf('e'.repeat(24), 'share', { destination: 'copy_link' }, 0)).toMatchObject({ action: 'share', destination: 'copy_link' });
  });
});

describe('negativeOf', () => {
  test('un signalement porte son code de raison, jamais de texte, ni lecture écoulée', () => {
    rememberCard(ID(2), { targetKind: 'reel', surface: 'reels', shownAt: 0 });
    expect(negativeOf(ID(2), 'report_submit', { reasonCode: 'spam' }, 900)).toEqual({
      type: 'negative',
      action: 'report_submit',
      target: { kind: 'reel', id: ID(2) },
      surface: 'reels',
      reasonCode: 'spam',
    });
  });
});

describe('prismOf', () => {
  test('ce que le Prisme a servi ; une langue illisible ne part pas', () => {
    expect(prismOf({ language: 'fr', originalLanguage: 'fr', translated: false })).toEqual({ displayedLanguage: 'fr', originalLanguage: 'fr', translated: false });
    expect(prismOf({ language: '??', originalLanguage: 'fr', translated: false })).toBeUndefined();
  });
});

describe('le registre est borné', () => {
  test(`au-delà de ${CARD_CONTEXT_CAP} cartes, la plus ancienne sort`, () => {
    for (let n = 100; n < 100 + CARD_CONTEXT_CAP + 1; n += 1) rememberCard(ID(n), { targetKind: 'post', shownAt: 0 });
    expect(cardContextOf(ID(100))).toBeUndefined();
    expect(cardContextOf(ID(100 + CARD_CONTEXT_CAP))).toBeDefined();
  });
});
