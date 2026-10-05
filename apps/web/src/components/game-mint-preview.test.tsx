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
    glory: game.glory,
    treasury: game.treasury,
    levelRecord: game.level.record,
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
 * L'APERÇU DE FRAPPE (#9383) — tout ce que le geste coûte et rapporte, dit
 * AVANT qu'on le fasse : le prix, le niveau avant → après, le trésor, la
 * Gloire et le rang, le numéro et l'édition, les badges qui redescendent, le
 * Vent arrière. La frappe est irréversible ; son aperçu est donc honnête.
 */
describe('une frappe possible', () => {
  const page = text(renderToStaticMarkup(<GameMintPreview {...props()} />));

  test('le numéro et l’édition de la pièce', () => {
    expect(page).toContain('Prochaine Meesh · n° 4');
    expect(page).toContain('argent');
  });

  test('le prix en points', () => {
    expect(page).toContain('1 221 points');
  });

  test('le niveau avant → après, et ce qu’il perd', () => {
    expect(page).toMatch(/Niveau\s+1[0-9] → 1\b/);
  });

  test('le trésor avant → après', () => {
    expect(page).toContain('4 → 5 Meeshes');
  });

  test('la Gloire gagnée', () => {
    expect(page).toContain('+100');
  });

  test('le rang qui ne change pas ne se promet pas', () => {
    expect(page).not.toContain('Écho III →');
  });

  test('le rang qui change se dit, division comprise', () => {
    const crossing = text(renderToStaticMarkup(<GameMintPreview {...props({ glory: 790 })} />));
    expect(crossing).toContain('Écho III → Écho II');
  });

  test('les badges qui redescendent', () => {
    expect(page).toContain('2 badges redescendent');
  });

  test('le Vent arrière qui s’allume', () => {
    expect(page).toContain('Vent arrière');
    expect(page).toContain('+25 %');
  });

  test('un seul bouton, qui nomme Mee et Meo', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props()} />);
    expect(html.match(/data-game-mint-action/g)).toHaveLength(1);
    expect(page).toContain('Frapper avec Mee et Meo');
  });

  test('le toucher frappe', async () => {
    let minted = 0;
    const host = await mount(<GameMintPreview {...props({}, { onMint: () => (minted += 1) })} />);
    await click(host.querySelector('[data-game-mint-action]'));
    expect(minted).toBe(1);
  });

  test('en cours : le bouton s’occupe et ne se laisse pas retoucher', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({}, { minting: true })} />);
    expect(html).toMatch(/data-game-mint-action=""[^>]*disabled/);
    expect(html).toContain('aria-busy="true"');
    expect(text(html)).toContain('Frappe en cours');
  });

  test('hors ligne : la frappe attend la connexion, et le dit', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({}, { online: false })} />);
    expect(html).toMatch(/data-game-mint-action=""[^>]*disabled/);
    expect(text(html)).toContain('Hors ligne');
  });

  test('badges inconnus (serveur sans points par axe) : aucune promesse, ni dans un sens ni dans l’autre', () => {
    const { badgesLost: _lost, ...inconnu } = props();
    const page = text(renderToStaticMarkup(<GameMintPreview {...inconnu} />));
    expect(page).not.toContain('badge');
  });

  test('aucun badge ne tombe : on le dit', () => {
    expect(text(renderToStaticMarkup(<GameMintPreview {...props({}, { badgesLost: 0 })} />))).toContain('Aucun badge ne s’éteint');
  });

  test('un seul badge, au singulier', () => {
    expect(text(renderToStaticMarkup(<GameMintPreview {...props({}, { badgesLost: 1 })} />))).toContain('1 badge redescend');
  });

  test('l’échec se lit sous le bouton', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({}, { error: 'La frappe n’a pas abouti.' })} />);
    expect(html).toContain('role="alert"');
  });
});

describe('une frappe pas encore possible : pas de bouton grisé', () => {
  const poor = props({ score: 600, debitablePoints: 600 });
  const html = renderToStaticMarkup(<GameMintPreview {...poor} />);

  test('aucun bouton', () => {
    expect(html).not.toContain('data-game-mint-action');
  });

  test('ce qu’il manque, et le prix de la prochaine', () => {
    expect(text(html)).toContain('Encore 621 points convertibles');
    expect(text(html)).toContain('1 221 points');
  });

  test('aucun avant → après ne se promet', () => {
    expect(text(html)).not.toContain('→');
  });
});

describe('la dixième Meesh : le prix monte', () => {
  test('la 11e coûte plus, et l’aperçu le dit', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ mintedLifetime: 10, score: 3000, debitablePoints: 3000 })} />));
    expect(page).toContain('n° 11');
    expect(page).toContain('1 294 points');
  });

  test('la centième est en or', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ mintedLifetime: 99, score: 9000, debitablePoints: 9000 })} />));
    expect(page).toContain('n° 100');
    expect(page).toContain('or');
  });
});

describe('après la frappe', () => {
  test('la pièce frappée se dit : numéro, édition, et le lecteur d’écran l’entend', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...props({}, { celebration: { number: 4, edition: 'silver', key: 1 } })} />);
    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Meesh n° 4 frappée');
  });
});
