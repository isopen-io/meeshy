import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS } from '@meeshy/shared/utils/progression-layout';

import { GameProfileOwn } from '@/components/game-profile-own';
import { PlayerBanner } from '@/components/player-banner';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import {
  GAME_CATALOG_PARTS,
  GAME_SCREEN_PARTS,
  loadGameCatalog,
  loadGameCatalogParts,
  loadGameScreenCatalog,
  unloadGameCatalog,
  type GameCatalogPart,
  type GameScreen,
} from '@/lib/i18n-game-catalog';
import { DEFAULT_INTERFACE_LANGUAGE, interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { playerBannerLabel, playerBannerModel } from '@/lib/view/player-banner';
import { ProgressionBody } from '@/routes/progression';
import { ConceptFiche } from '@/routes/progression-concept';
import type { GameActions } from '@/routes/progression-game-actions';
import { RulesBody } from '@/routes/progression-rules';
import { TableauBody } from '@/routes/progression-tableau';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LE CATALOGUE DU JEU EN QUATRE PARTIES (#9542) — le bandeau du joueur est sur
 * tous les hubs, et il téléchargeait les huit cents clés du jeu pour en lire une
 * cinquantaine ; Progression payait le carnet des règles, le carnet payait les
 * fiches. Chaque écran charge désormais SES parties (`GAME_SCREEN_PARTS`).
 *
 * Ce que la coupe peut casser ne se voit ni au typage ni au build : une clé lue
 * par un écran dont la route ne charge pas la partie. Deux témoins la gardent :
 *   · STATIQUE — toute clé `game.*` écrite dans un fichier qu'un écran importe
 *     vit dans une partie que cet écran charge ;
 *   · RENDU — chaque écran se rend, dans les sept langues, avec ses SEULES
 *     parties chargées (une clé hors partie lève, elle ne s'affiche pas nue).
 */

const SRC = resolve(import.meta.dirname, '..');
const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];

const partFile = (part: GameCatalogPart, language: InterfaceLanguage): string =>
  join(SRC, 'lib/interface-catalogs', `catalog-game-${part === 'core' ? '' : `${part}-`}${language}.ts`);

const keysOf = (part: GameCatalogPart, language: InterfaceLanguage): readonly string[] =>
  [...readFileSync(partFile(part, language), 'utf8').matchAll(/^ {2}'([^']+)': /gm)].map((match) => match[1] ?? '');

/** La partie de chaque clé, lue dans les fichiers français (la source des clés). */
const partOfKey = new Map<string, GameCatalogPart>(GAME_CATALOG_PARTS.flatMap((part) => keysOf(part, 'fr').map((key) => [key, part] as const)));

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sourceOf = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const resolveImport = (from: string, specifier: string): string | null => {
  const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
  if (base === null) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((candidate) => existsSync(candidate)) ?? null;
};

/** Les fichiers qu'un écran importe, de proche en proche. Un `import()` différé n'est PAS suivi : il a son propre chargement. */
function reachable(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const match of sourceOf(file).matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/g)) {
      if (/^\s*(?:import|export)\s+type\s/.test(match[0].trim())) continue;
      const target = resolveImport(file, match[1] ?? '');
      if (target !== null && !target.includes('/interface-catalogs/')) queue.push(target);
    }
  }
  return [...seen];
}

