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

const props = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<Parameters<typeof GameMintPreview>[0]> = {}) => {
  const game = gameBlockFixture(patch);
  return {
    mint: game.mint,
    badgesLost: 2,
    online: true,
    minting: false,
    celebration: null,
    onMint: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameMintPreview>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * LE HÉROS DE FRAPPE (#9537) — la SEULE section de frappe, et elle est courte :
 * une ligne de titre, un chiffre fort (le prix), une action ; ce que le geste
 * coûte tient en une ligne de puces. Aucun paragraphe : l'explication vit dans
 * le carnet des règles.
 */
describe('une frappe possible', () => {
  const html = renderToStaticMarkup(<GameMintPreview {...props()} />);
  const page = text(html);

  test('une ligne de titre : le numéro de la prochaine pièce', () => {
    expect(page).toContain('Prochaine Meesh · n° 4');
  });

  test('un chiffre fort : le prix en points', () => {
    expect(html).toMatch(/data-game-mint-price=""[^>]*>1\s221\spoints</);
  });

  test('une action, un seul bouton, qui nomme Mee et Meo', () => {
    expect(html.match(/data-game-mint-action/g)).toHaveLength(1);
    expect(page).toContain('Frapper avec Mee et Meo');
  });

  test('ce que le geste coûte et rapporte tient en puces : niveaux perdus, Gloire, badges', () => {
    const impact = /data-game-mint-impact=""[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
    const lines = Array.from(impact.matchAll(/<li[^>]*>([^<]*)<\/li>/g)).map((m) => m[1]);
    expect(lines.some((line) => /niveaux?/.test(line ?? ''))).toBe(true);
    expect(lines).toContain('+100 Gloire');
    expect(lines).toContain('2 badges redescendent');
  });

  test('aucun paragraphe : ni tableau de lignes, ni phrase d’explication', () => {
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('<p class="text-caption"');
    expect(page).not.toContain('Vent arrière');
    expect(page).not.toContain('→');
  });

  test('Mee et Meo sont sur la scène de frappe', () => {
    expect(html).toContain('data-game-mint-scene');
    expect(html).toContain('data-game-actor="mee"');
    expect(html).toContain('data-game-actor="meo"');
  });

  test('le toucher frappe', async () => {
    let minted = 0;
    const host = await mount(<GameMintPreview {...props({}, { onMint: () => (minted += 1) })} />);
    await click(host.querySelector('[data-game-mint-action]'));
    expect(minted).toBe(1);
  });

  test('en cours : le bouton s’occupe et ne se laisse pas retoucher', () => {
    const busy = renderToStaticMarkup(<GameMintPreview {...props({}, { minting: true })} />);
    expect(busy).toMatch(/data-game-mint-action=""[^>]*disabled/);
    expect(busy).toContain('aria-busy="true"');
    expect(text(busy)).toContain('Frappe en cours');
  });

  test('hors ligne : la frappe attend la connexion, et le dit', () => {
    const offline = renderToStaticMarkup(<GameMintPreview {...props({}, { online: false })} />);
    expect(offline).toMatch(/data-game-mint-action=""[^>]*disabled/);
    expect(text(offline)).toContain('Hors ligne');
  });

  test('badges inconnus (serveur sans points par axe) : aucune promesse, ni dans un sens ni dans l’autre', () => {
    const { badgesLost: _lost, ...inconnu } = props();
    expect(text(renderToStaticMarkup(<GameMintPreview {...inconnu} />))).not.toContain('badge');
  });

  test('aucun badge ne tombe : rien à dire, rien de dit', () => {
    expect(text(renderToStaticMarkup(<GameMintPreview {...props({}, { badgesLost: 0 })} />))).not.toContain('badge');
  });

  test('un seul badge, au singulier', () => {
    expect(text(renderToStaticMarkup(<GameMintPreview {...props({}, { badgesLost: 1 })} />))).toContain('1 badge redescend');
  });

  test('l’échec se lit sous le bouton', () => {
    expect(renderToStaticMarkup(<GameMintPreview {...props({}, { error: 'La frappe n’a pas abouti.' })} />)).toContain('role="alert"');
  });
});

describe('une frappe pas encore possible : pas de bouton grisé', () => {
  const html = renderToStaticMarkup(<GameMintPreview {...props({ score: 600, debitablePoints: 600 })} />);

  test('aucun bouton', () => {
    expect(html).not.toContain('data-game-mint-action');
  });

  test('ce qu’il manque, en une ligne, et le prix de la prochaine', () => {
    expect(text(html)).toContain('Encore 621 points convertibles');
    expect(html).toMatch(/data-game-mint-price=""[^>]*>1\s221\spoints</);
  });

  test('aucune puce de coût ne se promet', () => {
    expect(html).not.toContain('data-game-mint-impact');
  });
});

describe('la dixième Meesh : le prix monte', () => {
  test('la 11e coûte plus, et le héros le dit', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ mintedLifetime: 10, score: 3000, debitablePoints: 3000 })} />));
    expect(page).toContain('n° 11');
    expect(page).toContain('1 294 points');
  });

  test('la centième est en or', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({ mintedLifetime: 99, score: 9000, debitablePoints: 9000 })} />);
    expect(text(html)).toContain('n° 100');
    expect(html).toContain('data-game-edition="gold"');
  });
});

describe('après la frappe', () => {
  test('la pièce frappée se dit : numéro, édition, et le lecteur d’écran l’entend', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({}, { celebration: { number: 4, edition: 'silver', key: 1 } })} />);
    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Meesh n° 4 frappée');
  });
});
