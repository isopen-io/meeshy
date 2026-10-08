import { standingLabel, shownRank } from '@/lib/view/game-copy';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS } from '@meeshy/shared/utils/progression-layout';

import { GameDetailHost } from '@/components/game-detail-sheet';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { GAME_DETAIL_FAMILIES, GAME_DETAIL_HOW, type GameDetailFamily } from '@/lib/game/detail-families';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { detailStore } from '@/lib/view/detail-store';
import {
  badgeDetail,
  chestDetail,
  coinDetail,
  defiDetail,
  elanDetail,
  flameDetail,
  freezeDetail,
  gemDetail,
  missionDetail,
  playerDetail,
  rankDetail,
  ringDetail,
  sealDetail,
  stampDetail,
  starDetail,
  stepDetail,
  succesDetail,
  treasuryDetail,
  trophyDetail,
  type ElementDetail,
} from '@/lib/view/game-detail';
import { conceptView, ficheView } from '@/lib/view/progression-concepts';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameAtlas } from '@/components/game-atlas';
import { LeagueStandings } from '@/components/game-league';
import { GamePrestige } from '@/components/game-prestige';
import { GameSeason } from '@/components/game-season';
import { GameShowcase } from '@/components/game-showcase';

import { ConceptFiche } from './progression-concept';
import type { GameActions } from './progression-game-actions';
import { ProgressionHeaderGroup } from './progression-header-group';
import { ProgressionShell } from './progression-shell';
import { AchievementsSection, AxisRow, GeneratedAchievements } from './progression-parts';
import { ProgressionBody } from './progression';

/**
 * TOUT ÉLÉMENT SE TOUCHE (#9563, amendement n° 2) — un rebond, puis une modale
 * avec les précisions de CET élément. Ce témoin garde les trois choses que le
 * porteur a demandées et qu'aucun typage ne tient :
 *   · chaque famille d'élément a son modèle de précisions (une fonction pure) ;
 *   · chaque élément rendu sur une fiche ou au tableau de bord est un BOUTON qui
 *     ouvre la modale de SON élément, et la modale rend le focus à ce bouton ;
 *   · l'en-tête de la première page porte le blason et le compteur de Meeshes
 *     quand ils sont servis, rien sinon — et aucune page ne monte d'en-tête statique.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];
const SRC = resolve(import.meta.dirname, '..');
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  act(() => detailStore.close());
  mounter.unmountAll();
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
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
const before = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const playing: EngagementWithGame = { ...before, game: gameBlockWithExtrasFixture(), mintBadgeLoss: 2 };

const must = <T,>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`fixture incomplète : ${what}`);
  return value;
};

/** Un exemple par famille, bâti sur la fixture : c'est la table que « chaque famille a son modèle » parcourt. */
const samples = (): Readonly<Record<GameDetailFamily, ElementDetail>> => {
  const game = must(playing.game, 'game');
  const season = must(game.season, 'season');
  const league = must(game.league, 'league');
  const prestige = must(game.prestige, 'prestige');
  const trophies = must(game.trophies, 'trophies');
  const atlas = must(game.atlas, 'atlas');
  return {
    badge: badgeDetail(must(playing.axes[0], 'axes')),
    succes: succesDetail(must(playing.achievements[0], 'achievements'), game.achievementRarities),
    defi: defiDetail(must((playing.achievementSections ?? [])[0]?.entries[0], 'défis')),
    trophy: must(trophyDetail(must(trophies.items[0], 'trophées')), 'trophée lisible'),
    stamp: stampDetail(must(atlas.stamps[0], 'tampons')),
    step: stepDetail(season, 1),
    seal: sealDetail(season),
    gem: gemDetail(league),
    star: starDetail(prestige, 1),
    rank: rankDetail(game.glory),
    flame: flameDetail(game.flame),
    freeze: freezeDetail(game.flame),
    mission: missionDetail(must(game.missions.items[0], 'missions')),
    chest: chestDetail(game.chest),
    coin: must(coinDetail(playing), 'pièce'),
    ring: ringDetail(game.level),
    treasury: treasuryDetail(game.treasury),
    elan: elanDetail('content', playing.elan),
  };
};

