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
import { GeneratedAchievements } from './progression-parts';
import { TableauBody } from './progression-tableau';

/**
 * AUCUNE PAGE DE « PROGRESSION » NE GLISSE DE CÔTÉ (#9563, amendement n° 3).
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
  ...sourcesOf('components', (name) => name.startsWith('game-') || name.startsWith('progression-')),
];

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (file: string): string => stripComments(readFileSync(join(SRC, file), 'utf8'));

describe('aucun conteneur ne défile de côté', () => {
  test('le témoin parcourt bien les routes de Progression et les pièces du jeu', () => {
    expect(PROGRESSION_SOURCES.length).toBeGreaterThan(40);
    expect(PROGRESSION_SOURCES).toContain('routes/progression-parts.tsx');
    expect(PROGRESSION_SOURCES).toContain('components/game-missions.tsx');
  });

  test('aucune classe `overflow-x-auto`, `overflow-x-scroll`, `overflow-auto` ni `overflow-scroll`', () => {
    for (const file of PROGRESSION_SOURCES) {
      const found = read(file).match(/\boverflow-(?:x-)?(?:auto|scroll)\b/g) ?? [];
      expect({ file, found }).toEqual({ file, found: [] });
    }
  });

  test('chaque conteneur qui défile verrouille l’axe horizontal et son surdéfilement', () => {
    const scrollers = PROGRESSION_SOURCES.flatMap((file) =>
      [...read(file).matchAll(/className="([^"]*\boverflow-y-auto\b[^"]*)"/g)].map((match) => ({ file, classes: match[1] ?? '' })),
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
      [...read(file).matchAll(/<main id="contenu" className="([^"]*)"/g)].map((match) => ({ file, classes: match[1] ?? '' })),
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

  test('le nom et la valeur d’une carte passent à la ligne ENTRE eux : ni nom écrasé lettre à lettre, ni valeur poussée hors de la carte', () => {
    const page = dom(renderToStaticMarkup(<ProgressionBody progress={long()} now={NOW} />));
    const heads = [...page.querySelectorAll('[data-concept-head]')];
    expect(heads.length).toBeGreaterThanOrEqual(15);
    for (const head of heads) {
      expect(head.className).toContain('flex-wrap');
      expect(head.className).toContain('min-w-0');
      const value = head.querySelector('[data-concept-value]');
      if (value !== null) {
        expect(value.className).toContain('max-w-full');
        expect(value.className).toContain('truncate');
        expect(value.className).not.toContain('shrink-0');
      }
    }
  });

  test('une pastille plus longue que sa rangée rétrécit et se tronque : elle porte `max-w-full` et `truncate`', () => {
    const pages = [
      renderToStaticMarkup(<ProgressionBody progress={long()} now={NOW} />),
      renderToStaticMarkup(<TableauBody progress={long()} now={NOW} />),
    ].map(dom);
    const chips = pages.flatMap((page) => [...page.querySelectorAll('[data-chip]')]);
    expect(chips.length).toBeGreaterThan(20);
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
