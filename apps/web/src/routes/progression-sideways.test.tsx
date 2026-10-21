import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS, progressionConcepts } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { GAME_EXTRAS_TODAY } from '@/lib/api/game-fixture';
import { ENGAGEMENT_LONG_FIXTURE, GAME_LONG_FLAG, gameBlockLongFixture, gameLongArmed } from '@/lib/api/game-fixture-long';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProgressionBody } from './progression';
import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';
import { GeneratedAchievements } from './progression-parts';

const IDLE: GameActions = {
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

/**
 * AUCUNE PAGE NI AUCUNE FICHE DU JEU NE GLISSE DE CÔTÉ (#9563, amendement n° 3 ; étendu à tout le jeu par #11178,
 * épopée § 3.3 : « rien ne glisse de côté, nulle part dans le jeu »).
 *
 * La mesure vraie est celle d'un navigateur (`scripts/check-phone-frame.mjs`,
 * 320 px, sept langues, valeurs longues). Ce témoin garde ce qui la PRODUIT, à
 * la source : aucun conteneur fait pour défiler de côté, le verrou posé sur
 * chaque conteneur qui défile, une rangée qui passe à la ligne ENTRE ses
 * éléments, une pastille qui rétrécit plutôt que d'élargir sa carte.
 */
const SRC = resolve(import.meta.dirname, '..');

const sourcesOf = (dir: string, keep: (name: string) => boolean): readonly string[] =>
  readdirSync(join(SRC, dir))
    .filter((name) => name.endsWith('.tsx') && !name.includes('.test.') && keep(name))
    .map((name) => join(dir, name));

const PROGRESSION_SOURCES = [
  ...sourcesOf('routes', (name) => name.startsWith('progression')),
  ...sourcesOf('components', (name) => name.startsWith('game-') || name.startsWith('progression-') || name === 'player-banner.tsx'),
  ...sourcesOf('components/game', () => true),
];

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (file: string): string => stripComments(readFileSync(join(SRC, file), 'utf8'));

/* Les deux motifs sont ASSEMBLÉS : écrits d'un trait, `check-utilities.mjs` lirait leur classe de caractères comme une classe Tailwind. */
const ATTRIBUTE = 'class' + 'Name=';
const SCROLLER = new RegExp(`${ATTRIBUTE}"([^"]*\\boverflow-y-auto\\b[^"]*)"`, 'g');
const PAGE = new RegExp(`<main id="contenu" ${ATTRIBUTE}"([^"]*)"`, 'g');

describe('aucun conteneur ne défile de côté', () => {
  test('le témoin parcourt les routes de Progression, les pièces du jeu, les fiches et les dessins du jeu', () => {
    expect(PROGRESSION_SOURCES.length).toBeGreaterThan(75);
    expect(PROGRESSION_SOURCES).toContain('routes/progression-parts.tsx');
    expect(PROGRESSION_SOURCES).toContain('routes/progression-concept.tsx');
    expect(PROGRESSION_SOURCES).toContain('components/game-missions.tsx');
    expect(PROGRESSION_SOURCES).toContain('components/game-fiche-heads.tsx');
    expect(PROGRESSION_SOURCES).toContain('components/game/mint-ceremony.tsx');
    expect(PROGRESSION_SOURCES).toContain('components/player-banner.tsx');
  });

  test('aucune classe `overflow-x-auto`, `overflow-x-scroll`, `overflow-auto` ni `overflow-scroll`', () => {
    for (const file of PROGRESSION_SOURCES) {
      const found = read(file).match(/\boverflow-(?:x-)?(?:auto|scroll)\b/g) ?? [];
      expect({ file, found }).toEqual({ file, found: [] });
    }
  });

  test('chaque conteneur qui défile verrouille l’axe horizontal et son surdéfilement', () => {
    const scrollers = PROGRESSION_SOURCES.flatMap((file) =>
      [...read(file).matchAll(SCROLLER)].map((match) => ({ file, classes: match[1] ?? '' })),
    );
    expect(scrollers.length).toBeGreaterThanOrEqual(3);
    expect(scrollers.map((scroller) => scroller.file)).toContain('routes/progression-shell.tsx');
    for (const { file, classes } of scrollers) {
      expect({ file, clip: classes.includes('overflow-x-clip'), overscroll: classes.includes('overscroll-x-none') }).toEqual({ file, clip: true, overscroll: true });
    }
  });

  /**
   * Un mot plus large que la page (« Missionsbelohnungen » sur un texte agrandi) ne dépasse aucune
   * BOÎTE : seul son texte sort, et le verrou le rognerait en silence. `break-words` s'hérite : posé
   * sur la page, il vaut pour tout ce qu'elle contient.
   */
  test('chaque page laisse un mot insécable passer à la ligne plutôt que de le rogner', () => {
    const pages = PROGRESSION_SOURCES.flatMap((file) =>
      [...read(file).matchAll(PAGE)].map((match) => ({ file, classes: match[1] ?? '' })),
    );
    expect(pages.map((page) => page.file)).toEqual(['routes/progression-shell.tsx']);
    for (const { file, classes } of pages) expect({ file, wraps: classes.includes('break-words') }).toEqual({ file, wraps: true });
  });
});

describe('les valeurs longues', () => {
  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  });
  afterAll(async () => {
    localStorage.removeItem(GAME_LONG_FLAG);
    await releaseHappyDomIfRegistered();
  });

  const NOW = new Date(`${GAME_EXTRAS_TODAY}T10:00:00.000Z`);
  const long = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_LONG_FIXTURE), game: gameBlockLongFixture(), mintBadgeLoss: 12 });

  const dom = (markup: string): HTMLElement => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    return host;
  };

  test('la fixture longue sert les quinze concepts, avec ce qu’un vrai compte a de plus large', () => {
    const view = long();
    expect(progressionConcepts(view)).toEqual([...PROGRESSION_CONCEPTS]);
    expect(view.game?.level.level).toBeGreaterThanOrEqual(90);
    expect(view.game?.level.record).toBe(100);
    expect(view.game?.league?.current?.weekPoints).toBeGreaterThan(1_000_000);
    expect(view.game?.flame.days).toBeGreaterThanOrEqual(999);
  });

  test('elle ne se sert que si un gate pose son drapeau', () => {
    expect(gameLongArmed()).toBe(false);
    localStorage.setItem(GAME_LONG_FLAG, '1');
    expect(gameLongArmed()).toBe(true);
    localStorage.removeItem(GAME_LONG_FLAG);
  });

  test('une carte empile son nom, sa valeur et sa ligne : le nom et la ligne passent à la ligne, la valeur se borne à la carte', () => {
    const page = dom(renderToStaticMarkup(<ProgressionBody progress={long()} now={NOW} />));
    const heads = [...page.querySelectorAll('[data-concept-card] [data-concept-head]')];
    expect(heads.length).toBeGreaterThanOrEqual(15);
    for (const row of page.querySelectorAll('[data-progression-row] [data-concept-head]')) expect(row.className).toContain('flex-wrap');
    for (const head of heads) {
      expect(head.className).toContain('flex-col');
      expect(head.className).toContain('min-w-0');
      expect(head.querySelector('[data-concept-name]')?.className).toContain('break-words');
      const value = head.querySelector('[data-concept-value]');
      expect(value?.className).toContain('max-w-full');
      expect(value?.className).toContain('truncate');
      expect(value?.className).not.toContain('shrink-0');
      const line = head.querySelector('[data-concept-line]');
      if (line !== null) {
        expect(line.className).toContain('break-words');
        expect(line.className).not.toContain('whitespace-nowrap');
      }
    }
  });

  const fiches = (): readonly HTMLElement[] =>
    PROGRESSION_CONCEPTS.map((concept) =>
      dom(renderToStaticMarkup(<ConceptFiche concept={concept} progress={long()} host={{ actions: IDLE, online: true }} now={NOW} />)),
    );

  test('sur chaque fiche, un texte qui ne passe pas à la ligne est borné à sa rangée : il rétrécit et se tronque', () => {
    const pages = [dom(renderToStaticMarkup(<ProgressionBody progress={long()} now={NOW} />)), ...fiches()];
    const unbreakable = pages.flatMap((page) => [...page.querySelectorAll('.whitespace-nowrap')]);
    expect(unbreakable.length).toBeGreaterThan(5);
    for (const node of unbreakable) {
      const text = node.textContent ?? '';
      expect({ text, bounded: node.className.includes('max-w-full') || node.closest('.max-w-full') !== null }).toEqual({ text, bounded: true });
    }
  });

  test('la tête de l’Héritage et des Étincelles, et le cadre de la frappe, passent à la ligne sur les valeurs longues', () => {
    const [points, meesh] = (['points', 'meesh'] as const).map((concept) =>
      dom(renderToStaticMarkup(<ConceptFiche concept={concept} progress={long()} host={{ actions: IDLE, online: true }} now={NOW} />)),
    );
    for (const page of [points, meesh]) {
      const head = page?.querySelector('[data-fiche-head]');
      expect(head?.className).toContain('break-words');
      expect(head?.className).toContain('max-w-full');
    }
    expect(meesh?.querySelector('[data-game-mint-band]')?.className).toContain('w-full');
  });

  test('une pastille plus longue que sa rangée rétrécit et se tronque : elle porte `max-w-full` et `truncate`', () => {
    const chips = fiches().flatMap((page) => [...page.querySelectorAll('[data-chip]')]);
    expect(chips.length).toBeGreaterThan(5);
    for (const chip of chips) {
      const text = chip.textContent ?? '';
      expect({ text, bounded: chip.className.includes('max-w-full'), cut: chip.className.includes('truncate') || chip.querySelector('.truncate') !== null }).toEqual({ text, bounded: true, cut: true });
    }
  });

  test('les paliers d’un défi se rangent en grille qui passe à la ligne, plus en carrousel', () => {
    const sections = long().achievementSections ?? [];
    expect(sections.length).toBeGreaterThan(0);
    const page = dom(renderToStaticMarkup(<GeneratedAchievements sections={sections} />));
    const rows = [...page.querySelectorAll('ul')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toContain('grid');
      expect(row.className).not.toContain('overflow-x');
      for (const item of row.querySelectorAll('li')) {
        expect(item.className).toContain('min-w-0');
        expect(item.className).not.toContain('shrink-0');
      }
    }
  });
});
