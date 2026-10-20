import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameBlockFacts } from '@meeshy/shared/utils/game/game-block';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { GameGl } from '@/lib/game/gl/engine';
import { ROLL_MS } from '@/lib/game/rolling';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { playerBannerLabel, playerBannerModel, type PlayerBannerModel, type PlayerBannerRank } from '@/lib/view/player-banner';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PlayerBanner, type BannerMotion } from './player-banner';

/**
 * LA BANNIÈRE DU JOUEUR (#9494) — dans le bandeau du haut quand rien ne joue.
 * Seulement ce qui existe, dans un ordre fixe ; UN seul élément lu, nommé
 * d'une phrase complète ; un toucher ouvre Progression.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, rerender, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
afterEach(unmountAll);
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NEWCOMER: Partial<GameBlockFacts> = { score: 1000, levelRecord: null, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, freezes: 0, lastActiveDay: null, debitablePoints: 1000 };
const ZERO: Partial<GameBlockFacts> = { ...NEWCOMER, score: 0, debitablePoints: 0 };
const modelOf = (game: ReturnType<typeof gameBlockFixture>): PlayerBannerModel => {
  const model = playerBannerModel(game);
  if (model === null) throw new Error('un bandeau était attendu');
  return model;
};
const newcomer = (): PlayerBannerModel => modelOf(gameBlockFixture(NEWCOMER));
const markup = (model: PlayerBannerModel): string => renderToStaticMarkup(<PlayerBanner model={model} />);
/** Conteur III à 3 400 Gloire, encore 1 200 vers Conteur II — l'exemple du porteur (#11125). */
const conteur = (patch: Partial<PlayerBannerRank> = {}): PlayerBannerRank => ({
  rank: 'conteur',
  division: 3,
  mythic: null,
  glory: 3400,
  progress: 0.4,
  gloryMissing: 1200,
  next: { rank: 'conteur', division: 2 },
  ...patch,
});

const PIECES = ['meeshes', 'rank', 'league', 'flame'] as const;
const piecesIn = (html: string): readonly string[] => PIECES.filter((piece) => html.includes(`data-player-banner-${piece}=`));

describe('seulement ce qui existe', () => {
  test('un nouveau joueur ne voit que son anneau et sa jauge', () => {
    const html = markup(newcomer());
    expect(html).toContain('data-player-banner-ring=');
    expect(html).toContain('data-player-banner-gauge=');
    expect(piecesIn(html)).toEqual([]);
  });

  test('ni zéro, ni tiret, ni case vide chez le nouveau joueur', () => {
    const visible = markup(newcomer()).replace(/<[^>]+>/g, ' ');
    expect(visible).not.toMatch(/(^|\s)[0O](\s|$)|—|–|(^|\s)-(\s|$)/);
  });

  const alone: ReadonlyArray<readonly [(typeof PIECES)[number], PlayerBannerModel]> = [
    ['meeshes', { ...newcomer(), meeshes: 1 }],
    ['rank', { ...newcomer(), rank: conteur() }],
    ['league', { ...newcomer(), league: { league: 'jade', place: 4 } }],
    ['flame', { ...newcomer(), flame: { form: 'braise', days: 3 } }],
  ];
  for (const [piece, model] of alone) {
    test(`${piece} apparaît seul quand sa donnée existe`, () => {
      expect(piecesIn(markup(model))).toEqual([piece]);
    });
  }

  test('l’ordre est fixe : anneau, jauge, puis le milieu — Flamme, Meeshes, mission, ligue — et le rang au bout (#11125)', () => {
    const html = markup(modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 })));
    const order = ['ring', 'gauge', 'flame', 'meeshes', 'missions', 'league', 'rank'].map((piece) => html.indexOf(`data-player-banner-${piece}=`));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('la jauge dit les points et ce qu’il manque ; au sommet, plus rien ne manque', () => {
    const model = newcomer();
    expect(markup(model)).toContain('data-player-banner-missing=');
    expect(markup({ ...model, level: model.level === null ? null : { ...model.level, nextLevel: null, pointsToNext: null, progress: 1 } })).not.toContain('data-player-banner-missing=');
  });
});

