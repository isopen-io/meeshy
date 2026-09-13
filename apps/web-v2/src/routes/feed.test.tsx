import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FeedEmpty, FeedError, FeedHeader, FeedSkeleton, FeedTopClearance } from './feed';

/**
 * LES ÉTATS DESSINÉS DU FIL DES PUBLICATIONS (#5893, revue-correction) — la
 * première forme n'avait AUCUN témoin d'écran : les quatre états (chargement,
 * erreur, hors-ligne, vide) n'existaient que dans une capture. Un écran blanc
 * n'est pas un état, et c'est précisément ce qu'aucune capture heureuse ne
 * montre.
 *
 * `renderToStaticMarkup` sans DOM ni TanStack Query — même méthode que
 * `progression.test.tsx` : ce sont des composants PURS, chacun un état, et
 * c'est la raison pour laquelle ils sont découpés ainsi.
 */
describe('les quatre états du fil sont DESSINÉS, jamais un écran blanc', () => {
  test('erreur EN LIGNE : le motif, la conduite à tenir, et « Réessayer » à 44 px', () => {
    const html = renderToStaticMarkup(<FeedError online onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible de charger le fil');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  test('erreur HORS LIGNE : un motif DIFFÉRENT, qui promet le retour du réseau', () => {
    const html = renderToStaticMarkup(<FeedError online={false} onRetry={() => undefined} />);
    expect(html).toContain('Hors ligne');
    expect(html).not.toContain('Impossible de charger le fil');
    // Même hors ligne, la reprise reste offerte : c'est le geste qui suit un
    // retour de réseau que le navigateur n'a pas encore signalé.
    expect(html).toContain('Réessayer');
  });

  test('vide : le corpus est absent, l’écran le DIT et annonce ce qui viendra', () => {
    const html = renderToStaticMarkup(<FeedEmpty />);
    expect(html).toContain('Aucune publication');
    expect(html).toContain('Les publications de vos contacts');
  });

  /** Le squelette est un DÉCOR — l'annonce « Chargement » vit sur le
   * scrollport qui le porte (`FeedScreen`). Deux annonces pour un seul état
   * font lire deux fois la même chose. */
  test('chargement : trois cartes fantômes, masquées aux technologies d’assistance', () => {
    const html = renderToStaticMarkup(<FeedSkeleton />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-busy');
    expect(html.match(/border-radius:18px/g)?.length).toBe(3);
  });

  test('l’en-tête porte le titre d’iOS et un retour NOMMÉ vers la liste, cible 44', () => {
    const html = renderToStaticMarkup(<FeedHeader />);
    expect(html).toContain('Meeshy Feed');
    expect(html).toContain('aria-label="Retour aux conversations"');
    expect(html).toContain('size-11');
    expect(html).toContain('href="/"');
  });
});

/**
 * LA BANDE QUI EMPÊCHE LES DISQUES FLOTTANTS DE RECOUVRIR LA PREMIÈRE CARTE
 * (revue-correction de #5893/#6104) — mesuré au navigateur (Playwright,
 * 390×844) AVANT ce correctif : les deux disques (`.floating-disc`,
 * `styles/floating-menus.css:53` + `FLOATING_BUTTON`) occupent 126-178 px
 * depuis le haut de l'écran, et la première carte du fil commençait à 65 —
 * son texte (137) et sa rangée d'actions (178) passaient dessous. La bande
 * DÉCORATIVE ci-dessous comble exactement cet écart (113 px).
 */
describe('le corridor des disques flottants ne recouvre plus la première carte', () => {
  test('la bande est masquée aux technologies d’assistance et couvre le corridor mesuré (178 − 65 = 113 px)', () => {
    const html = renderToStaticMarkup(<FeedTopClearance />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('height:113px');
  });
});
