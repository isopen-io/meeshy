import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadGameCatalog, translateGame } from '@/lib/i18n-game-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionOfflineNotice } from './progression-shell';

/**
 * LA BANDE « HORS LIGNE » DE LA ZONE PROGRESSION PARLE LA LANGUE DU LECTEUR
 * (iter-77w). Le hub (`progression.tsx`) et chaque page dédiée — Badges, Défis,
 * Succès — montent la même bande via `ProgressionPage`. Elle écrivait son texte
 * EN DUR EN FRANÇAIS (deux littéraux : `OfflineNotice` est muet, il rend ses
 * enfants), alors que tout le reste de l'écran — titre, compteur, état d'erreur
 * froid (`offline_title` / `offline_hint`), squelette — passe par le catalogue
 * du jeu. C'était la SEULE bande hors-ligne non traduite du produit (toutes les
 * autres — profil, appels, liens, découvrir, communautés, réglages — prennent
 * une langue). Un lecteur non francophone, hors ligne (le cas nominal, l'écran
 * étant cache-first), voyait une bande française au-dessus d'un écran anglais.
 */
beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadGameCatalog('en');
  await loadGameCatalog('fr');
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  await releaseHappyDomIfRegistered();
});

describe('ProgressionOfflineNotice — la langue du lecteur, jamais le français en dur (iter-77w)', () => {
  test('hub en anglais ⇒ le catalogue anglais, pas le littéral français', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<ProgressionOfflineNotice scope="hub" />);
    expect(html).toContain(translateGame('en', 'game.page.offline_notice'));
    expect(html).not.toContain(translateGame('fr', 'game.page.offline_notice'));
  });

  test('page dédiée en anglais ⇒ le catalogue anglais, pas le littéral français', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<ProgressionOfflineNotice scope="page" />);
    expect(html).toContain(translateGame('en', 'game.page.offline_notice_brief'));
    expect(html).not.toContain(translateGame('fr', 'game.page.offline_notice_brief'));
  });

  test('français ⇒ le texte attendu, câblage préservé', () => {
    document.documentElement.lang = 'fr';
    expect(renderToStaticMarkup(<ProgressionOfflineNotice scope="hub" />)).toContain('Hors ligne — progression telle qu’à la dernière ouverture');
    expect(renderToStaticMarkup(<ProgressionOfflineNotice scope="page" />)).toContain('Hors ligne — tel qu’à la dernière ouverture');
  });
});