describe('seulement ce qui a du sens (#9536)', () => {
  const level1 = (): PlayerBannerModel => modelOf(gameBlockFixture({ ...ZERO, score: 12, debitablePoints: 12 }));

  test('niveau 1 : ni anneau ni jauge, seulement le total de points', () => {
    const html = markup(level1());
    expect(html).not.toContain('data-player-banner-ring=');
    expect(html).not.toContain('data-player-banner-gauge=');
    expect(html).toContain('data-player-banner-points="12"');
    expect(piecesIn(html)).toEqual([]);
  });

  test('niveau 2 et plus : l’anneau et la jauge, pas de pièce « points » à part', () => {
    const html = markup(newcomer());
    expect(html).toContain('data-player-banner-ring=');
    expect(html).toContain('data-player-banner-gauge=');
    expect(html).not.toContain('data-player-banner-points=');
  });

  test('une Flamme seule : ni anneau, ni jauge, ni points', () => {
    const html = markup({ ...level1(), points: null, flame: { form: 'braise', days: 3 } });
    expect(html).not.toContain('data-player-banner-ring=');
    expect(html).not.toContain('data-player-banner-gauge=');
    expect(html).not.toContain('data-player-banner-points=');
    expect(piecesIn(html)).toEqual(['flame']);
  });

  test('toujours une phrase lue, y compris au niveau 1', async () => {
    const host = await mount(<PlayerBanner model={level1()} />);
    expect(host.querySelector('[data-player-banner]')?.getAttribute('aria-label')).toBe(playerBannerLabel(level1(), 'fr'));
  });
});

describe('la bannière de profil en translucide (#9536)', () => {
  test('sans bannière de profil : aucun fond image', () => {
    expect(markup(newcomer())).not.toContain('data-player-banner-backdrop');
  });

  test('avec la bannière de profil : l’image est posée SOUS les informations, translucide, cachée au lecteur d’écran', () => {
    const html = renderToStaticMarkup(<PlayerBanner model={newcomer()} backdrop="https://cdn.example/banner.jpg" />);
    expect(html).toMatch(/<img data-player-banner-backdrop="" src="https:\/\/cdn.example\/banner.jpg" alt="" aria-hidden="true"/);
    expect(html).toMatch(/data-player-banner-backdrop[^>]*-z-10/);
    expect(html).toMatch(/data-player-banner-backdrop[^>]*opacity:0\.[1-7]/);
    expect(html.indexOf('data-player-banner-backdrop')).toBeLessThan(html.indexOf('data-player-banner-ring='));
  });
});

