import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { gamePrefs } from '@/lib/game/preferences';

import { ProgressionBody } from './progression';
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
};

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const withGame = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({ ...base, game: gameBlockFixture(patch), mintBadgeLoss: 2 });

const body = (progress: EngagementWithGame, extra: { online?: boolean; actions?: GameActions } = {}): string =>
  renderToStaticMarkup(
    <ProgressionBody
      progress={progress}
      onMint={() => undefined}
      isMinting={false}
      game={{ actions: extra.actions ?? idle, online: extra.online ?? true }}
    />,
  );

/**
 * L'ÉCRAN PROGRESSION AVEC LE JEU (#9383) — l'en-tête aux trois jauges, les
 * missions et le coffre, l'aperçu de frappe enrichi, la Flamme protégée. Et,
 * contre un ancien serveur, l'écran actuel INTACT.
 */
describe('un serveur qui sert le bloc game', () => {
  const page = body(withGame());
  const position = (needle: string): number => page.indexOf(needle);

  test('le héros ouvre l’écran, puis les deux jauges, avant les missions, l’aperçu et la Flamme', () => {
    const order = ['data-game-hero', 'data-game-gauges', 'id="game-missions"', 'id="game-mint"', 'id="game-flame-panel"'].map(position);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('le niveau à 100 niveaux remplace l’ancien hero à 6 niveaux : deux niveaux contradictoires ne cohabitent pas', () => {
    expect(page).not.toContain('progression-niveau');
    expect(page).toContain('id="game-level"');
  });

  test('la Série d’avant laisse la place à la Flamme du jeu', () => {
    expect(page).not.toContain('progression-flamme');
  });

  test('les portes vers Badges, Défis et Succès restent', () => {
    expect(page).toContain('/me/progression/badges');
    expect(page).toContain('/me/progression/succes');
  });

  test('les élans restent, ils décrivent d’autres choses que le niveau', () => {
    expect(page).toContain('progression-elans');
  });

  test('« Comment ça marche » mène au carnet des règles, d’une cible de 44 points', () => {
    expect(page).toContain('/me/progression/regles');
    expect(page).toContain('Comment ça marche');
    expect(page).toMatch(/<a[^>]*min-height:44px[^>]*>Comment ça marche/);
  });

  test('le carnet de progression est à une porte : « Carnet de progression », d’une cible de 44 points', () => {
    expect(page).toContain('/me/progression/carnet');
    expect(page).toMatch(/<a[^>]*min-height:44px[^>]*>Carnet de progression/);
  });

  test('le guide se pose AU-DESSUS des jauges quand l’hôte en fournit un', () => {
    const withGuide = renderToStaticMarkup(
      <ProgressionBody
        progress={withGame()}
        onMint={() => undefined}
        isMinting={false}
        game={{ actions: idle, online: true, guide: <p data-guide-slot="">Mee</p> }}
      />,
    );
    expect(withGuide.indexOf('data-guide-slot')).toBeGreaterThanOrEqual(0);
    expect(withGuide.indexOf('data-guide-slot')).toBeLessThan(withGuide.indexOf('data-game-hero'));
    expect(withGuide.indexOf('data-game-hero')).toBeLessThan(withGuide.indexOf('data-game-gauges'));
  });

  test('aucune bulle de conversation : la mascotte-bulle cède à la carte du jeu', () => {
    expect(page).not.toContain('data-mascot-coach');
  });
});

describe('les actions se branchent sur les actions du crochet', () => {
  test('une frappe en cours occupe le bouton de l’aperçu', () => {
    const page = body(withGame(), { actions: { ...idle, pending: { ...idle.pending, mint: true } } });
    expect(page).toContain('Frappe en cours');
  });

  test('l’échec de la frappe se lit dans l’aperçu', () => {
    const page = body(withGame(), { actions: { ...idle, errors: { mint: 'Pas assez de points convertibles pour frapper une Meesh.' } } });
    expect(page).toContain('Pas assez de points convertibles');
  });

  test('hors ligne : les gestes d’argent se taisent, au héros comme à l’aperçu', () => {
    const page = body(withGame(), { online: false });
    expect(page).toMatch(/data-game-mint-action=""[^>]*disabled/);
    expect(page).toMatch(/data-game-hero-mint=""[^>]*disabled/);
  });

  test('la frappe en cours occupe aussi le bouton du héros', () => {
    expect(body(withGame(), { actions: { ...idle, pending: { ...idle.pending, mint: true } } })).toMatch(/data-game-hero-mint=""[^>]*aria-busy="true"/);
  });

  test('la ligne du guide arrive au héros, dite par Mee', () => {
    const page = renderToStaticMarkup(
      <ProgressionBody
        progress={withGame()}
        onMint={() => undefined}
        isMinting={false}
        game={{ actions: idle, online: true, guideLine: 'Content de te revoir.' }}
      />,
    );
    expect(page).toContain('Content de te revoir.');
  });
});

describe('un ancien serveur (aucun bloc game) : l’écran actuel est intact', () => {
  const legacy = body(base);

  test('ni jauges, ni missions du jeu', () => {
    expect(legacy).not.toContain('data-game-gauges');
    expect(legacy).not.toContain('id="game-missions"');
  });

  test('le hero du niveau, la Flamme d’avant et la porte des succès sont là', () => {
    expect(legacy).toContain('progression-niveau');
    expect(legacy).toContain('progression-flamme');
    expect(legacy).toContain('/me/progression/succes');
  });

  test('la mascotte actuelle parle encore', () => {
    expect(legacy).toContain('data-mascot-coach');
  });
});

describe('la vague 2 sur le hub (#9481)', () => {
  test('un serveur qui sert les extensions : les portes se posent avant les règles', () => {
    const page = body({ ...base, game: gameBlockWithExtrasFixture() });
    expect(page).toContain('data-game-doors');
    expect(page.indexOf('data-game-doors')).toBeLessThan(page.lastIndexOf('/me/progression/regles'));
  });

  test('un ancien serveur : aucune porte de plus', () => {
    expect(body(withGame())).not.toContain('data-game-doors');
  });
});

describe('« Jeu masqué » sur le hub (#9481)', () => {
  afterEach(() => gamePrefs.set({ hidden: false }));

  test('masqué : une carte qui le dit remplace tout le jeu, et rien du reste du jeu ne se peint', () => {
    gamePrefs.set({ hidden: true });
    const page = body(withGame());
    expect(page).toContain('id="game-hidden"');
    expect(page).not.toContain('data-game-hero');
    expect(page).not.toContain('id="game-missions"');
    expect(page).not.toContain('id="game-flame-panel"');
  });

  test('la porte vers les réglages du jeu est sur le hub', () => {
    expect(body(withGame())).toContain('href="/me/progression/reglages"');
  });
});
