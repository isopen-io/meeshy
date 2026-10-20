import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { mintLevels } from '@/lib/game/ladder';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameMintPreview } from './game-mint-preview';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { formatCount } from '@/lib/view/game-copy';

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
    held: game.level.score,
    online: true,
    minting: false,
    celebration: null,
    onMint: () => undefined,
    ...extra,
  } satisfies Parameters<typeof GameMintPreview>[0];
};

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const impactLines = (html: string): readonly (string | undefined)[] => {
  const impact = /data-game-mint-impact=""[^>]*>([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
  return Array.from(impact.matchAll(/<li[^>]*>([^<]*)<\/li>/g)).map((m) => m[1]);
};

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

  test('un chiffre fort : le prix en étincelles', () => {
    expect(html).toMatch(/data-game-mint-price=""[^>]*>1\s221\sétincelles</);
  });

  test('une action, un seul bouton, qui nomme Mee et Meo', () => {
    expect(html.match(/data-game-mint-action/g)).toHaveLength(1);
    expect(page).toContain('Frapper avec Mee et Meo');
  });

  test('ce que le geste rapporte et coûte tient en puces : la Gloire, puis le niveau d’après (#10892) — jamais de badge', () => {
    const sparks = { pocket: 40_000, cycle: 90_000, lifetime: 250_000, debt: 0 };
    const spending = renderToStaticMarkup(<GameMintPreview {...props({ score: sparks.pocket, debitablePoints: sparks.pocket, sparks })} />);
    const levels = mintLevels(gameBlockFixture({ score: sparks.pocket, debitablePoints: sparks.pocket, sparks }).mint);
    expect(levels.levelsLost).toBeGreaterThan(0);
    expect(impactLines(spending)).toEqual([
      `+${formatCount(GLORY_POINTS.mint, 'fr')} Gloire`,
      `Niveau ${formatCount(levels.levelBefore, 'fr')} → ${formatCount(levels.levelAfter, 'fr')}`,
    ]);
    expect(text(spending)).not.toMatch(/badge/i);
  });

  test('une frappe qui ne fait perdre aucun niveau ne promet que la Gloire', () => {
    const sparks = { pocket: 90_000, cycle: 90_000, lifetime: 90_000, debt: 0 };
    const game = gameBlockFixture({ score: sparks.pocket, debitablePoints: sparks.pocket, sparks });
    const steady = renderToStaticMarkup(<GameMintPreview {...props({}, { mint: { ...game.mint, levelsLost: 0, levelAfter: game.mint.levelBefore, ladder: undefined } })} />);
    expect(impactLines(steady)).toEqual([`+${formatCount(GLORY_POINTS.mint, 'fr')} Gloire`]);
  });

  test('aucun paragraphe : ni tableau de lignes, ni phrase d’explication', () => {
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('<p class="text-caption"');
    expect(page).not.toContain('Vent arrière');
    expect(text(html.replace(/<ul data-game-mint-impact[\s\S]*?<\/ul>/, ''))).not.toContain('→');
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

  test('l’échec se lit sous le bouton', () => {
    expect(renderToStaticMarkup(<GameMintPreview {...props({}, { error: 'La frappe n’a pas abouti.' })} />)).toContain('role="alert"');
  });
});

describe('avant le geste, ce que la frappe dépense (#9705)', () => {
  test('les points en poche, le prix, et ce qui restera', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ score: 5000, debitablePoints: 5000 })} />));
    expect(page).toContain('En poche 5 000 étincelles');
    expect(page).toContain('Coûte 1 221 étincelles');
    expect(page).toContain('Restera 3 779 étincelles');
  });

  test('TOUT est dépensable (porteur 2026-10-16) : plus de « points à convertir », une seule poche — le manque se dit en étincelles, pour SA Meesh', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ score: 600, debitablePoints: 600 })} />));
    expect(page).toContain('En poche 600 étincelles');
    expect(page).not.toMatch(/convertir/i);
    expect(page).toContain('Il manque 621 étincelles pour la Meesh n° 4.');
  });
});

describe('une frappe pas encore possible : pas de bouton grisé', () => {
  const html = renderToStaticMarkup(<GameMintPreview {...props({ score: 600, debitablePoints: 600 })} />);

  test('aucun bouton', () => {
    expect(html).not.toContain('data-game-mint-action');
  });

  test('ce qu’il manque, en une ligne, et le prix de la prochaine', () => {
    expect(text(html)).toContain('Il manque 621 étincelles pour la Meesh n° 4.');
    expect(text(html)).not.toContain('Restera');
    expect(html).toMatch(/data-game-mint-price=""[^>]*>1\s221\sétincelles</);
  });

  test('aucune puce de coût ne se promet', () => {
    expect(html).not.toContain('data-game-mint-impact');
  });
});

