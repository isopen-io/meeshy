import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PrismPastille } from './message-blocks';

/**
 * **LA PASTILLE DU PRISME PARLE LA LANGUE DE L'INTERFACE, ET NOMME CE QU'ELLE
 * QUALIFIE** (#7141, critère 2).
 *
 * `PrismPastille` portait ses trois libellés EN DUR, en français — « Message
 * traduit », « Afficher/Masquer le message dans sa langue d'origine ». Tant
 * qu'elle ne servait que le fil, cela ne se voyait pas comme un défaut de
 * catalogue ; la monter sur les publications et les commentaires l'aurait
 * répandu sous les sept langues d'interface.
 *
 * **Deux choses à la fois, et elles ne se séparent pas** : la LANGUE (le
 * catalogue) et le SUJET (ce que la pastille qualifie). « Afficher le message
 * dans sa langue d'origine » sur un commentaire serait traduit et faux.
 *
 * ## POURQUOI NEUF CLÉS ET NON TROIS À PARAMÈTRE
 *
 * Un `{sujet}` interpolé impose l'accord au catalogue : « Message traduit » /
 * « Publication traduite » ne diffèrent pas que par le nom, et l'arabe,
 * l'allemand ou l'italien ne s'accordent pas comme le français. Trois clés
 * paramétrées obligeraient chaque langue à une gymnastique que le dépôt paierait
 * en fautes ; neuf clés plates se traduisent sans piège.
 *
 * ## LE TÉMOIN DE LANGUE SE LIT SUR UN TEXTE, JAMAIS SUR UNE CLÉ
 *
 * Asserter `'prism.translated.comment'` verdirait sur une clé absente rendue
 * telle quelle. On lit donc la CHAÎNE attendue, et dans une langue qui n'est pas
 * le français — une clé manquante en anglais rendrait le français (ou la clé),
 * et les deux sont visibles ici.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('en');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const rendu = (markup: string) => markup;

describe('PrismPastille — la forme SANS geste annonce, dans la langue de l’interface', () => {
  test('sur un COMMENTAIRE, en anglais', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille servedLanguage="fr" originalLanguage="es" active={null} language="en" subject="comment" />,
      ),
    );

    expect(html).toContain('data-prism-indicator');
    expect(html).toContain('Translated comment');
    expect(html).not.toContain('Message traduit');
  });

  test('sur une PUBLICATION, en français — le SUJET change, pas seulement la langue', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille servedLanguage="fr" originalLanguage="es" active={null} language="fr" subject="post" />,
      ),
    );

    expect(html).toContain('Publication traduite');
    expect(html).not.toContain('Message traduit');
  });

  test('sur un MESSAGE, le fil garde son vocabulaire', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille servedLanguage="fr" originalLanguage="es" active={null} language="fr" subject="message" />,
      ),
    );

    expect(html).toContain('Message traduit');
  });
});

describe('PrismPastille — la forme À GESTE dit ce que le geste FERA', () => {
  test('fermée, elle propose d’ouvrir l’original — en anglais, sur un commentaire', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille
          servedLanguage="fr"
          originalLanguage="es"
          active={null}
          language="en"
          subject="comment"
          onToggle={() => {}}
        />,
      ),
    );

    expect(html).toContain('data-prism-toggle');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Show the comment in its original language');
  });

  test('ouverte, elle propose de le REFERMER — l’état est dit, pas seulement peint', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille
          servedLanguage="fr"
          originalLanguage="es"
          active="es"
          language="en"
          subject="comment"
          onToggle={() => {}}
        />,
      ),
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Hide the comment');
  });

  /**
   * LE CONTRE-TÉMOIN DE LA RÈGLE 1 DU PRISME : la pastille ne s'affiche QUE
   * quand un contenu est effectivement traduit. Servir la langue d'origine
   * n'est pas une traduction — annoncer le contraire serait un mensonge, et
   * offrir un geste qui « ouvre l'original » sur un texte qui EST l'original
   * serait un contrôle sans effet (loi 4).
   */
  test('quand la langue servie EST l’originale, il n’y a rien à annoncer', () => {
    const html = rendu(
      renderToStaticMarkup(
        <PrismPastille
          servedLanguage="es"
          originalLanguage="es"
          active={null}
          language="en"
          subject="comment"
          onToggle={() => {}}
        />,
      ),
    );

    expect(html).toBe('');
  });
});