describe('le décor', () => {
  test('la teinte du palier naît derrière l’anneau, du côté où la ligne commence — à droite en arabe', () => {
    const html = markup(newcomer());
    expect(html).toMatch(/data-player-banner=""[^>]*background:linear-gradient\(var\(--player-banner-sweep, 100deg\)/);
    const css = readFileSync(new URL('../styles/player-banner.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[dir='rtl'\] \.player-banner \{\s*--player-banner-sweep: 260deg;/);
  });

  test('la Signature en filigrane, teintée par la couleur du palier', () => {
    const html = markup(newcomer());
    expect(html).toMatch(/data-player-banner-watermark=""[^>]*style="[^"]*color:var\(--game-tier-etincelle\)/);
  });
});

describe('accessible', () => {
  test('le conteneur est un GROUPE nommé d\'une phrase complète — jamais un lien, des liens ne s\'imbriquent pas', async () => {
    const model = modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    const host = await mount(<PlayerBanner model={model} />);
    const group = host.querySelector('[data-player-banner]');
    expect(group?.tagName).toBe('DIV');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe(playerBannerLabel(model, 'fr'));
    expect(host.querySelectorAll('a a').length).toBe(0);
  });

  test('chaque pièce est UN lien nommé ; ses enfants sont cachés au lecteur d\'écran', async () => {
    const model = modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    const host = await mount(<PlayerBanner model={model} />);
    const links = Array.from(host.querySelectorAll('a[data-player-banner-link]'));
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      expect((link.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      for (const child of Array.from(link.children)) expect(child.getAttribute('aria-hidden')).toBe('true');
    }
  });

  test('une cible d’au moins 44 px (bandeau 48 : anneau, jauge, rang) ; les pièces du milieu font 24, sur deux lignes', async () => {
    expect(markup(newcomer())).toMatch(/data-player-banner=""[^>]*min-height:(4[4-9]|[5-9]\d)px/);
    const host = await mount(<PlayerBanner model={modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }))} motion={motion().value} />);
    const direct = Array.from(host.querySelectorAll('[data-player-banner] > a[data-player-banner-link]'));
    expect(direct.map((link) => (link as HTMLElement).dataset.playerBannerLink)).toEqual(['level', 'points', 'glory']);
    for (const link of direct) expect(link.getAttribute('style') ?? '').toMatch(/min-height:\s*(4[4-9]|[5-9]\d)px/);
    const rows = Array.from(host.querySelectorAll('[data-player-banner-middle] > [data-player-banner-row]')).map((row) =>
      Array.from(row.querySelectorAll('a[data-player-banner-link]')).map((link) => (link as HTMLElement).dataset.playerBannerLink),
    );
    expect(rows).toEqual([
      ['flame', 'meesh'],
      ['missions', 'league'],
    ]);
    for (const link of Array.from(host.querySelectorAll('[data-player-banner-middle] a[data-player-banner-link]'))) expect(link.getAttribute('style') ?? '').toMatch(/min-height:\s*24px/);
  });
});

describe('le toucher : chaque pièce ouvre SA fiche (porteur 2026-10-16)', () => {
  /* Carte de navigation (#9563, amendement n° 4) : une entrée extérieure ouvre la fiche du concept. */
  const hrefOf = (host: ParentNode, concept: string): string | null => host.querySelector(`a[data-player-banner-link="${concept}"]`)?.getAttribute('href') ?? null;

  test('l\'anneau ouvre le Niveau, la jauge et ses étincelles le concept des étincelles (points)', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} />);
    expect(hrefOf(host, 'level')).toBe('/me/progression/concept/level');
    expect(hrefOf(host, 'points')).toBe('/me/progression/concept/points');
  });

  test('Meeshes → meesh, rang → glory, ligue → league, Flamme → flame', async () => {
    const model: PlayerBannerModel = {
      ...newcomer(),
      meeshes: 3,
      rank: conteur(),
      league: { league: 'jade', place: 4 },
      flame: { form: 'braise', days: 3 },
    };
    const host = await mount(<PlayerBanner model={model} />);
    expect(hrefOf(host, 'meesh')).toBe('/me/progression/concept/meesh');
    expect(hrefOf(host, 'glory')).toBe('/me/progression/concept/glory');
    expect(hrefOf(host, 'league')).toBe('/me/progression/concept/league');
    expect(hrefOf(host, 'flame')).toBe('/me/progression/concept/flame');
  });

  test('les trophées → showcase, la mission du jour → missions, la saison → season, avec un nom accessible par pièce', async () => {
    const model: PlayerBannerModel = { ...newcomer(), trophies: 2, missions: { done: 1, total: 3 }, season: { stars: 25 } };
    const host = await mount(<PlayerBanner model={model} motion={motion({ largeText: true }).value} />);
    expect(hrefOf(host, 'showcase')).toBe('/me/progression/concept/showcase');
    expect(hrefOf(host, 'missions')).toBe('/me/progression/concept/missions');
    expect(hrefOf(host, 'season')).toBe('/me/progression/concept/season');
    expect(host.querySelector('a[data-player-banner-link="showcase"]')?.getAttribute('aria-label')).toBe('Trophées : 2');
    expect(host.querySelector('a[data-player-banner-link="missions"]')?.getAttribute('aria-label')).toBe('Missions du jour : 1 sur 3');
    expect(host.querySelector('a[data-player-banner-link="season"]')?.getAttribute('aria-label')).toBe('Saison : 25 étoiles');
  });

  test('une pièce absente n\'a pas de lien', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} />);
    for (const concept of ['meesh', 'glory', 'league', 'flame', 'showcase', 'missions', 'season']) expect(hrefOf(host, concept)).toBeNull();
  });

  test('un toucher sur l\'anneau ouvre la fiche du Niveau', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} />);
    await click(host.querySelector('a[data-player-banner-link="level"]'));
    expect(window.location.pathname).toBe('/me/progression/concept/level');
  });
});