describe('chaque famille d’élément a son modèle de précisions', () => {
  for (const family of GAME_DETAIL_FAMILIES) {
    test(`${family} : un nom, un état, ce que c’est, et « ${GAME_DETAIL_HOW[family] === 'obtain' ? 'comment l’obtenir' : 'ce que ça donne'} »`, () => {
      const detail = samples()[family];
      expect(detail.family).toBe(family);
      expect(detail.id.startsWith(`${family}:`)).toBe(true);
      expect(detail.name.trim()).not.toBe('');
      expect(detail.state.line.trim()).not.toBe('');
      expect(detail.what.trim()).not.toBe('');
      expect(detail.how?.label).toBe(GAME_DETAIL_HOW[family]);
      expect(detail.how?.text.trim()).not.toBe('');
      expect(detail.concept).not.toBeNull();
      expect(JSON.stringify(detail)).not.toMatch(/undefined|NaN|\{[a-z]+\}/);
    });
  }

  test('dans les sept langues, aucun modèle ne rend une clé nue ni un paramètre resté en clair', () => {
    for (const language of LANGUAGES) {
      document.documentElement.lang = language;
      document.documentElement.dir = interfaceDirection(language);
      for (const detail of Object.values(samples())) {
        expect({ language, id: detail.id, clean: !/game\.[a-z_.]+|\{[a-z]+\}/.test(JSON.stringify({ ...detail, id: '' })) }).toEqual({ language, id: detail.id, clean: true });
      }
    }
  });

  test('ce que la passerelle ne sert pas ne s’affiche pas : sans date servie, « Obtenu » sans date ; sans rareté, aucune rareté', () => {
    const succes = must(playing.achievements.find((achievement) => achievement.unlocked), 'succès décroché');
    expect(succesDetail({ ...succes, reachedAt: null }).state).toEqual({ kind: 'earned', line: 'Obtenu' });
    expect(succesDetail(succes).rarity).toBeNull();
    expect(succesDetail(succes).state.line).toMatch(/^Obtenu le /);
  });

  test('un élément verrouillé dit ce qu’il manque et sa jauge quand ils sont servis', () => {
    const off = must(playing.axes.find((axis) => axis.reachedCount === 0 && axis.nextThreshold !== null), 'badge éteint');
    const state = badgeDetail(off).state;
    expect(state.kind).toBe('locked');
    if (state.kind === 'locked') {
      expect(state.missing).toMatch(/^Il manque /);
      expect(state.gauge).not.toBeNull();
    }
  });

  test('une ligne du classement ne dit rien de plus que la page : pseudonyme, place, points, zone', () => {
    const detail = playerDetail({ rank: 3, displayName: 'Colibri-4821', weekPoints: 410, zone: 'promotion', cup: null }, 'jade');
    expect(detail.concept).toBeNull();
    expect(detail.name).toBe('Colibri-4821');
    expect(JSON.stringify(detail)).not.toMatch(/online|lastActive|présen|userId/i);
  });
});

const tree = (progress: EngagementWithGame, page: React.ReactNode, fiche?: Parameters<typeof GameDetailHost>[0]['fiche']) => (
  <>
    {page}
    <GameDetailHost progress={progress} {...(fiche === undefined ? {} : { fiche })} />
  </>
);

const dialogOf = (): HTMLDialogElement | null => document.querySelector('dialog[data-game-detail]');