describe('la dixième Meesh : le prix monte', () => {
  test('la 11e coûte plus, et le héros le dit', () => {
    const page = text(renderToStaticMarkup(<GameMintPreview {...props({ mintedLifetime: 10, score: 3000, debitablePoints: 3000 })} />));
    expect(page).toContain('n° 11');
    expect(page).toContain('1 587 étincelles');
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

  test('une SECONDE frappe montre la pièce en train d’être frappée, pas le numéro de la précédente', async () => {
    type Stage = { readonly strikeKey: number; readonly next: number; readonly confirmed: number | null };
    let set: (stage: Stage) => void = () => undefined;
    function Bench() {
      const [stage, setStage] = useState<Stage>({ strikeKey: 0, next: 4, confirmed: null });
      set = setStage;
      const base = props({}, { strikeKey: stage.strikeKey, celebration: stage.confirmed === null ? null : CONFIRMED[stage.confirmed] ?? null });
      return <GameMintPreview {...base} mint={{ ...base.mint, number: stage.next }} />;
    }
    const CONFIRMED: Readonly<Record<number, { number: number; edition: 'silver'; key: number }>> = { 4: { number: 4, edition: 'silver', key: 1 } };
    const host = await mount(<Bench />);
    const scene = (): string => host.querySelector('[data-game-mint-scene] [data-game-number]')?.getAttribute('data-game-number') ?? '';
    await act(async () => set({ strikeKey: 1, next: 4, confirmed: null }));
    expect(scene()).toBe('4');
    await act(async () => set({ strikeKey: 1, next: 5, confirmed: 4 }));
    expect(scene()).toBe('4');
    await act(async () => set({ strikeKey: 2, next: 5, confirmed: 4 }));
    expect(scene()).toBe('5');
  });
});

/**
 * LA FRAPPE FERMÉE POUR UNE AUTRE RAISON QUE LE PRIX (porteur 2026-10-16) : une DETTE d'étincelles à rembourser, ou une
 * réserve du trésor que le rang n'ouvre pas encore. Un message clair, jamais un bouton grisé muet.
 */
describe('une frappe fermée par une dette ou par un rang', () => {
  const closed = (patch: Record<string, unknown>) => {
    const game = gameBlockFixture({ score: 90_000, debitablePoints: 90_000 });
    return { ...props({ score: 90_000, debitablePoints: 90_000 }), mint: { ...game.mint, canMint: false, missingPoints: 0, ...patch } } as Parameters<typeof GameMintPreview>[0];
  };

  test('une dette : le message dit combien, et que les prochains gains la remboursent ; aucun bouton', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...closed({ blockedBy: 'debt', sparksDebt: 120 })} />);
    expect(html).toContain('data-game-mint-blocked="debt"');
    expect(text(html)).toContain('120 étincelles');
    expect(text(html)).toMatch(/remboursent/);
    expect(html).not.toContain('data-game-mint-action');
  });

  test('une réserve fermée : le message nomme la réserve et le rang requis ; aucun bouton', () => {
    const html = renderToStaticMarkup(<GameMintPreview {...closed({ locked: { tier: 'coffre', minHeld: 100, requires: { rank: 'voix', division: 1, division5: 1 } } })} />);
    expect(html).toContain('data-game-mint-blocked="locked"');
    expect(text(html)).toContain('Coffre');
    expect(text(html)).toContain('Voix I');
    expect(html).not.toContain('data-game-mint-action');
  });

  test('la dette passe avant le rang', () => {
    const html = renderToStaticMarkup(
      <GameMintPreview {...closed({ blockedBy: 'debt', sparksDebt: 5, locked: { tier: 'coffre', minHeld: 100, requires: { rank: 'voix', division: 1, division5: 1 } } })} />,
    );
    expect(html).toContain('data-game-mint-blocked="debt"');
    expect(html).not.toContain('data-game-mint-blocked="locked"');
  });

  test('sans dette ni verrou : aucun message de blocage', () => {
    expect(renderToStaticMarkup(<GameMintPreview {...props()} />)).not.toContain('data-game-mint-blocked');
  });
});