/**
 * LE MOUVEMENT DE LA BANNIÈRE (#9494, XIII.1) — « un gain de points fait
 * rouler le chiffre et avancer la jauge, avec le reflet au passage d'un
 * niveau ». À la première peinture RIEN ne bouge (cache d'abord) ; le reflet
 * paraît UNE fois, au gain d'un niveau seulement, et ne paraît jamais quand
 * l'utilisateur limite les animations.
 */
const motion = (patch: Partial<BannerMotion> = {}) => {
  const frames: { readonly id: number; readonly run: (t: number) => void }[] = [];
  const timers: { readonly run: () => void; readonly ms: number; cancelled: boolean }[] = [];
  const stats = { created: 0, disposed: 0 };
  const gl: GameGl = { programCount: 3, render: () => undefined, clear: () => undefined, resize: () => undefined, dispose: () => void (stats.disposed += 1) };
  const effectEnv: EffectEnv = {
    reducedMotion: false,
    createGl: () => {
      stats.created += 1;
      return gl;
    },
    raf: () => 0,
    cancelRaf: () => undefined,
    observeVisibility: () => () => undefined,
    observeOrientation: () => null,
  };
  let next = 1;
  const value: BannerMotion = {
    reducedMotion: false,
    largeText: false,
    roll: {
      reducedMotion: () => false,
      raf: (run) => {
        const id = next++;
        frames.push({ id, run });
        return id;
      },
      cancelRaf: () => undefined,
    },
    createEnv: () => effectEnv,
    schedule: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => void (timer.cancelled = true);
    },
    ...patch,
  };
  const frame = (t: number): void => {
    const batch = frames.splice(0);
    act(() => batch.forEach((job) => job.run(t)));
  };
  const fire = (): void => act(() => timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.run()));
  return { value, frame, fire, stats };
};

const gaugeText = (host: ParentNode): string => host.querySelector('[data-player-banner-gauge]')?.textContent ?? '';
const glint = (host: ParentNode): Element | null => host.querySelector('[data-player-banner-ring] canvas[data-game-effect="sheen"]');