describe('chaque élément d’une fiche est un bouton qui ouvre la modale de SON élément', () => {
  for (const concept of PROGRESSION_CONCEPTS) {
    test(`${concept} : l’emblème du héros, chaque pastille et chaque ligne de donnée s’ouvrent`, async () => {
      const host = await mounter.mount(tree(playing, <ConceptFiche concept={concept} progress={playing} host={{ actions: idle, online: true }} now={NOW} />, concept));
      const view = conceptView(concept, playing, NOW);
      const touches = [...host.querySelectorAll<HTMLButtonElement>('[data-concept-fiche] button[data-detail]')];
      /* Le héros générique : son emblème s'ouvre. Une pièce de jeu qui tient lieu de héros (amendement n° 4) garde ses propres touchers. */
      if (host.querySelector('[data-fiche-hero="generic"]') !== null) expect(host.querySelector('[data-fiche-section="hero"] button[data-detail]')).not.toBeNull();
      /* « Où j'en suis » liste ce que le héros ne montre pas (règle 3) : chacune de ses lignes est un toucher de plus. */
      expect(touches.length).toBeGreaterThanOrEqual(ficheView(concept, playing, NOW).facts.length);
      expect(view.name).not.toBe('');
      for (const button of touches) {
        expect(button.className).toContain('game-press');
        await mounter.click(button);
        const dialog = dialogOf();
        expect({ id: button.dataset.detail, open: dialog !== null }).toEqual({ id: button.dataset.detail, open: true });
        expect(dialog?.dataset.gameDetail).toBe(button.dataset.detail);
        expect(dialog?.querySelector('h2')?.textContent).toBe(button.dataset.detailName);
        expect(button.dataset.detailName?.trim()).not.toBe('');
        await mounter.click(dialog?.querySelector<HTMLButtonElement>('button[data-sheet-close]') ?? null);
        expect(dialogOf()).toBeNull();
      }
    });
  }

  test('sur la fiche du concept, la modale ne propose pas « Voir la fiche » ; ailleurs, si', async () => {
    const onFiche = await mounter.mount(tree(playing, <ConceptFiche concept="flame" progress={playing} host={{ actions: idle, online: true }} now={NOW} />, 'flame'));
    await mounter.click(onFiche.querySelector<HTMLButtonElement>('[data-fiche-section="where"] button[data-detail]'));
    expect(dialogOf()?.querySelector('a[data-detail-fiche]')).toBeNull();
    await mounter.click(dialogOf()?.querySelector<HTMLButtonElement>('button[data-sheet-close]') ?? null);
    mounter.unmountAll();

    const header = await mounter.mount(tree(playing, <ProgressionHeaderGroup progress={playing} />));
    await mounter.click(header.querySelector<HTMLButtonElement>('[data-header-item="rank"]'));
    expect(dialogOf()?.querySelector('a[data-detail-fiche]')?.getAttribute('href')).toBe('/me/progression/concept/glory');
  });
});

/** Touche chaque élément d'un rendu et vérifie que la modale qui s'ouvre porte SON nom ; rend le nombre d'éléments touchés. */
const sweep = async (host: HTMLElement): Promise<number> => {
  const touches = [...host.querySelectorAll<HTMLButtonElement>('button[data-detail]')];
  for (const button of touches) {
    expect(button.className).toContain('game-press');
    await mounter.click(button);
    const dialog = dialogOf();
    expect({ id: button.dataset.detail, title: dialog?.querySelector('h2')?.textContent }).toEqual({ id: button.dataset.detail, title: button.dataset.detailName });
    await mounter.click(dialog?.querySelector<HTMLButtonElement>('button[data-sheet-close]') ?? null);
  }
  return touches.length;
};

