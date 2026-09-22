import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { translation } from '@/lib/api/fixtures-base';

import {
  EXTENDED_REACTIONS,
  QUICK_REACTIONS,
  messageMenuContextOf,
  messageMenuItems,
  messageStarAction,
  starrableOf,
  translationChoices,
  type MessageMenuContext,
} from './message-actions';

/** Un `MessageMenuContext` de base — « rien de protégé, deux langues ». */
const ctx = (overrides: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  hasText: true,
  isProtected: false,
  languageCount: 2,
  ...overrides,
});

describe('messageMenuItems — miroir MessageActionResolver.primaryActions, réduit (#5814 §1.2)', () => {
  test('message standard, deux langues ⇒ select, translate, copy, compose, more', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).toEqual(['select', 'translate', 'copy', 'compose', 'more']);
  });

  test('message SANS texte (m3) ⇒ select, compose, more — ni copy ni translate', () => {
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).toEqual(['select', 'compose', 'more']);
  });

  test('message PROTÉGÉ (D-23) ⇒ ni copy ni translate, même avec du texte', () => {
    expect(messageMenuItems(ctx({ isProtected: true })).map((i) => i.id)).toEqual(['select', 'compose', 'more']);
  });

  test('une seule langue ⇒ pas de translate, copy reste', () => {
    expect(messageMenuItems(ctx({ languageCount: 1 })).map((i) => i.id)).toEqual(['select', 'copy', 'compose', 'more']);
  });

  test('libellés exacts', () => {
    const labels = Object.fromEntries(messageMenuItems(ctx()).map((i) => [i.id, i.label]));
    expect(labels).toEqual({
      select: 'Sélectionner',
      translate: 'Traduire',
      copy: 'Copier',
      compose: 'Composer',
      more: 'Plus…',
    });
  });

  test('QUICK_REACTIONS et EXTENDED_REACTIONS — miroir MessageOverlayMenu.swift:99-104', () => {
    expect(QUICK_REACTIONS).toEqual(['😂', '❤️', '👍', '😮', '😢', '🔥']);
    expect(EXTENDED_REACTIONS.length).toBe(20);
    expect(EXTENDED_REACTIONS.slice(0, 6)).toEqual(QUICK_REACTIONS as unknown as string[]);
  });
});

describe('messageMenuContextOf — dérivé du message, jamais une seconde loi de protection', () => {
  test('D-23 : un message flouté est protégé', () => {
    const result = messageMenuContextOf(
      {
        content: 'bonjour',
        isBlurred: true,
        isViewOnce: false,
        viewOnceCount: 0,
        translations: [],
      },
      { now: 1000 },
    );
    expect(result.isProtected).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.languageCount).toBe(1);
  });

  test('contenu vide (image seule) ⇒ hasText false', () => {
    const result = messageMenuContextOf(
      { content: '  ', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] },
      { now: 1000 },
    );
    expect(result.hasText).toBe(false);
  });
});

describe('translationChoices — original puis les rangs du PRISME, jamais l’ordre du tableau', () => {
  test('témoin de RANG (leçon 261) : lecteur [es,en], message fr + trad en ⇒ servie au rang 2', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m2', 'en', 'Hello')],
    };
    const choices = translationChoices({
      message,
      preferredLanguages: ['es', 'en'],
      servedLanguage: 'en',
    });
    expect(choices).toEqual([
      { code: 'fr', isOriginal: true, isServed: false },
      { code: 'en', isOriginal: false, isServed: true },
    ]);
  });

  test('le reste des traductions, non couvertes par le prisme, ferme la liste', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m9', 'en', 'Hello'), translation('m9', 'de', 'Hallo')],
    };
    const choices = translationChoices({ message, preferredLanguages: ['en'], servedLanguage: 'en' });
    expect(choices.map((c) => c.code)).toEqual(['fr', 'en', 'de']);
  });
});

/**
 * **LE FAVORI DANS « PLUS… »** (#7378) — iOS range l'étoile dans la feuille
 * « Plus… », section « Faire », juste après l'épingle
 * (`MessageActionResolver.moreSections`, `ctx.isStarred ? .unstar : .star`).
 * Le web n'a pas d'épingle : l'étoile ouvre la section.
 *
 * Deux écarts assumés avec iOS, et les deux vont dans le sens de la vérité :
 * - iOS la propose SANS CONDITION, vue unique comprise (son magasin est local) ;
 *   le serveur refuse désormais la vue unique (409 `MESSAGE_NOT_STARRABLE`),
 *   donc l'entrée n'apparaît pas plutôt que d'échouer au tap ;
 * - l'état est INCONNU tant que l'ensemble des favoris n'est pas chargé :
 *   l'entrée n'apparaît pas plutôt que de dire « Ajouter » sur un message déjà
 *   en favori.
 */
describe('messageStarAction — l’étoile ne ment pas sur son état', () => {
  test('état CONNU, pas en favori ⇒ « Ajouter aux favoris »', () => {
    expect(messageStarAction({ starred: false, starrable: true })).toBe('star');
  });

  test('état CONNU, en favori ⇒ « Retirer des favoris »', () => {
    expect(messageStarAction({ starred: true, starrable: true })).toBe('unstar');
  });

  test('état INCONNU ⇒ aucune entrée, jamais une supposition', () => {
    expect(messageStarAction({ starred: undefined, starrable: true })).toBeNull();
  });

  test('message non favorisable ⇒ aucune entrée pour AJOUTER', () => {
    expect(messageStarAction({ starred: false, starrable: false })).toBeNull();
  });

  test('une étoile déjà posée se RETIRE toujours, même sur un message devenu non favorisable', () => {
    expect(messageStarAction({ starred: true, starrable: false })).toBe('unstar');
  });
});

describe('starrableOf — ce que le serveur accepterait (règle 2 de #7377)', () => {
  const base = { id: '66f0a1b2c3d4e5f6a7b8c9d0', isViewOnce: false, effectFlags: 0 } as const;
  const NOW = Date.parse('2026-09-22T10:00:00.000Z');

  test('un message ordinaire, flouté ou éphémère encore vivant se met en favori', () => {
    expect(starrableOf(base, { now: NOW })).toBe(true);
    expect(starrableOf({ ...base, expiresAt: new Date(NOW + 60_000) }, { now: NOW })).toBe(true);
  });

  test('la VUE UNIQUE ne se met pas en favori — par le booléen ET par le bit d’effet', () => {
    expect(starrableOf({ ...base, isViewOnce: true }, { now: NOW })).toBe(false);
    expect(starrableOf({ ...base, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }, { now: NOW })).toBe(false);
  });

  test('supprimé ou expiré : rien à mettre en favori', () => {
    expect(starrableOf({ ...base, deletedAt: new Date(NOW - 1000) }, { now: NOW })).toBe(false);
    expect(starrableOf({ ...base, expiresAt: new Date(NOW - 1000) }, { now: NOW })).toBe(false);
  });

  test('un message encore OPTIMISTE (`cid_…`) n’existe pas côté serveur', () => {
    expect(starrableOf({ ...base, id: 'cid_0f0e0d0c-0b0a-4908-8706-050403020100' }, { now: NOW })).toBe(false);
  });
});
