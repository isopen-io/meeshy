import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { GAME_EXTRAS_TODAY, gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { gamePrefs } from '@/lib/game/preferences';

import { MeeLine, ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';

const idle: GameActions = {
  mint: () => undefined,
  reroll: () => undefined,
  claimChest: () => undefined,
  buyFreeze: () => undefined,
  relight: () => undefined,
  pending: { mint: false, rerollId: null, chest: false, freeze: false, relight: false },
  errors: {},
  celebration: null,
  strikeKey: 0,
};

const NOW = new Date(`${GAME_EXTRAS_TODAY}T10:00:00.000Z`);
const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const withGame = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({ ...base, game: gameBlockFixture(patch), mintBadgeLoss: 2 });
const withExtras: EngagementWithGame = { ...base, game: gameBlockWithExtrasFixture() };

const hub = (progress: EngagementWithGame): string => renderToStaticMarkup(<ProgressionBody progress={progress} now={NOW} />);

const fiche = (concept: ProgressionConcept, progress: EngagementWithGame, extra: { online?: boolean; actions?: GameActions } = {}): string =>
  renderToStaticMarkup(
    <ConceptFiche concept={concept} progress={progress} host={{ actions: extra.actions ?? idle, online: extra.online ?? true }} now={NOW} />,
  );

/**
 * LE JEU, RANGÉ DANS LES FICHES (#9383, #9563) — les pièces du jeu ne sont plus
 * empilées sur la première page : le héros du niveau vit dans la fiche du
 * niveau, les missions et le coffre dans celle des missions, l'unique héros de
 * frappe dans celle des Meeshes, la Flamme à protéger dans celle de la Flamme, le
 * détail de ligue dans celle de la ligue. Et, contre un ancien serveur, ce que la
 * progression d'avant disait est toujours dit.
 */
describe('un serveur qui sert le bloc game', () => {
  test('la première page ne porte aucune pièce du jeu : des cartes, et les trois portes', () => {
    const page = hub(withGame());
    for (const piece of ['data-game-hero', 'id="game-missions"', 'id="game-mint"', 'id="game-flame-panel"', 'data-game-league-summary']) {
      expect({ piece, shown: page.includes(piece) }).toEqual({ piece, shown: false });
    }
    expect(page).toMatch(/<a[^>]*min-height:44px[^>]*href="\/me\/progression\/regles"/);
    expect(page).toMatch(/<a[^>]*min-height:44px[^>]*href="\/me\/progression\/carnet"/);
    expect(page).toMatch(/<a[^>]*min-height:44px[^>]*href="\/me\/progression\/reglages"/);
  });

  test('le niveau à 100 niveaux remplace l’ancien hero à 6 niveaux : deux niveaux contradictoires ne cohabitent pas', () => {
    const level = fiche('level', withGame());
    expect(level).toContain('data-game-hero');
    expect(level).toContain('id="game-level"');
    expect(level).not.toContain('progression-niveau');
  });

  test('aucune bulle de conversation : la mascotte-bulle cède à la ligne de Mee', () => {
    expect(hub(withGame())).not.toContain('data-mascot-coach');
  });

  test('les élans gardent leur détail, dans leur fiche', () => {
    expect(fiche('elans', withGame())).toContain('progression-elans');
  });
});

describe('UNE seule section de frappe (#9537)', () => {
  const meesh = fiche('meesh', withGame());

  test('un seul héros de frappe, un seul bouton, dans la fiche des Meeshes', () => {
    expect(meesh.match(/id="game-mint"/g)).toHaveLength(1);
    expect(meesh.match(/data-game-mint-action/g)).toHaveLength(1);
    expect(meesh).not.toContain('Comment frapper');
  });

  test('l’ancienne frappe du serveur d’avant ne s’y ajoute pas', () => {
    expect(meesh).not.toContain('data-meesh-mint');
  });

  test('aucune autre fiche ne porte la frappe', () => {
    for (const concept of ['level', 'points', 'glory', 'flame', 'missions'] as const) {
      expect({ concept, mint: fiche(concept, withGame()).includes('id="game-mint"') }).toEqual({ concept, mint: false });
    }
  });
});

describe('le détail de ligue vit dans la fiche de la ligue (#9541)', () => {
  test('placé dans la ligue : la gemme, la place, les points, la fermeture', () => {
    const league = fiche('league', withExtras);
    expect(league).toContain('data-game-league-summary');
    expect(league).toContain('data-game-league-place');
    expect(league).toContain('href="/me/progression/ligue"');
  });

  test('ligue verrouillée : aucun détail, la fiche dit à quel niveau elle s’ouvre', () => {
    const locked: EngagementWithGame = { ...withExtras, game: { ...withExtras.game!, league: { ...withExtras.game!.league!, access: 'locked', current: null } } };
    const league = fiche('league', locked);
    expect(league).not.toContain('data-game-league-summary');
    expect(league).toContain('Niveau 10');
  });
});

describe('les gestes se branchent sur les actions du crochet', () => {
  test('une frappe en cours occupe le bouton de l’aperçu', () => {
    expect(fiche('meesh', withGame(), { actions: { ...idle, pending: { ...idle.pending, mint: true } } })).toContain('Frappe en cours');
  });

  test('l’échec de la frappe se lit dans l’aperçu', () => {
    const page = fiche('meesh', withGame(), { actions: { ...idle, errors: { mint: 'Pas assez de points convertibles pour frapper une Meesh.' } } });
    expect(page).toContain('Pas assez de points convertibles');
  });

  test('hors ligne : la frappe se tait', () => {
    expect(fiche('meesh', withGame(), { online: false })).toMatch(/data-game-mint-action=""[^>]*disabled/);
  });

  test('les missions et le coffre, la Flamme à protéger : chacun dans sa fiche', () => {
    expect(fiche('missions', withGame())).toContain('id="game-missions"');
    expect(fiche('flame', withGame())).toContain('id="game-flame-panel"');
  });
});

describe('la ligne de Mee', () => {
  test('la ligne courte du guide tient sur une ligne, et son toucher déplie la carte', () => {
    const line = renderToStaticMarkup(<MeeLine line="Content de te revoir." open={false} onToggle={() => undefined} panelId="guide" />);
    expect(line).toContain('Content de te revoir.');
    expect(line).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="guide"/);
    expect(line).toContain('truncate');
    expect(line).toContain('min-height:44px');
  });

  test('sans guide du moment, Mee propose le carnet des règles', () => {
    const line = renderToStaticMarkup(<MeeLine line={null} open={false} onToggle={() => undefined} panelId="guide" />);
    expect(line).toContain('href="/me/progression/regles"');
    expect(line).not.toContain('<button');
  });
});

describe('un ancien serveur (aucun bloc game)', () => {
  test('ni missions ni frappe du jeu, nulle part', () => {
    expect(hub(base)).not.toContain('id="game-missions"');
    expect(fiche('meesh', base)).not.toContain('id="game-mint"');
    expect(fiche('flame', base)).not.toContain('id="game-flame-panel"');
  });

  test('le barème du niveau d’avant vit dans la fiche du niveau', () => {
    expect(fiche('level', base)).toContain('progression-niveau');
  });

  test('la mascotte d’avant ouvre encore la première page', () => {
    expect(hub(base)).toContain('data-mascot-coach');
  });
});

describe('« Jeu masqué » (#9481)', () => {
  afterEach(() => gamePrefs.set({ hidden: false }));

  test('masqué : une carte qui le dit remplace le jeu, et rien du jeu ne se peint', () => {
    gamePrefs.set({ hidden: true });
    const page = hub(withGame());
    expect(page).toContain('id="game-hidden"');
    expect(page).not.toContain('data-concept-card=');
    expect(page).toContain('href="/me/progression/reglages"');
    expect(fiche('missions', withGame())).not.toContain('id="game-missions"');
  });

  test('la porte vers les réglages du jeu est sur la première page', () => {
    expect(hub(withGame())).toContain('href="/me/progression/reglages"');
  });
});
