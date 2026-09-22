import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FeedEmpty, FeedError, FeedHeader, FeedSkeleton, FeedTopChrome, FEED_HEADER_HEIGHT, FEED_TOP_RESERVE } from './feed';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { READING_COLUMN_MAX } from '@/lib/view/reading-column';
import type { StoryTrayGroup } from '@/lib/view/story-tray';

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

const groupe = (authorId: string, displayName: string): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName } as StoryTrayGroup['author'],
  stories: [{ id: `st-${authorId}`, isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: `st-${authorId}`,
});

const RAIL_VIDE = { groups: [], loading: false, language: 'fr' } as const;
const RAIL_PLEIN = { groups: [groupe('u-amina', 'Amina Diallo')], loading: false, language: 'fr' } as const;

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
  test('pagination : le fil demande DEUX cartes fantômes de la même forme (#6987)', () => {
    const html = renderToStaticMarkup(<FeedSkeleton count={2} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/border-radius:18px/g)?.length).toBe(2);
  });

  test('chargement : trois cartes fantômes, masquées aux technologies d’assistance', () => {
    const html = renderToStaticMarkup(<FeedSkeleton />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-busy');
    expect(html.match(/border-radius:18px/g)?.length).toBe(3);
  });

  test('l’en-tête porte le titre d’iOS et un retour NOMMÉ vers la liste, cible 44', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).toContain('Meeshy Feed');
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('size-11');
    expect(html).toContain('href="/"');
  });

  /** `FeedView.swift` : la première action de l'en-tête, `play.rectangle.on.
   * rectangle.fill`, « Lancer les Réels » ⇒ `ReelsPresenter.presentFresh()`
   * (#6457). UN seul bouton, en haut à droite : après le titre. */
  test('l’en-tête ouvre les Réels SANS graine, par un bouton nommé à droite du titre, cible 44', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).toContain('href="/reels"');
    expect(html).toContain('aria-label="Lancer les Réels"');
    expect(html.indexOf('href="/reels"')).toBeGreaterThan(html.indexOf('Meeshy Feed'));
    expect(html.match(/href="\/reels/g)?.length).toBe(1);
    const anchor = html.match(/<a [^>]*href="\/reels"[^>]*>/)?.[0] ?? '';
    expect(anchor).toContain('size-11');
    expect(anchor).toContain('draggable="false"');
  });

  /**
   * LA PORTE DE CRÉATION (#7449) — et son ORDRE, qui n'est pas un goût : deux
   * gates mesurent que « Lancer les Réels » touche le bord droit
   * (`check-reels.mjs`, `innerWidth - right <= 16`) et vit dans les 64 derniers
   * pixels (`check-feed-disc.mjs`). Insérer la création à sa droite le
   * déplacerait ; ce témoin fixe l'ordre AVANT qu'un navigateur n'ait à le
   * mesurer.
   */
  test('la porte de création se pose AVANT « Lancer les Réels », qui reste le dernier contrôle', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).toContain('data-feed-create');
    expect(html).toContain('aria-label="Créer une publication ou un réel"');
    expect(html.indexOf('data-feed-create')).toBeGreaterThan(html.indexOf('Meeshy Feed'));
    expect(html.indexOf('data-feed-create')).toBeLessThan(html.indexOf('href="/reels"'));
  });

  /**
   * LE CHROME PREND LA FENÊTRE (#7449, directive porteur du 2026-09-22) —
   * l'en-tête ne porte AUCUNE borne, et le témoin l'exige plutôt que de le
   * constater : la première écriture du lot la lui avait donnée, ce qui
   * rétrécissait « Meeshy Feed » avec les cartes. C'est la mesure de LECTURE
   * qu'on borne, jamais l'application.
   */
  test('l’en-tête ne se borne PAS — il prend toute la fenêtre', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).not.toContain(`max-width:${READING_COLUMN_MAX}px`);
  });

  /** LE PLATEAU DES STORIES AUSSI — il vit DANS le scrollport (il sort du
   * champ au défilement, #6103) et reste pourtant du chrome : il court de
   * bord à bord de la fenêtre. */
  test('le plateau des stories ne se borne PAS non plus', () => {
    const html = renderToStaticMarkup(<FeedTopChrome railProps={RAIL_PLEIN} inert={false} />);
    expect(html).not.toContain(`max-width:${READING_COLUMN_MAX}px`);
  });

  /** ...et le CONTENU, lui, la porte : le squelette est la seule pièce de
   * contenu que ce fichier peut rendre seule. */
  test('le contenu porte la colonne, bornée et centrée', () => {
    const html = renderToStaticMarkup(<FeedSkeleton count={1} />);
    expect(html).toContain(`max-width:${READING_COLUMN_MAX}px`);
    expect(html).toContain('margin-inline:auto');
  });
});

