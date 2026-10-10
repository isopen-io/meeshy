import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameMintPreview } from './game-mint-preview';

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

const props = (earned: number | null, extra: Partial<Parameters<typeof GameMintPreview>[0]> = {}) => {
  const game = gameBlockFixture(earned === null ? {} : { meeshFragments: { earned, spent: 0 } });
  return {
    mint: game.mint,
    held: game.level.score,
    online: true,
    minting: false,
    celebration: null,
    onMint: () => undefined,
    onMintWithFragments: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameMintPreview>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LA FRAPPE GRATUITE (#10011, porteur 2026-10-10) — cinq fragments de Meesh au lieu des points. Le compteur
 * « x / 5 » se lit toujours ; le bouton « Frapper avec 5 fragments » n'apparaît qu'à cinq — jamais grisé.
 */
describe('la frappe par fragments de Meesh', () => {
  test('sous cinq fragments : le compteur, aucun bouton', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props(3)} />);
    expect(text(html)).toContain('3 / 5 fragments de Meesh');
    expect(html).not.toContain('data-game-mint-fragments-action');
  });

  test('à cinq fragments : le bouton « Frapper avec 5 fragments »', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props(6)} />);
    expect(text(html)).toContain('6 / 5 fragments de Meesh');
    expect(html.match(/data-game-mint-fragments-action/g)).toHaveLength(1);
    expect(text(html)).toContain('Frapper avec 5 fragments');
  });

  test('le toucher frappe par fragments, jamais en points', async () => {
    let byFragments = 0;
    let byPoints = 0;
    const host = await mount(
      <GameMintPreview {...props(5, { onMint: () => (byPoints += 1), onMintWithFragments: () => (byFragments += 1) })} />,
    );
    await click(host.querySelector('[data-game-mint-fragments-action]'));
    expect(byFragments).toBe(1);
    expect(byPoints).toBe(0);
  });

  test('hors ligne ou pendant une frappe, le bouton attend', () => {
    expect(renderToStaticMarkup(<GameMintPreview {...props(5, { online: false })} />)).toMatch(/data-game-mint-fragments-action=""[^>]*disabled/);
  });

  test('devant une passerelle antérieure, rien ne change', () => {
    expect(renderToStaticMarkup(<GameMintPreview {...props(null)} />)).not.toContain('data-game-mint-fragments');
  });
});