describe('le chiffre qui roule et le reflet d’un niveau', () => {
  const at = (level: number, score: number, progress: number, pointsToNext: number): PlayerBannerModel => ({
    ...newcomer(),
    points: score,
    level: { level, progress, prestige: 0, nextLevel: level + 1, pointsToNext, opener: null },
  });
  const before = (): PlayerBannerModel => at(4, 400, 0.9, 40);

  test('à la première peinture : le chiffre est à sa valeur, aucun reflet, aucun contexte WebGL', async () => {
    const m = motion();
    const host = await mount(<PlayerBanner model={before()} motion={m.value} />);
    expect(gaugeText(host)).toContain('400');
    expect(glint(host)).toBeNull();
    expect(m.stats.created).toBe(0);
  });

  test('un gain de points sans changer de niveau : le chiffre roule, pas de reflet', async () => {
    const m = motion();
    const host = await mount(<PlayerBanner model={before()} motion={m.value} />);
    await rerender(host, <PlayerBanner model={at(4, 430, 0.97, 10)} motion={m.value} />);
    m.frame(0);
    m.frame(ROLL_MS / 2);
    const middle = Number(/(\d+)/.exec(gaugeText(host).replace(/\s/g, ''))?.[1]);
    expect(middle).toBeGreaterThan(400);
    expect(middle).toBeLessThan(430);
    m.frame(ROLL_MS + 5);
    expect(gaugeText(host)).toContain('430');
    expect(glint(host)).toBeNull();
  });

  test('un niveau gagné : le reflet paraît une fois, puis le canvas est retiré et le contexte libéré', async () => {
    const m = motion();
    const host = await mount(<PlayerBanner model={before()} motion={m.value} />);
    await rerender(host, <PlayerBanner model={at(5, 440, 0.05, 190)} motion={m.value} />);
    expect(glint(host)).not.toBeNull();
    expect(m.stats.created).toBe(1);
    m.fire();
    await rerender(host, <PlayerBanner model={at(5, 440, 0.05, 190)} motion={m.value} />);
    expect(glint(host)).toBeNull();
    expect(m.stats.disposed).toBe(1);
  });

  test('un niveau perdu (un Prestige) : pas de reflet', async () => {
    const m = motion();
    const host = await mount(<PlayerBanner model={at(100, 440, 0.5, 190)} motion={m.value} />);
    await rerender(host, <PlayerBanner model={at(1, 0, 0, 40)} motion={m.value} />);
    expect(glint(host)).toBeNull();
  });

  test('animations réduites : le chiffre saute et le reflet ne paraît pas', async () => {
    const m = motion({ reducedMotion: true, roll: { reducedMotion: () => true, raf: () => 0, cancelRaf: () => undefined } });
    const host = await mount(<PlayerBanner model={before()} motion={m.value} />);
    await rerender(host, <PlayerBanner model={at(5, 440, 0.05, 190)} motion={m.value} />);
    expect(gaugeText(host)).toContain('440');
    expect(glint(host)).toBeNull();
    expect(m.stats.created).toBe(0);
  });
});

describe('aux très grandes tailles de texte', () => {
  /** L'ordre des liens de la rangée : l'anneau (Niveau), puis la jauge (Étincelles). */
  const ordered = (host: ParentNode): readonly string[] =>
    Array.from(host.querySelectorAll('[data-player-banner] > a[data-player-banner-link]'))
      .map((link) => (link as HTMLElement).dataset.playerBannerLink ?? '')
      .filter((concept) => concept === 'level' || concept === 'points');

  test('la jauge passe sous l’anneau : elle prend toute la ligne, après le reste', async () => {
    const m = motion({ largeText: true });
    const host = await mount(<PlayerBanner model={modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }))} motion={m.value} />);
    const link = host.querySelector('[data-player-banner]');
    expect(link?.getAttribute('data-large-text')).toBe('');
    const gauge = host.querySelector<HTMLElement>('[data-player-banner-gauge]');
    // Le LIEN de la jauge — l'élément posé dans la rangée — prend toute la ligne et passe en second.
    const gaugeLink = host.querySelector<HTMLElement>('a[data-player-banner-link="points"]');
    expect(gaugeLink?.className).toContain('basis-full');
    expect(gaugeLink?.style.order).toBe('2');
    expect(gauge?.className).toContain('basis-full');
    expect(ordered(host)).toEqual(['level', 'points']);
  });

  test('au texte ordinaire : la jauge reste à côté de l’anneau', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} motion={motion().value} />);
    expect(host.querySelector('[data-player-banner]')?.hasAttribute('data-large-text')).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-player-banner-gauge]')?.className).not.toContain('basis-full');
  });
});

