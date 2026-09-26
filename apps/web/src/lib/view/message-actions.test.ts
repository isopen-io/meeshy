import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { translation } from '@/lib/api/fixtures-base';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';

import {
  EXTENDED_REACTIONS,
  QUICK_REACTIONS,
  messageDetailExposureOf,
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
  canForward: true,
  ...overrides,
});

describe('messageMenuItems — miroir MessageActionResolver.primaryActions, réduit (#5814 §1.2)', () => {
  test('message standard, deux langues ⇒ select, translate, copy, forward, reply, more', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).toEqual(['select', 'translate', 'copy', 'forward', 'reply', 'more']);
  });

  test('message SANS texte (m3) ⇒ select, forward, reply, more — ni copy ni translate', () => {
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).toEqual(['select', 'forward', 'reply', 'more']);
  });

  test('message PROTÉGÉ (D-23) ⇒ ni copy ni translate, même avec du texte', () => {
    expect(messageMenuItems(ctx({ isProtected: true })).map((i) => i.id)).toEqual(['select', 'forward', 'reply', 'more']);
  });

  test('une seule langue ⇒ pas de translate, copy reste', () => {
    expect(messageMenuItems(ctx({ languageCount: 1 })).map((i) => i.id)).toEqual(['select', 'copy', 'forward', 'reply', 'more']);
  });

  /**
   * LE MENU PORTE DES CLÉS, JAMAIS DES LIBELLÉS (#7555). Cette loi est PURE :
   * elle ne connaît ni la langue du lecteur ni le catalogue chargé — elle
   * nomme ce qu'il faut dire, et `message-menu.tsx` le dit. Un libellé rendu
   * ici aurait à nouveau figé le français dans une loi que les sept langues
   * partagent.
   */
  test('chaque entrée porte une CLÉ de catalogue, jamais un libellé', () => {
    const keys = Object.fromEntries(messageMenuItems(ctx()).map((i) => [i.id, i.labelKey]));
    expect(keys).toEqual({
      select: 'message.menu.select',
      translate: 'message.menu.translate',
      copy: 'message.menu.copy',
      forward: 'message.menu.forward',
      reply: 'message.menu.reply',
      more: 'message.menu.more',
    });
  });

  /**
   * TÉMOIN DE RANG SUR UNE LOCALE NON FRANÇAISE (leçon 261, #7555) — le
   * français ne peut PAS trancher : un libellé EN DUR et une clé de catalogue
   * rendent le même verdict en `fr`, exactement comme le rang 1 du Prisme
   * rend le même verdict pour une descente juste et pour un court-circuit.
   * L'anglais et l'arabe séparent les deux, et l'arabe est de plus la langue
   * RTL du produit : un menu qui ne l'a jamais servie ne l'a jamais essayée.
   */
  test('ces clés se SERVENT — anglais puis arabe, jamais une recopie du français', async () => {
    await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
    expect(messageMenuItems(ctx()).map((i) => translate('en', i.labelKey))).toEqual([
      'Select',
      'Translate',
      'Copy',
      'Forward',
      'Reply',
      'More…',
    ]);
    expect(messageMenuItems(ctx()).map((i) => translate('ar', i.labelKey))).toEqual([
      'تحديد',
      'ترجمة',
      'نسخ',
      'إعادة توجيه',
      'رد',
      'المزيد…',
    ]);
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

  /** LE CACHE ALLÉGÉ NE PORTE PAS LE CHAMP (#7527) — le témoin le passe donc
   * ABSENT, jamais `undefined` explicite derrière une assertion : c'est la
   * SIGNATURE qui doit l'accepter, et une assertion l'aurait justement
   * dispensée de le faire. */
  test('translations ABSENT (cache allégé) ⇒ languageCount = 1, pas TypeError', () => {
    const result = messageMenuContextOf(
      {
        content: 'nouveau message',
        isBlurred: false,
        isViewOnce: false,
        viewOnceCount: 0,
      },
      { now: 1000 },
    );
    expect(result.languageCount).toBe(1);
    expect(result.hasText).toBe(true);
    expect(result.isProtected).toBe(false);
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

  test('translations ABSENT ⇒ choices ne contient que l\'original, sans jeter', () => {
    const choices = translationChoices({
      message: { originalLanguage: 'fr' },
      preferredLanguages: ['en', 'es'],
      servedLanguage: 'fr',
    });
    expect(choices).toEqual([{ code: 'fr', isOriginal: true, isServed: true }]);
  });
});

describe('« Transférer » n\'apparaît que si la règle du serveur l\'admet (#5866)', () => {
  test('message transférable ⇒ l\'entrée est là, entre Copier et Répondre', () => {
    const ids = messageMenuItems(ctx()).map((i) => i.id);
    expect(ids).toContain('forward');
    expect(ids.indexOf('forward')).toBeGreaterThan(ids.indexOf('copy'));
    expect(ids.indexOf('forward')).toBeLessThan(ids.indexOf('reply'));
  });

  // La garde vit côté client AVANT l'aller-retour : `admitMessageForward`
  // refuse une vue unique côté serveur, et découvrir l'interdit après coup
  // serait une promesse rompue, pas une protection.
  test('message non transférable ⇒ aucune entrée, jamais une entrée grisée', () => {
    expect(messageMenuItems(ctx({ canForward: false })).map((i) => i.id)).not.toContain('forward');
  });

  test('son libellé vient du catalogue, comme les cinq autres', () => {
    const item = messageMenuItems(ctx()).find((i) => i.id === 'forward');
    expect(item?.labelKey).toBe('message.menu.forward');
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

describe('messageDetailExposureOf — la feuille « Plus… » ne fait pas fuir un contenu non ouvert (#8008)', () => {
  const base = { content: 'bonjour', isBlurred: false, isViewOnce: false, viewOnceCount: 0 };

  test('un message ordinaire expose ses langues et ses pièces', () => {
    expect(messageDetailExposureOf(base, { now: 1000 })).toBe(true);
  });

  test('flouté : ni langues à explorer, ni pièces nommées', () => {
    expect(messageDetailExposureOf({ ...base, isBlurred: true }, { now: 1000 })).toBe(false);
  });

  test('à vue unique, scellée ou déjà ouverte : rien non plus', () => {
    expect(messageDetailExposureOf({ ...base, isViewOnce: true }, { now: 1000 })).toBe(false);
    expect(messageDetailExposureOf({ ...base, isViewOnce: true, viewOnceCount: 1 }, { now: 1000 })).toBe(false);
  });
});