describe('les sous-pages : chaque élément se touche et ouvre SES précisions', () => {
  const game = must(playing.game, 'game');
  const noop = (): void => undefined;

  test('badges : une ligne par axe, chacune un bouton', async () => {
    const host = await mounter.mount(tree(playing, <ul>{playing.axes.map((axis) => <AxisRow key={axis.axisKey} axis={axis} />)}</ul>));
    expect(await sweep(host)).toBe(playing.axes.length);
    expect(host.querySelector<HTMLButtonElement>('button[data-detail]')?.dataset.detail).toMatch(/^badge:/);
  });

  test('succès : chaque succès, décroché ou non', async () => {
    const host = await mounter.mount(tree(playing, <AchievementsSection progress={playing} rarities={game.achievementRarities} />));
    expect(await sweep(host)).toBe(playing.achievements.length);
  });

  test('défis : chaque palier', async () => {
    const sections = playing.achievementSections ?? [];
    const host = await mounter.mount(tree(playing, <GeneratedAchievements sections={sections} />));
    expect(await sweep(host)).toBe(sections.reduce((sum, section) => sum + section.entries.length, 0));
  });

  test('vitrine : chaque trophée', async () => {
    const trophies = must(game.trophies, 'trophées');
    const host = await mounter.mount(
      tree(playing, <GameShowcase trophies={trophies} visibility="friends" online savingOrder={false} savingVisibility={false} errors={{}} onOrder={noop} onVisibility={noop} />),
    );
    expect(await sweep(host)).toBe(trophies.items.length);
  });

  test('Atlas : chaque tampon posé et chaque échange à moitié fait', async () => {
    const atlas = must(game.atlas, 'atlas');
    const host = await mounter.mount(tree(playing, <GameAtlas atlas={atlas} visibility="me" online savingVisibility={false} onVisibility={noop} />));
    expect(await sweep(host)).toBe(atlas.stamps.length + atlas.pending.length);
  });

  test('saison : chaque étape réclamée ou à venir, et chaque sceau ; une étape prête garde son geste', async () => {
    const season = must(game.season, 'saison');
    const claimed: number[] = [];
    const host = await mounter.mount(
      tree(playing, <GameSeason season={season} held={4} online claimingStep={null} buyingSeal={false} errors={{}} onClaim={(step) => claimed.push(step)} onBuySeal={noop} />),
    );
    const ready = [...host.querySelectorAll<HTMLButtonElement>('[data-game-season-state="ready"]')];
    const others = host.querySelectorAll('[data-game-season-step][data-detail]').length;
    expect(ready.length).toBeGreaterThan(0);
    expect(others + ready.length).toBe(host.querySelectorAll('[data-game-season-step]').length);
    expect(ready.every((button) => !button.hasAttribute('data-detail'))).toBe(true);
    await mounter.click(must(ready[0], 'étape prête'));
    expect(claimed).toHaveLength(1);
    expect(dialogOf()).toBeNull();
    expect(await sweep(host)).toBeGreaterThan(others);
  });

  test('ligue : la ligne d’un joueur ouvre ce que la page dit déjà, rien de plus', async () => {
    const entries = [
      { rank: 1, displayName: 'Colibri-4821', weekPoints: 520, zone: 'promotion', cup: 'gold', isMe: false },
      { rank: 2, displayName: 'Toi', weekPoints: 410, zone: 'safe', cup: null, isMe: true },
    ] as const;
    const host = await mounter.mount(tree(playing, <LeagueStandings entries={entries} league="jade" />));
    expect(await sweep(host)).toBe(2);
    await mounter.click(host.querySelector<HTMLButtonElement>('button[data-detail]'));
    const text = dialogOf()?.textContent ?? '';
    expect(text).toContain('Colibri-4821');
    expect(text).not.toMatch(/en ligne|vu il y a|actif/i);
    expect(dialogOf()?.querySelector('a[data-detail-fiche]')).toBeNull();
  });

  test('Prestige : les étoiles', async () => {
    const host = await mounter.mount(
      tree(playing, <GamePrestige level={game.level} prestige={must(game.prestige, 'prestige')} online pending={false} onPass={noop} createEnv={() => ({ reducedMotion: true }) as never} />),
    );
    expect(await sweep(host)).toBeGreaterThanOrEqual(1);
    expect(host.querySelector<HTMLButtonElement>('button[data-detail]')?.dataset.detail).toMatch(/^star:/);
  });
});

