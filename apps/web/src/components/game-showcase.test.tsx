import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameTrophiesBlock } from '@meeshy/shared/types/game';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameShowcase, shelfOrder, type GameShowcaseProps } from './game-showcase';
import { GameTrophyShelf } from './game-trophy-shelf';
import { GameVisibilityPicker } from './game-visibility-picker';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/vitrine' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const trophies = (): GameTrophiesBlock => {
  const block = gameBlockWithExtrasFixture().trophies;
  if (block === undefined) throw new Error('la fixture porte les trophées');
  return block;
};

const props = (patch: Partial<GameShowcaseProps> = {}): GameShowcaseProps => ({
  trophies: trophies(),
  visibility: 'friends',
  online: true,
  savingOrder: false,
  savingVisibility: false,
  errors: {},
  onOrder: () => undefined,
  onVisibility: () => undefined,
  ...patch,
});

/**
 * LA VITRINE (#9387) — les trophées dans l’ordre servi, rangés d’un cran à la
 * fois, et le choix de qui les voit. Un trophée ne rapporte rien : aucun mot de
 * points ni de Gloire n’y paraît.
 */
describe('la vitrine', () => {
  const html = renderToStaticMarkup(<GameShowcase {...props()} />);

  test('un trophée par clé, chacun avec son titre et sa date d’obtention', () => {
    expect((html.match(/data-game-trophy="trophy/g) ?? []).length).toBe(3);
    const t = text(html);
    expect(t).toContain('Coupe d’or — ligue Ambre, semaine du 19 octobre');
    expect(t).toContain('Trophée de Flamme, 100 jours');
    expect(t).toMatch(/Obtenu le \d+ octobre 2026/);
  });

  test('l’ordre servi est celui de l’écran : le plus précieux d’abord', () => {
    const order = trophies().order;
    const titles = [...html.matchAll(/data-game-trophy="(trophy[^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual([...order]);
  });

  test('un trophée ne rapporte rien : aucun mot de points ni de Gloire', () => {
    expect(text(html)).not.toMatch(/point|gloire/i);
  });

  test('chaque coupe se range : monter, descendre — la première ne monte pas, la dernière ne descend pas', () => {
    const buttons = [...html.matchAll(/<button[^>]*data-game-trophy-(up|down)[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(6);
    expect(buttons[0]).toContain('disabled=""');
    expect(buttons[5]).toContain('disabled=""');
    expect(buttons[1]).not.toContain('disabled=""');
  });

  test('descendre la première coupe envoie le nouvel ordre', async () => {
    const calls: Array<readonly string[]> = [];
    const host = await mount(<GameShowcase {...props({ onOrder: (order) => calls.push(order) })} />);
    await click(host.querySelector('[data-game-trophy-down]'));
    const [first, second, third] = trophies().order;
    expect(calls).toEqual([[second, first, third]]);
  });

  test('hors ligne : on ne range pas, et on le dit', async () => {
    const host = await mount(<GameShowcase {...props({ online: false })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-trophy-down]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });

  test('une vitrine vide se dit, sans rangement ni étagère', () => {
    const html = renderToStaticMarkup(<GameShowcase {...props({ trophies: { items: [], order: [] } })} />);
    expect(text(html)).toContain('Ta vitrine est vide');
    expect(html).not.toContain('data-game-trophy-shelf');
  });

  test('un trophée d’une version plus récente (clé inconnue) ne se montre pas', () => {
    const base = trophies();
    const future = { items: [...base.items, { key: 'trophy.cometa.9', awardedAt: '2026-11-01T00:00:00.000Z' }], order: [...base.order, 'trophy.cometa.9'] };
    expect((renderToStaticMarkup(<GameShowcase {...props({ trophies: future })} />).match(/data-game-trophy="trophy/g) ?? []).length).toBe(3);
  });
});

describe('shelfOrder', () => {
  test('les clés rangées d’abord, ce que l’ordre ne cite pas ensuite, jamais un doublon ni une clé absente', () => {
    const items = [
      { key: 'a', awardedAt: '2026-01-01T00:00:00.000Z' },
      { key: 'b', awardedAt: '2026-01-01T00:00:00.000Z' },
      { key: 'c', awardedAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(shelfOrder({ items, order: ['c', 'zzz', 'c', 'a'] })).toEqual(['c', 'a', 'b']);
  });
});

describe('qui voit', () => {
  test('trois niveaux, celui du bloc servi coché', () => {
    const html = renderToStaticMarkup(<GameShowcase {...props({ visibility: 'me' })} />);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect(html).toContain('checked="" value="me"');
    expect(text(html)).toContain('Moi seul');
    expect(text(html)).toContain('jamais la date exacte');
  });

  test('choisir un autre niveau envoie ce niveau', async () => {
    const chosen: string[] = [];
    const host = await mount(<GameShowcase {...props({ onVisibility: (level) => chosen.push(level) })} />);
    await click(host.querySelector('input[value="me"]'));
    expect(chosen).toEqual(['me']);
  });

  test('en cours d’enregistrement : le choix est suspendu et le dit', async () => {
    const host = await mount(<GameShowcase {...props({ savingVisibility: true })} />);
    expect(host.querySelector<HTMLInputElement>('input[value="me"]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Enregistrement');
  });

  test('le sélecteur seul : sa légende nomme ce qu’il règle', () => {
    expect(text(renderToStaticMarkup(<GameVisibilityPicker legend="Trésor et Flamme" value="friends" disabled={false} onChange={() => undefined} />))).toContain('Trésor et Flamme');
  });
});

describe('l’étagère', () => {
  test('lecture seule : aucun bouton quand l’hôte ne passe pas de contrôles', () => {
    const html = renderToStaticMarkup(
      <GameTrophyShelf entries={[{ key: 'k', view: { kind: 'flame', title: 'Trophée de Flamme, 365 jours', plate: '365 JOURS' }, caption: 'Obtenu en octobre 2026' }]} />,
    );
    expect(html).not.toContain('<button');
    expect(html).toContain('aria-hidden="true"');
  });
});