/** Les clés `game.*` écrites dans un fichier : les littérales, et celles d'un gabarit (« game.concept.${clé}.name ») par leur préfixe. */
function gameKeysIn(file: string): readonly string[] {
  const source = sourceOf(file);
  const literal = [...source.matchAll(/'(game\.[a-z0-9_.-]+)'/gi)].map((match) => match[1] ?? '');
  const prefixes = [...source.matchAll(/`(game\.[a-z0-9_.-]*)\$\{/gi)].map((match) => match[1] ?? '');
  const all = [...partOfKey.keys()];
  const exact = literal.flatMap((key) => (partOfKey.has(key) ? [key] : all.filter((known) => known.startsWith(`${key}.`))));
  return [...new Set([...exact, ...prefixes.flatMap((prefix) => all.filter((known) => known.startsWith(prefix)))])];
}

/**
 * Le bandeau n'est PAS dans ce parcours : il lit ses clés par des fonctions de
 * fichiers partagés (`game-copy.ts` nomme aussi les missions, les matières…), et
 * un parcours par FICHIER lui prêterait tout le jeu. Sa preuve est le rendu, plus
 * bas : avec sa seule partie chargée, une clé d'une autre partie lèverait.
 */
const ENTRIES: Readonly<Record<Exclude<GameScreen, 'banner'>, readonly string[]>> = {
  profile: ['components/game-profile-connected.tsx'],
  progression: [
    'routes/progression.tsx',
    'routes/progression-concept.tsx',
    'routes/progression-tableau.tsx',
    'routes/progression-ligue.tsx',
    'routes/progression-saison.tsx',
    'routes/progression-vitrine.tsx',
    'routes/progression-atlas.tsx',
    'routes/progression-prestige.tsx',
    'routes/progression-reglages.tsx',
    'routes/progression-badges.tsx',
    'routes/progression-defis.tsx',
    'routes/progression-succes.tsx',
    'routes/progression-carnet.tsx',
  ],
  rules: ['routes/progression-rules.tsx'],
};

describe('la coupe couvre le catalogue, sans trou ni doublon', () => {
  test('chaque clé française vit dans UNE partie', () => {
    const all = GAME_CATALOG_PARTS.flatMap((part) => keysOf(part, 'fr'));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThan(800);
  });

  test('dans chaque langue, chaque partie porte les clés de la partie française (et ses seules formes de pluriel en plus)', () => {
    for (const language of LANGUAGES) {
      for (const part of GAME_CATALOG_PARTS) {
        const french = new Set(keysOf(part, 'fr'));
        const own = keysOf(part, language);
        const missing = [...french].filter((key) => !own.includes(key));
        const foreign = own.filter((key) => !french.has(key) && !/\.(zero|two|few|many)$/.test(key));
        expect({ language, part, missing, foreign }).toEqual({ language, part, missing: [], foreign: [] });
      }
    }
  });

  test('le carnet des règles est seul à porter `game.rules.*`, les fiches seules à porter `game.concept.*`', () => {
    for (const [key, part] of partOfKey) {
      if (key.startsWith('game.rules.')) expect({ key, part }).toEqual({ key, part: 'rules' });
      if (key.startsWith('game.concept.')) expect({ key, part }).toEqual({ key, part: 'concept' });
      if (key.startsWith('game.banner.')) expect({ key, part }).toEqual({ key, part: 'banner' });
    }
  });
});

describe('chaque clé lue par un écran est servie par une partie que sa route charge', () => {
  for (const screen of Object.keys(ENTRIES) as (keyof typeof ENTRIES)[]) {
    for (const entry of ENTRIES[screen]) {
      test(`${entry} (${screen}) ne lit aucune clé hors de ${GAME_SCREEN_PARTS[screen].join(' + ')}`, () => {
        const allowed: readonly GameCatalogPart[] = GAME_SCREEN_PARTS[screen];
        const strays = reachable(join(SRC, entry)).flatMap((file) =>
          gameKeysIn(file)
            .filter((key) => !allowed.includes(partOfKey.get(key) ?? 'core'))
            .map((key) => `${file.slice(SRC.length + 1)} : ${key} (${partOfKey.get(key)})`),
        );
        expect(strays).toEqual([]);
      });
    }
  }

  /**
   * La page des défis n'était dans AUCUNE liste : elle ne lisait pas le catalogue, donc sa route ne le
   * chargeait pas. Le jour où ses paliers ont dit leurs précisions (#9563), elle s'est ouverte sur une
   * page blanche. Un écran de Progression qui n'est pas listé ici échappe à la garde : il doit y être.
   */
  test('chaque écran de Progression est dans la liste', () => {
    const screens = readdirSync(join(SRC, 'routes'))
      .filter((name) => name.startsWith('progression') && name.endsWith('.tsx') && !name.includes('.test.'))
      .filter((name) => /export default function/.test(sourceOf(join(SRC, 'routes', name))))
      .map((name) => `routes/${name}`);
    const listed = [...ENTRIES.progression, ...ENTRIES.rules];
    expect(screens.filter((screen) => !listed.includes(screen))).toEqual([]);
    expect(screens.length).toBeGreaterThanOrEqual(14);
  });

  test('le témoin lit bien des clés : un parcours vide passerait au vert sur n’importe quelle coupe', () => {
    expect(reachable(join(SRC, 'routes/progression.tsx')).flatMap(gameKeysIn).length).toBeGreaterThan(100);
    expect(reachable(join(SRC, 'routes/progression-rules.tsx')).flatMap(gameKeysIn).some((key) => key.startsWith('game.rules.'))).toBe(true);
    expect(reachable(join(SRC, 'components/player-banner.tsx')).flatMap(gameKeysIn).some((key) => key.startsWith('game.banner.'))).toBe(true);
  });

  test('la table des routes charge les parties que l’écran réclame', () => {
    const table = sourceOf(join(SRC, 'routes/route-table.tsx'));
    for (const screen of ['progression', 'rules'] as const) {
      for (const entry of ENTRIES[screen]) {
        const module = entry.replace(/\.tsx$/, '');
        const loaded = new RegExp(`import\\('@/${module}'\\), loadGameScreenCatalog\\(currentInterfaceLanguage\\(\\), '(\\w+)'\\)`).exec(table)?.[1];
        const asked = /suspendForGameCatalog\(currentInterfaceLanguage\(\), '(\w+)'\)/.exec(sourceOf(join(SRC, entry)))?.[1];
        expect({ entry, asked }).toEqual({ entry, asked: screen });
        expect({ entry, loaded }).toEqual({ entry, loaded: screen });
      }
    }
  });
});

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
const game = gameBlockWithExtrasFixture({ balance: 12, streak: 23 });
const playing: EngagementWithGame = { ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game, mintBadgeLoss: 2 };

const NAKED_KEY = />\s*game\.[a-z0-9_.-]+\s*</i;

describe('chaque écran se rend avec ses SEULES parties, dans les sept langues', () => {
  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  });
  afterAll(async () => {
    document.documentElement.lang = DEFAULT_INTERFACE_LANGUAGE;
    document.documentElement.dir = 'ltr';
    unloadGameCatalog();
    await loadGameCatalog(DEFAULT_INTERFACE_LANGUAGE);
    await releaseHappyDomIfRegistered();
  });

  const only = async (language: InterfaceLanguage, screen: GameScreen): Promise<void> => {
    unloadGameCatalog();
    document.documentElement.lang = language;
    document.documentElement.dir = interfaceDirection(language);
    await loadGameScreenCatalog(language, screen);
  };

  const rendered = (html: string): string => {
    expect(NAKED_KEY.test(html)).toBe(false);
    expect(html).not.toMatch(/\{[a-z]+\}/i);
    return html;
  };

  for (const language of LANGUAGES) {
    test(`${language} : le bandeau du joueur, avec la seule partie « banner »`, async () => {
      await only(language, 'banner');
      const model = playerBannerModel(game);
      if (model === null) throw new Error('un bandeau était attendu');
      expect(playerBannerLabel(model, language)).not.toBe('');
      expect(rendered(renderToStaticMarkup(<PlayerBanner model={model} />))).toContain('data-player-banner');
    });

    test(`${language} : la première page, les quinze fiches et le tableau de bord, sans le carnet des règles`, async () => {
      await only(language, 'progression');
      rendered(renderToStaticMarkup(<ProgressionBody progress={playing} now={NOW} />));
      rendered(renderToStaticMarkup(<TableauBody progress={playing} now={NOW} />));
      for (const concept of PROGRESSION_CONCEPTS) {
        rendered(renderToStaticMarkup(<ConceptFiche concept={concept} progress={playing} host={{ actions: idle, online: true }} now={NOW} />));
      }
    });

    test(`${language} : le carnet des règles et son atlas, sans les fiches`, async () => {
      await only(language, 'rules');
      expect(rendered(renderToStaticMarkup(<RulesBody />)).length).toBeGreaterThan(1000);
    });

    test(`${language} : « Mon jeu » sur le profil, sans les fiches ni le carnet`, async () => {
      await only(language, 'profile');
      expect(rendered(renderToStaticMarkup(<GameProfileOwn progress={playing} />)).length).toBeGreaterThan(200);
    });
  }

  test('une clé dont la partie n’est pas chargée LÈVE, elle ne s’affiche jamais nue', async () => {
    await only('fr', 'banner');
    expect(() => renderToStaticMarkup(<RulesBody />)).toThrow(/avant que sa partie/);
    await loadGameCatalogParts('fr', ['core', 'rules']);
    expect(() => renderToStaticMarkup(<RulesBody />)).not.toThrow();
  });

  test('le bandeau ne charge QUE sa partie : ni le jeu entier, ni les fiches, ni les règles', () => {
    expect([...GAME_SCREEN_PARTS.banner]).toEqual(['banner']);
    const banner = sourceOf(join(SRC, 'components/player-banner.tsx'));
    expect(banner).toContain("loadGameScreenCatalog(currentInterfaceLanguage(), 'banner')");
    expect(banner).toContain("suspendForGameCatalog(currentInterfaceLanguage(), 'banner')");
    expect(banner).not.toMatch(/\bloadGameCatalog\(/);
  });
});
