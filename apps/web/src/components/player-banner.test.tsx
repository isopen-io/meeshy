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
import { playerBannerLabel, playerBannerModel, type PlayerBannerModel } from '@/lib/view/player-banner';
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

const NEWCOMER: Partial<GameBlockFacts> = { score: 100, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, freezes: 0, lastActiveDay: null, debitablePoints: 100 };
const ZERO: Partial<GameBlockFacts> = { ...NEWCOMER, score: 0, debitablePoints: 0 };
const modelOf = (game: ReturnType<typeof gameBlockFixture>): PlayerBannerModel => {
  const model = playerBannerModel(game);
  if (model === null) throw new Error('un bandeau était attendu');
  return model;
};
const newcomer = (): PlayerBannerModel => modelOf(gameBlockFixture(NEWCOMER));
const markup = (model: PlayerBannerModel): string => renderToStaticMarkup(<PlayerBanner model={model} />);

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
    ['rank', { ...newcomer(), rank: { rank: 'murmure', division: 3, mythic: null } }],
    ['league', { ...newcomer(), league: { league: 'jade', place: 4 } }],
    ['flame', { ...newcomer(), flame: { form: 'braise', days: 3 } }],
  ];
  for (const [piece, model] of alone) {
    test(`${piece} apparaît seul quand sa donnée existe`, () => {
      expect(piecesIn(markup(model))).toEqual([piece]);
    });
  }

  test('l’ordre est fixe : anneau, jauge, Meeshes, rang, ligue, Flamme', () => {
    const html = markup(modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 })));
    const order = ['ring', 'gauge', ...PIECES].map((piece) => html.indexOf(`data-player-banner-${piece}=`));
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
    expect(host.querySelector('a[data-player-banner]')?.getAttribute('aria-label')).toBe(playerBannerLabel(level1(), 'fr'));
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
  test('UN seul élément lu, nommé d’une phrase complète ; tout le reste est caché au lecteur d’écran', async () => {
    const model = modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }));
    const host = await mount(<PlayerBanner model={model} />);
    const link = host.querySelector('a[data-player-banner]');
    expect(link?.getAttribute('aria-label')).toBe(playerBannerLabel(model, 'fr'));
    for (const child of Array.from(link?.children ?? [])) expect(child.getAttribute('aria-hidden')).toBe('true');
  });

  test('une cible d’au moins 44 px', () => {
    expect(markup(newcomer())).toMatch(/data-player-banner=""[^>]*min-height:(4[4-9]|[5-9]\d)px/);
  });
});

describe('le toucher', () => {
  /* Carte de navigation (#9563, amendement n° 4) : une entrée extérieure ouvre la fiche du concept — l'anneau et sa jauge, la fiche du Niveau. */
  test('un toucher ouvre la fiche du Niveau', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} />);
    const link = host.querySelector<HTMLAnchorElement>('a[data-player-banner]');
    expect(link?.getAttribute('href')).toBe('/me/progression/concept/level');
    await click(link);
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
    level: { level, progress, prestige: 0, nextLevel: level + 1, pointsToNext },
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
  const ordered = (host: ParentNode): readonly string[] =>
    Array.from(host.querySelectorAll('[data-player-banner] > *'))
      .map((child) => (child as HTMLElement).dataset)
      .flatMap((data) => Object.keys(data).filter((key) => /^playerBanner(Ring|Gauge)$/.test(key)));

  test('la jauge passe sous l’anneau : elle prend toute la ligne, après le reste', async () => {
    const m = motion({ largeText: true });
    const host = await mount(<PlayerBanner model={modelOf(gameBlockWithExtrasFixture({ balance: 12, streak: 23 }))} motion={m.value} />);
    const link = host.querySelector('[data-player-banner]');
    expect(link?.getAttribute('data-large-text')).toBe('');
    const gauge = host.querySelector<HTMLElement>('[data-player-banner-gauge]');
    expect(gauge?.className).toContain('basis-full');
    expect(gauge?.style.order).toBe('2');
    expect(ordered(host)).toEqual(['playerBannerRing', 'playerBannerGauge']);
  });

  test('au texte ordinaire : la jauge reste à côté de l’anneau', async () => {
    const host = await mount(<PlayerBanner model={newcomer()} motion={motion().value} />);
    expect(host.querySelector('[data-player-banner]')?.hasAttribute('data-large-text')).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-player-banner-gauge]')?.className).not.toContain('basis-full');
  });
});
