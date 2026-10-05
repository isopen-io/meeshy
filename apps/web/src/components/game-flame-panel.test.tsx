import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameFlamePanel } from './game-flame-panel';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const out = { streak: 9, lastActiveDay: '2026-10-03', broken: { streak: 9, lastActiveDay: '2026-10-03' }, freezes: 0 } as const;

const props = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<Parameters<typeof GameFlamePanel>[0]> = {}) => {
  const game = gameBlockFixture(patch);
  return {
    flame: game.flame,
    held: game.treasury.held,
    online: true,
    buyingFreeze: false,
    relighting: false,
    onBuyFreeze: () => undefined,
    onRelight: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameFlamePanel>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LA FLAMME : GELS ET RALLUMAGE (#9383) — ce qu'on peut faire de ses Meeshes
 * pour la protéger. Conception : jusqu'à deux gels en réserve (1 Meesh
 * chacun), rallumage sous 48 h (3 Meeshes) ; rien d'autre n'est jamais offert.
 */
describe('les gels', () => {
  test('la réserve se compte, et le prix se dit', () => {
    const page = text(renderToStaticMarkup(<GameFlamePanel {...props()} />));
    expect(page).toContain('Gels en réserve : 1 / 2');
    expect(page).toContain('Acheter un gel · 1 Meesh');
  });

  test('le bonus de Flamme s’explique', () => {
    expect(text(renderToStaticMarkup(<GameFlamePanel {...props()} />))).toContain('+2 % par jour de série');
  });

  test('le toucher achète', async () => {
    let bought = 0;
    const host = await mount(<GameFlamePanel {...props({}, { onBuyFreeze: () => (bought += 1) })} />);
    await click(host.querySelector('[data-game-freeze-buy]'));
    expect(bought).toBe(1);
  });

  test('réserve pleine : plus de bouton, la raison est dite', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ freezes: 2 })} />);
    expect(html).not.toContain('data-game-freeze-buy');
    expect(text(html)).toContain('Réserve pleine');
  });

  test('trésor vide : le bouton se tait et dit pourquoi', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ balance: 0 })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
    expect(text(html)).toContain('Il te faut 1 Meesh');
  });

  test('hors ligne : le bouton se tait', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { online: false })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
  });

  test('en cours d’achat : occupé', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { buyingFreeze: true })} />);
    expect(html).toMatch(/data-game-freeze-buy=""[^>]*disabled/);
    expect(html).toContain('aria-busy="true"');
  });

  test('l’échec se lit', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({}, { errors: { freeze: 'Tu as déjà deux gels en réserve : c’est le maximum.' } })} />);
    expect(html).toContain('role="alert"');
  });
});

describe('le rallumage', () => {
  test('une Flamme vivante ne propose pas de rallumage', () => {
    expect(renderToStaticMarkup(<GameFlamePanel {...props()} />)).not.toContain('data-game-relight');
  });

  test('éteinte et rallumable : le bouton, son prix, la série reprise', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 5 })} />);
    expect(html).toContain('data-game-relight=""');
    expect(text(html)).toContain('Rallumer la Flamme · 3 Meesh');
  });

  test('le toucher rallume', async () => {
    let relit = 0;
    const host = await mount(<GameFlamePanel {...props({ ...out, balance: 5 }, { onRelight: () => (relit += 1) })} />);
    await click(host.querySelector('[data-game-relight]'));
    expect(relit).toBe(1);
  });

  test('éteinte sans de quoi payer : pas de bouton (le bloc ne dit pas si la fenêtre est ouverte), le manque est dit', () => {
    const html = renderToStaticMarkup(<GameFlamePanel {...props({ ...out, balance: 1 })} />);
    expect(html).not.toContain('data-game-relight');
    expect(text(html)).toContain('Il te faut 3 Meeshes pour la rallumer');
    expect(text(html)).not.toContain('ne peut plus être rallumée');
  });

  test('éteinte depuis trop longtemps : on dit qu’une nouvelle commence, sans bouton', () => {
    const late = props({ streak: 9, lastActiveDay: '2026-09-20', broken: { streak: 9, lastActiveDay: '2026-09-20' }, freezes: 0, balance: 5 });
    const html = renderToStaticMarkup(<GameFlamePanel {...late} />);
    expect(html).not.toContain('data-game-relight');
    expect(text(html)).toContain('Une nouvelle Flamme commence');
  });
});