describe('la modale', () => {
  /* Un VRAI `<dialog>` ouvert par `showModal()` (focus piégé, Échap, fond inerte) — jamais un `<div role="dialog" aria-modal>`, qui annonce une modale sans en être une (`auth-screens.test.tsx`). */
  test('c’est un `<dialog>` modal nommé par son titre ; elle dit l’état, ce que c’est, comment l’obtenir', async () => {
    const host = await mounter.mount(tree(playing, <ConceptFiche concept="glory" progress={playing} host={{ actions: idle, online: true }} now={NOW} />, 'glory'));
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-fiche-section="hero"] button[data-detail]'));
    const dialog = must(dialogOf(), 'modale');
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.open).toBe(true);
    expect(dialog.hasAttribute('role')).toBe(false);
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id);
    expect(dialog.dataset.sheetPresentation).toBe('bottom');
    expect(dialog.querySelector('[data-detail-emblem]')?.className).toContain('game-pop');
    expect(dialog.querySelector('[data-detail-state]')?.textContent).toContain('Gloire');
    expect(dialog.querySelector('[data-detail-what]')?.textContent).toContain('Ton blason montre ton rang');
    expect(dialog.querySelector('[data-detail-how]')?.textContent).toContain('Comment l’obtenir');
  });

  test('fermée, elle rend le focus à l’élément touché', async () => {
    const host = await mounter.mount(tree(playing, <ConceptFiche concept="flame" progress={playing} host={{ actions: idle, online: true }} now={NOW} />, 'flame'));
    const button = must(host.querySelector<HTMLButtonElement>('[data-fiche-section="where"] button[data-detail]'), 'ligne de donnée');
    button.focus();
    await mounter.click(button);
    expect(dialogOf()).not.toBeNull();
    await mounter.click(dialogOf()?.querySelector<HTMLButtonElement>('button[data-sheet-close]') ?? null);
    expect(dialogOf()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  test('un toucher en dehors la ferme', async () => {
    const host = await mounter.mount(tree(playing, <ConceptFiche concept="flame" progress={playing} host={{ actions: idle, online: true }} now={NOW} />, 'flame'));
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-fiche-section="where"] button[data-detail]'));
    await mounter.click(dialogOf());
    expect(dialogOf()).toBeNull();
  });
});

describe('la première page : une carte reste UN lien, ses pastilles ne s’ouvrent pas', () => {
  test('aucun bouton dans les cartes ; chaque carte rebondit', () => {
    const page = document.createElement('div');
    page.innerHTML = renderToStaticMarkup(<ProgressionBody progress={playing} now={NOW} />);
    const cards = [...page.querySelectorAll('[data-concept-card]')];
    expect(cards).toHaveLength(PROGRESSION_CONCEPTS.length);
    for (const card of cards) {
      expect(card.tagName).toBe('A');
      expect(card.querySelector('button')).toBeNull();
      expect(card.className).toContain('game-press');
    }
  });
});

describe('l’en-tête de la première page', () => {
  test('servis : UN groupe, le blason du rang puis le nombre de Meeshes avec sa pièce, chacun rebondit', () => {
    const group = document.createElement('div');
    group.innerHTML = renderToStaticMarkup(<ProgressionHeaderGroup progress={playing} />);
    const surface = must(group.querySelector('[data-progression-header-group]'), 'groupe');
    expect(group.querySelectorAll('[data-progression-header-group]')).toHaveLength(1);
    const items = [...surface.querySelectorAll<HTMLElement>('[data-header-item]')];
    expect(items.map((item) => item.dataset.headerItem)).toEqual(['rank', 'meesh']);
    for (const item of items) expect(item.className).toContain('game-press');
    expect(surface.querySelector('[data-header-item="meesh"]')?.textContent).toContain(String(playing.meesh?.balance));
    expect(surface.querySelector('[data-header-item="rank"]')?.getAttribute('aria-label')).toContain(standingLabel(shownRank(must(playing.game, 'game').glory), 'fr'));
  });

  test('rien si la donnée n’est pas servie : ni blason sans le jeu, ni compteur sans solde, ni groupe vide', () => {
    const { meesh: _meesh, ...sansSolde } = before;
    expect(renderToStaticMarkup(<ProgressionHeaderGroup progress={sansSolde} />)).toBe('');
    const avecSolde = renderToStaticMarkup(<ProgressionHeaderGroup progress={before} />);
    expect(avecSolde).toContain('data-header-item="meesh"');
    expect(avecSolde).not.toContain('data-header-item="rank"');
  });

  /* Carte de navigation (#9563, amendement n° 4) : la frappe a UN site, la fiche des Meeshes ; la feuille de frappe de l'en-tête la redoublait. */
  test('le blason ouvre la modale du rang ; le compteur ouvre la fiche des Meeshes, seul site de la frappe', async () => {
    const host = await mounter.mount(tree(playing, <ProgressionHeaderGroup progress={playing} />));
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-header-item="rank"]'));
    expect(dialogOf()?.dataset.gameDetail).toMatch(/^rank:/);
    await mounter.click(dialogOf()?.querySelector<HTMLButtonElement>('button[data-sheet-close]') ?? null);

    const counter = must(host.querySelector<HTMLAnchorElement>('[data-header-item="meesh"]'), 'compteur');
    expect(counter.tagName).toBe('A');
    expect(counter.getAttribute('href')).toBe('/me/progression/concept/meesh');
    expect(host.querySelector('[data-meesh-mint]')).toBeNull();
  });
});