/**
 * LE RANG AU BOUT DE LA RANGÉE (#11125, porteur 2026-10-20) — le blason et le nom du rang au-dessus d'une jauge de Gloire,
 * et dessous ce qui manque pour le rang suivant, comme la jauge du niveau. Sans suite, la Gloire seule.
 */
describe('le rang, sa jauge de Gloire et ce qui manque', () => {
  const rankBlock = (host: ParentNode): HTMLElement | null => host.querySelector<HTMLElement>('a[data-player-banner-link="glory"] [data-player-banner-rank-gauge]');

  test('le nom du rang, la jauge de la division et « encore 1 200 vers Conteur II »', async () => {
    const host = await mount(<PlayerBanner model={{ ...newcomer(), rank: conteur() }} motion={motion().value} />);
    const block = rankBlock(host);
    expect(block?.querySelector('[data-player-banner-rank-name]')?.textContent).toBe('Conteur III');
    expect(block?.querySelector<HTMLElement>('[data-player-banner-rank-fill]')?.style.transform).toBe('scaleX(0.400)');
    expect(block?.querySelector('[data-player-banner-rank-missing]')?.textContent?.replace(/[\s\u202f]/g, ' ')).toBe('encore 1 200 vers Conteur II');
    expect(block?.querySelector('[data-player-banner-rank-total]')).toBeNull();
  });

  test('le lien du rang est nommé de son nom, de sa Gloire et de ce qui manque', async () => {
    const host = await mount(<PlayerBanner model={{ ...newcomer(), rank: conteur() }} motion={motion().value} />);
    expect(host.querySelector('a[data-player-banner-link="glory"]')?.getAttribute('aria-label')?.replace(/[\s\u202f]/g, ' ')).toBe('Conteur III, 3 400 Gloire, encore 1 200 vers Conteur II');
  });

  test('au Mythe (pas de suite) : le nom et le total de Gloire, ni jauge ni « encore »', async () => {
    const mythe = conteur({ rank: 'mythe', division: null, mythic: { number: 18, edition: 22 }, glory: 1_000_000, progress: 1, gloryMissing: null, next: null });
    const host = await mount(<PlayerBanner model={{ ...newcomer(), rank: mythe }} motion={motion().value} />);
    const block = rankBlock(host);
    expect(block?.querySelector('[data-player-banner-rank-name]')?.textContent).toBe('Mythe n° 18');
    expect(block?.querySelector('[data-player-banner-rank-total]')?.textContent?.replace(/[\s\u202f]/g, ' ')).toBe('1 000 000 Gloire');
    expect(block?.querySelector('[data-player-banner-rank-fill]')).toBeNull();
    expect(block?.querySelector('[data-player-banner-rank-missing]')).toBeNull();
  });

  test('trophées et saison quittent la rangée compacte ; ils restent dans la disposition grand texte', async () => {
    const model: PlayerBannerModel = { ...newcomer(), rank: conteur(), trophies: 2, season: { stars: 25 } };
    const compact = await mount(<PlayerBanner model={model} motion={motion().value} />);
    expect(compact.querySelector('a[data-player-banner-link="showcase"]')).toBeNull();
    expect(compact.querySelector('a[data-player-banner-link="season"]')).toBeNull();
    expect(compact.querySelector('[data-player-banner]')?.getAttribute('aria-label')).toBe(playerBannerLabel(model, 'fr'));
    const large = await mount(<PlayerBanner model={model} motion={motion({ largeText: true }).value} />);
    expect(large.querySelector('a[data-player-banner-link="showcase"]')).not.toBeNull();
    expect(large.querySelector('a[data-player-banner-link="season"]')).not.toBeNull();
    expect(large.querySelector('[data-player-banner]')?.getAttribute('aria-label')).toBe(playerBannerLabel(model, 'fr', 'large'));
  });
});