/**
 * **LE HAUT DU FIL RÉSERVE LE COULOIR DES DISQUES FLOTTANTS** (#6277) — la loi
 * d'iOS, jamais une cote mesurée puis recopiée.
 *
 * iOS pose les disques sous `FloatingButtonSafeZone.top` (encoche + en-tête
 * étendu, `FloatingButtons.swift:48-59`) et ouvre son fil par un plateau de
 * stories de hauteur FIXE (`StoryTrayView.frame(height: 120)`, présent même
 * sans aucune story puisqu'il porte « Moi ») : la première carte ne peut donc
 * jamais commencer dans le couloir. Le rail du web, lui, ne peint RIEN sans
 * corpus (`StoryRail`) — c'est pourquoi la réserve est un PLANCHER porté par le
 * chrome du fil, et non la hauteur du rail.
 */
describe('le fil réserve le couloir des disques flottants (#6277)', () => {
  test('la réserve vaut le bas du couloir moins la hauteur de l’en-tête — deux cotes nommées, aucune mesure', () => {
    expect(FEED_HEADER_HEIGHT).toBe(64);
    expect(FLOATING_CORRIDOR_BOTTOM).toBe(178);
    expect(FEED_TOP_RESERVE).toBe(FLOATING_CORRIDOR_BOTTOM - FEED_HEADER_HEIGHT);
  });

  test('l’en-tête DÉCLARE sa hauteur : la réserve ne dépend d’aucune ligne de texte', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).toContain(`height:${FEED_HEADER_HEIGHT}px`);
  });

  test('sans aucune story, le plancher tient SEUL le couloir', () => {
    const html = renderToStaticMarkup(<FeedTopChrome railProps={RAIL_VIDE} inert={false} />);
    expect(html).toContain(`min-height:${FEED_TOP_RESERVE}px`);
    expect(html).not.toContain('data-rail');
  });

  test('avec des stories, le GRAND plateau d’iOS occupe le couloir', () => {
    const html = renderToStaticMarkup(<FeedTopChrome railProps={RAIL_PLEIN} inert={false} />);
    expect(html).toContain('data-rail="grande"');
    expect(html).toContain(`min-height:${FEED_TOP_RESERVE}px`);
    expect(html).toContain('Amina Diallo');
  });
});

/**
 * **L'EN-TÊTE DU FIL S'ESCAMOTE COMME CELUI DE LA LISTE** (#6277) — iOS monte
 * le même `CollapsibleHeader` sur les deux écrans, avec la même
 * `PinnedStoryTrailBand` dans la fente du titre (`FeedView.swift:610-634`).
 * Une seconde implémentation de la bascule sur le fil aurait été la jumelle qui
 * diverge : c'est la même fente (`RailTitleSlot`) qui sert les deux.
 */
describe('l’en-tête du fil s’escamote (#6277)', () => {
  test('au repos : le titre se lit, aucune bande n’est matérialisée', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned={false} railProps={RAIL_PLEIN} />);
    expect(html).toContain('Meeshy Feed');
    expect(html).not.toContain('data-rail="pinned"');
  });

  test('défilé : le titre cède et la bande compacte prend SA fente', () => {
    const html = renderToStaticMarkup(<FeedHeader pinned railProps={RAIL_PLEIN} />);
    expect(html).toMatch(/<h1[^>]*aria-hidden="true"/);
    expect(html).toContain('data-rail="pinned"');
    expect(html).toContain('data-title-slot');
  });
});
