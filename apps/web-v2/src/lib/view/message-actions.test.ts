import { beforeAll, describe, expect, test } from 'bun:test';

import { translation } from '@/lib/api/fixtures-base';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import {
  EXTENDED_REACTIONS,
  QUICK_REACTIONS,
  messageMenuContextOf,
  messageMenuItems,
  translationChoices,
  type MessageMenuContext,
} from './message-actions';

/** L'allemand n'est pas préchargé (`interface-catalog-preload.ts` ne charge
 * que la langue du document, `fr`) — le témoin de LANGUE le charge lui-même. */
beforeAll(async () => {
  await loadInterfaceCatalog('de');
});

/** Un `MessageMenuContext` de base — « rien de protégé, deux langues, transférable ». */
const ctx = (overrides: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  hasText: true,
  isProtected: false,
  languageCount: 2,
  canForward: true,
  ...overrides,
});

describe('messageMenuItems — miroir MessageActionResolver.primaryActions, réduit (#5814 §1.2)', () => {
  test('message standard, deux langues ⇒ select, translate, copy, forward, compose, more', () => {
    expect(messageMenuItems(ctx(), 'fr').map((i) => i.id)).toEqual([
      'select',
      'translate',
      'copy',
      'forward',
      'compose',
      'more',
    ]);
  });

  test('message SANS texte (m3) ⇒ select, forward, compose, more — ni copy ni translate', () => {
    expect(messageMenuItems(ctx({ hasText: false }), 'fr').map((i) => i.id)).toEqual([
      'select',
      'forward',
      'compose',
      'more',
    ]);
  });

  test('message PROTÉGÉ (D-23) ⇒ ni copy ni translate, même avec du texte', () => {
    expect(messageMenuItems(ctx({ isProtected: true }), 'fr').map((i) => i.id)).toEqual([
      'select',
      'forward',
      'compose',
      'more',
    ]);
  });

  test('une seule langue ⇒ pas de translate, copy reste', () => {
    expect(messageMenuItems(ctx({ languageCount: 1 }), 'fr').map((i) => i.id)).toEqual([
      'select',
      'copy',
      'forward',
      'compose',
      'more',
    ]);
  });

  /**
   * #5866 — LA GARDE SERVEUR, DITE AVANT L'ALLER-RETOUR. `admitMessageForward`
   * (`forwardAdmission.ts:216-220`) refuse une vue unique ; le menu ne doit
   * donc pas OFFRIR le geste, sinon l'interdit se découvre après avoir choisi
   * un destinataire.
   */
  test('un message à VUE UNIQUE n’offre PAS « Transférer »', () => {
    expect(messageMenuItems(ctx({ canForward: false }), 'fr').map((i) => i.id)).toEqual([
      'select',
      'translate',
      'copy',
      'compose',
      'more',
    ]);
  });

  test('libellés exacts', () => {
    const labels = Object.fromEntries(messageMenuItems(ctx(), 'fr').map((i) => [i.id, i.label]));
    expect(labels).toEqual({
      select: 'Sélectionner',
      translate: 'Traduire',
      copy: 'Copier',
      forward: 'Transférer',
      compose: 'Composer',
      more: 'Plus…',
    });
  });

  /**
   * LE TÉMOIN DE LANGUE (#5866) — sur une langue AUTRE que le français : en
   * français, un libellé écrit en dur et un libellé lu au catalogue rendent le
   * MÊME texte, donc le témoin ne peut pas tomber (leçon 261, transposée).
   */
  test('les six libellés viennent du catalogue — allemand, jamais un défaut français', () => {
    const labels = messageMenuItems(ctx(), 'de').map((i) => i.label);
    expect(labels).toEqual(['Auswählen', 'Übersetzen', 'Kopieren', 'Weiterleiten', 'Verfassen', 'Mehr…']);
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

  test('contenu vide (image seule) ⇒ hasText false, mais TRANSFÉRABLE (#5866)', () => {
    const result = messageMenuContextOf(
      { content: '  ', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] },
      { now: 1000 },
    );
    expect(result.hasText).toBe(false);
    /* Un média SEUL est le cas nominal du transfert : la passerelle copie ses
       pièces jointes depuis `forwardedFromId`, sans aucun texte. */
    expect(result.canForward).toBe(true);
  });

  test('#5866 : une VUE UNIQUE n’est pas transférable — la loi de `forward.ts`, jamais une seconde', () => {
    const result = messageMenuContextOf(
      { content: 'secret', isBlurred: false, isViewOnce: true, viewOnceCount: 0, translations: [] },
      { now: 1000 },
    );
    expect(result.canForward).toBe(false);
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
