import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ALL_LEVEL_STEPS, GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { GAME_CATALOG_PARTS, loadGameCatalog, type GameCatalogPart } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { meeshCount } from '@/lib/view/game-copy';
import { coinDetail, gemDetail, rankDetail } from '@/lib/view/game-detail';
import { conceptView } from '@/lib/view/progression-concepts';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameMintPreview } from './game-mint-preview';
import { GameRequirementLine, GameSpendLine } from './game-touch';

/**
 * TOUT « IL MANQUE » NOMME SA CIBLE (#10540) — « il te manque 1 839 points » se lisait à côté de
 * « 77 099 points » et de « niveau 27 » : rien ne disait que le manque visait la prochaine Meesh et non
 * le niveau suivant. Aucun libellé ne dit plus « Il manque » seul : le niveau, la Meesh, le rang, la zone
 * de montée ou le geste est dans la phrase.
 */
beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];
const NOW = new Date(`${GAME_EXTRAS_TODAY}T10:00:00.000Z`);
const before = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const wallet = before.meesh;
if (wallet === undefined) throw new Error('la fixture sert un porte-monnaie');

const jcnmGame = gameBlockWithExtrasFixture({ ...ALL_LEVEL_STEPS, score: 77_099, levelRecord: 27, debitablePoints: 5_823, mintedLifetime: 78, balance: 3 });
const jcnm: EngagementWithGame = {
  ...before,
  game: jcnmGame,
  meesh: { ...wallet, balance: 3, mintedLifetime: 78, debitablePoints: 5_823, mintCost: 7_662, missingPoints: 1_839, canMint: false },
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const plain = (value: string): string => value.replace(/\s+/g, ' ');

const partFile = (part: GameCatalogPart, language: InterfaceLanguage): string => `../lib/interface-catalogs/catalog-game-${part === 'core' ? '' : `${part}-`}${language}.ts`;

const catalogOf = async (language: InterfaceLanguage): Promise<Readonly<Record<string, string>>> =>
  Object.assign({}, ...(await Promise.all(GAME_CATALOG_PARTS.map(async (part) => (await import(partFile(part, language))).default as Readonly<Record<string, string>>))));

describe('le catalogue : aucun « Il manque » sans cible', () => {
  test('les libellés nus ont quitté le catalogue', async () => {
    const french = await catalogOf('fr');
    for (const key of ['game.fact.missing', 'game.detail.missing', 'game.fact.to_next']) expect({ key, present: key in french }).toEqual({ key, present: false });
  });

  test('chaque phrase française qui dit « il manque » dit pour quoi', async () => {
    const french = await catalogOf('fr');
    const bare = Object.entries(french)
      .filter(([, value]) => /^Il (te |en )?manque\b/i.test(value))
      .filter(([, value]) => !/\bpour\b/.test(value))
      .map(([key]) => key);
    expect(bare).toEqual([]);
  });

  test('le bandeau dit vers quel niveau va ce qu’il reste, dans les sept langues', async () => {
    for (const language of LANGUAGES) {
      const catalog = await catalogOf(language);
      expect({ language, targeted: (catalog['game.banner.missing'] ?? '').includes('{level}') }).toEqual({ language, targeted: true });
    }
  });
});

describe('les deux soldes ont deux noms stables, dans les sept langues', () => {
  test('« Ta lumière » et « Étincelles » en français (porteur 2026-10-17)', async () => {
    const french = await catalogOf('fr');
    expect(french['game.concept.fact.held']).toBe('Ta lumière');
    expect(french['game.concept.fact.convertible']).toBe('Étincelles');
    expect(french['game.points.convertible.other']).toBe('{count} étincelles');
  });

  test('chaque langue nomme les deux soldes différemment l’un de l’autre', async () => {
    for (const language of LANGUAGES) {
      const catalog = await catalogOf(language);
      const held = catalog['game.concept.fact.held'] ?? '';
      const convertible = catalog['game.concept.fact.convertible'] ?? '';
      expect({ language, named: held !== '' && convertible !== '' && held !== convertible }).toEqual({ language, named: true });
    }
  });
});

describe('le détail des gains par famille ne porte plus de « + »', () => {
  test('« {famille} jusqu’à {points} », dans les sept langues', async () => {
    for (const language of LANGUAGES) {
      const catalog = await catalogOf(language);
      for (const key of ['game.hero.earn_chip', 'game.hero.earn_chip_a11y', 'game.detail.elan.points']) {
        expect({ language, key, plus: (catalog[key] ?? '+').includes('+') }).toEqual({ language, key, plus: false });
      }
    }
    expect((await catalogOf('fr'))['game.hero.earn_chip']).toBe('{family} jusqu’à {points}');
  });

  test('les récompenses de mission, de Gloire et de pourcentage gardent le leur', async () => {
    const french = await catalogOf('fr');
    expect(french['game.mission.glory']).toContain('+');
    expect(french['game.hero.mint_glory']).toContain('+');
    expect(french['game.fmt.signed']).toContain('+');
    expect(french['game.flame.form_line']).toContain('+');
  });
});

describe('les données d’un concept : chaque manque est une ligne qui nomme sa cible', () => {
  const facts = (concept: Parameters<typeof conceptView>[0], view: EngagementWithGame): readonly (readonly [string, string])[] =>
    conceptView(concept, view, NOW).facts.map((fact) => [fact.label, plain(fact.value)] as const);

  test('Points : ce qu’il manque POUR LA MEESH — une seule poche, plus de second solde « à convertir »', () => {
    expect(facts('points', jcnm)).toEqual([['Jusqu’à la Meesh n° 79', '1 839 étincelles']]);
  });

  test('Points : les pastilles disent la Meesh visée', () => {
    expect(conceptView('points', jcnm, NOW).chips.map((chip) => plain(chip.text))).toEqual(['1 839 jusqu’à la Meesh n° 79']);
  });

  test('Niveau : la pastille dit le niveau visé', () => {
    expect(conceptView('level', jcnm, NOW).chips.map((chip) => plain(chip.text))).toContain('1 301 étincelles jusqu’au 28');
  });

  test('Niveau, devant un ancien serveur : la ligne nomme le niveau visé', () => {
    const labels = facts('level', before).map(([label]) => label);
    expect(labels).toContain(`Jusqu’au niveau ${before.level.level + 1}`);
  });

  test('Gloire : ce qu’il manque nomme le rang suivant', () => {
    const labels = facts('glory', jcnm).map(([label]) => label);
    const missing = labels.filter((label) => label.startsWith('Jusqu’à'));
    expect(missing).toHaveLength(1);
    expect(/^Jusqu’à \p{Lu}/u.test(missing[0] ?? '')).toBe(true);
  });

  test('aucune ligne, aucune pastille ne dit « Il manque » ou « encore » sans cible', () => {
    for (const view of [jcnm, before]) {
      for (const concept of ['level', 'points', 'meesh', 'glory', 'league'] as const) {
        const shown = conceptView(concept, view, NOW);
        for (const line of [...shown.facts.map((fact) => fact.label), ...shown.chips.map((chip) => plain(chip.text))]) {
          expect({ concept, line, bare: /^(il manque|encore \d[\d ]*( points?)?)$/i.test(line) }).toEqual({ concept, line, bare: false });
        }
      }
    }
  });
});

describe('les précisions d’un élément', () => {
  test('le blason : ce qu’il manque nomme le rang suivant', () => {
    const labels = rankDetail(jcnmGame.glory).facts.map((fact) => fact.label);
    expect(labels.some((label) => /^Jusqu’à /.test(label))).toBe(true);
    expect(labels).not.toContain('Il manque');
  });

  test('la gemme : ce qu’il manque nomme la zone de montée', () => {
    const league = gameBlockWithExtrasFixture({}, { league: { consented: true, pseudonym: 'Colibri-4821', group: { league: 'jade', groupId: 'g', members: [{ userId: 'user-demo', weekPoints: 10 }, ...Array.from({ length: 29 }, (_, i) => ({ userId: `p-${i}`, weekPoints: 500 - i })) ] }, friendIds: [], friendsWeekPoints: {} } }).league;
    if (league === undefined) throw new Error('la fixture sert la ligue');
    const labels = gemDetail(league).facts.map((fact) => fact.label);
    expect(labels).toContain('Jusqu’à la zone de montée');
  });

  test('la pièce : ce qu’il manque nomme la Meesh et se dit en étincelles', () => {
    const rows = coinDetail(jcnm)?.facts.map((fact) => [fact.label, plain(fact.value)]);
    expect(rows).toContainEqual(['Jusqu’à la Meesh n° 79', '1 839 étincelles']);
  });
});

describe('avant un geste : ce qu’il manque est une phrase, avec son but', () => {
  test('un gel', () => {
    const page = text(renderToStaticMarkup(<GameSpendLine concept="flame" held={0} cost={1} format={meeshCount} missing={{ fact: 'spend_missing', line: (missing) => `Il manque ${missing} pour prendre une Veilleuse.` }} />));
    expect(page).toContain('Il manque 1 Meesh pour prendre une Veilleuse.');
    expect(page).not.toContain('Restera');
  });

  test('un niveau requis', () => {
    expect(text(renderToStaticMarkup(<GameRequirementLine concept="league" current={8} required={10} record />))).toContain('Il manque 2 niveaux pour l’ouvrir.');
  });

  test('la frappe : en poche, le prix — et le manque vise la Meesh, en étincelles, sans solde à convertir', () => {
    const page = text(
      renderToStaticMarkup(
        <GameMintPreview mint={jcnmGame.mint} held={jcnmGame.level.score} online minting={false} celebration={null} onMint={() => undefined} />,
      ),
    );
    expect(page).toContain('Tu as 77 099 étincelles');
    expect(page).not.toContain('À convertir');
    expect(page).toContain('Il faut 7 662 étincelles');
    expect(page).toContain('Il manque 1 839 étincelles à ta lumière pour frapper la Meesh n° 79.');
  });

  test('la frappe : une seule poche, aucun solde « à convertir » n’est plus déduit', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview mint={jcnmGame.mint} held={jcnmGame.level.score} online minting={false} celebration={null} onMint={() => undefined} />));
    expect(page).toContain('Tu as 77 099 étincelles');
    expect(page).not.toContain('À convertir');
    expect(page).not.toContain('5 823');
  });
});