describe('aucune page de Progression ne monte d’en-tête statique', () => {
  const routes = readdirSync(join(SRC, 'routes')).filter((name) => name.startsWith('progression') && name.endsWith('.tsx') && !name.includes('.test.'));
  const read = (name: string): string => readFileSync(join(SRC, 'routes', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  test('aucune route n’écrit son `<header>` ni son `<main id="contenu">` : elles passent par la coquille partagée', () => {
    expect(routes.length).toBeGreaterThan(15);
    for (const name of routes.filter((route) => route !== 'progression-shell.tsx')) {
      const source = read(name);
      expect({ name, header: /<header\b/.test(source), main: /<main\b/.test(source) }).toEqual({ name, header: false, main: false });
    }
  });

  test('la coquille pose l’en-tête qui se réduit DANS le conteneur qui défile : le contenu passe dessous', () => {
    const shell = read('progression-shell.tsx');
    expect(shell).toContain('<CollapsingHeader');
    expect(shell.indexOf('<main')).toBeLessThan(shell.indexOf('<CollapsingHeader'));
    expect(shell.indexOf('<CollapsingHeader')).toBeLessThan(shell.indexOf('</main>'));
  });

  test('au défilement, la barre devient compacte par UN attribut posé hors de React — aucun rendu à la cadence du défilement', async () => {
    let renders = 0;
    const Counted = () => {
      renders += 1;
      return <p>contenu</p>;
    };
    const host = await mounter.mount(
      <ProgressionShell title="Progression" screen={{ kind: 'root' }}>
        <Counted />
      </ProgressionShell>,
    );
    const main = must(host.querySelector<HTMLElement>('main#contenu'), 'conteneur');
    const bar = must(host.querySelector<HTMLElement>('[data-collapsing-bar]'), 'barre');
    expect(bar.parentElement).toBe(main);
    expect(host.querySelector('h1')?.textContent).toBe('Progression');
    expect(bar.querySelector('.collapsing-bar-title')?.getAttribute('aria-hidden')).toBe('true');
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    const before = renders;

    main.scrollTop = 120;
    main.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    main.scrollTop = 0;
    main.dispatchEvent(new Event('scroll'));
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    expect(renders).toBe(before);
  });

  test('le retour est un disque de verre de 44 points, qui rebondit', async () => {
    const host = await mounter.mount(
      <ProgressionShell title="Ligue" screen={{ kind: 'subpage', route: 'progressionLigue', concept: 'league' }}>
        <p>contenu</p>
      </ProgressionShell>,
    );
    const back = must(host.querySelector<HTMLAnchorElement>('a[data-page-back]'), 'retour');
    expect(back.getAttribute('href')).toBe('/me/progression/concept/league');
    expect(back.className).toContain('game-press');
    expect(back.className).toContain('size-11');
    expect(back.querySelector('.glass')).not.toBeNull();
  });

  test('chaque écran de Progression rend la coquille', () => {
    const screens = routes.filter((name) => /export default function/.test(read(name)));
    expect(screens.length).toBeGreaterThanOrEqual(13);
    for (const name of screens) {
      expect({ name, shell: /<ProgressionShell\b|<ProgressionPage\b/.test(read(name)) }).toEqual({ name, shell: true });
    }
    expect(read('progression-page.tsx')).toContain('<ProgressionShell');
  });
});
