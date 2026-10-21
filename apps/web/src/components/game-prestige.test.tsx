import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { levelThreshold } from '@meeshy/shared/utils/game/levels';

import { ALL_LEVEL_STEPS, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePrestige, type GamePrestigeProps } from './game-prestige';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { formatCount } from '@/lib/view/game-copy';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, rerender } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/prestige' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const quiet = { reducedMotion: true, haptics: false, schedule: () => () => undefined } as const;

const props = (score = levelThreshold(100) + 40, prestige = 1, patch: Partial<GamePrestigeProps> = {}): GamePrestigeProps => {
  const game = gameBlockWithExtrasFixture({ ...ALL_LEVEL_STEPS, score, prestige, levelRecord: 100 });
  if (game.prestige === undefined) throw new Error('la fixture porte le Prestige');
  return { level: game.level, score: game.level.score, prestige: game.prestige, online: true, pending: false, onPass: () => undefined, playOptions: quiet, ...patch };
};

/**
 * LE PRESTIGE (#9389) — proposition, explication par Mee et Meo, confirmation
 * qui dit ce qui repart ET que la ligue et le duo restent ouverts, passage. Pas
 * de passage sans confirmation.
 */
describe('la proposition au niveau 100', () => {
  const html = renderToStaticMarkup(<GamePrestige {...props()} />);

  test('Mee et Meo expliquent : ce qui repart, ce qu’on gagne', () => {
    const t = text(html);
    expect(t).toContain('ta lumière peut renaître, ou grandir encore');
    expect(t).toContain('ton niveau repart à 1 et tes étincelles à 0. Ce que tu as reçu depuis toujours et ta plus haute lumière restent gravés');
    expect(t).toContain(`${formatCount(GLORY_POINTS.prestige, 'fr').replace(/\s/g, ' ')} de gloire`);
    expect(html).toContain('data-game-bird="meeGuide"');
    expect(html).toContain('data-game-bird="meoGuide"');
  });

  test('les étoiles déjà posées sont dites et dessinées ; sans étoile, pas de trophée', () => {
    expect(text(html)).toContain('Renaissances : 1 sur 5');
    expect(html).toContain('data-game-prestige-star');
    const withStar = renderToStaticMarkup(<GamePrestige {...props(undefined, 0)} />);
    expect(withStar).not.toContain('data-game-prestige-trophy');
  });

  test('AUCUN passage sans confirmation : le premier bouton ouvre la confirmation, il n’envoie rien', async () => {
    let passes = 0;
    const host = await mount(<GamePrestige {...props(undefined, undefined, { onPass: () => (passes += 1) })} />);
    expect(host.querySelector('[data-game-prestige-confirm]')).toBeNull();
    await click(host.querySelector('[data-game-prestige-go]'));
    expect(passes).toBe(0);
    expect(host.querySelector('[data-game-prestige-confirm]')).not.toBeNull();
  });

  test('la confirmation dit ce qui repart, ce qui reste, et que la ligue et le duo restent ouverts', async () => {
    const host = await mount(<GamePrestige {...props()} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    const t = host.textContent ?? '';
    expect(t).toContain('Commencer ta Renaissance 2 ?');
    expect(t).toContain('Ce qui repart');
    expect(t).toContain('Ce qui reste');
    expect(t).toContain('joute (niveau 10) et ton alliance (niveau 20) restent ouvertes, car elles lisent ta plus haute lumière');
  });

  test('la confirmation donne les VALEURS avant → après : étincelles convertibles, niveau, record, étoiles, Gloire (#9705)', async () => {
    const host = await mount(<GamePrestige {...props()} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    const plain = (value: string): string => value.replace(/\s/g, ' ');
    const rows = plain(text(host.querySelector('[data-game-prestige-values]')?.innerHTML ?? ''));
    expect(rows).toContain(plain(`Ta lumière ${formatCount(props().score, 'fr')} étincelles → 0 étincelle`));
    expect(rows).toContain('Niveau 100 → 1');
    expect(rows).toContain('Étoiles 1 → 2');
    expect(rows).toContain(plain(`Gloire +${formatCount(GLORY_POINTS.prestige, 'fr')}`));
  });

  test('la confirmation dit que le consentement à la ligue publique reste enregistré', async () => {
    const host = await mount(<GamePrestige {...props()} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    expect(host.textContent ?? '').toContain('Ton accord pour la joute publique reste enregistré.');
  });

  test('confirmer envoie UN passage, et l’écran annonce la nouvelle étoile', async () => {
    let passes = 0;
    const host = await mount(<GamePrestige {...props(undefined, 1, { onPass: () => (passes += 1) })} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    await click(host.querySelector('[data-game-prestige-confirm-go]'));
    expect(passes).toBe(1);
    expect(host.textContent).toContain('Renaissance 2 !');
  });

  test('« Garder ma lumière » referme la confirmation sans rien envoyer', async () => {
    let passes = 0;
    const host = await mount(<GamePrestige {...props(undefined, 1, { onPass: () => (passes += 1) })} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    await click(host.querySelector('[data-game-prestige-confirm-stay]'));
    expect(passes).toBe(0);
    expect(host.querySelector('[data-game-prestige-confirm]')).toBeNull();
  });

  test('hors ligne : on ne passe pas, et l’écran le dit', async () => {
    const host = await mount(<GamePrestige {...props(undefined, 1, { online: false })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-prestige-go]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });

  test('un refus de la passerelle efface l’annonce de la nouvelle étoile et se lit', async () => {
    const host = await mount(<GamePrestige {...props()} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    await click(host.querySelector('[data-game-prestige-confirm-go]'));
    expect(host.textContent).toContain('Renaissance 2 !');
    await rerender(host, <GamePrestige {...props(undefined, undefined, { error: 'La Renaissance s’ouvre au niveau 100.' })} />);
    expect(host.textContent).not.toContain('Renaissance 2 !');
    expect(host.textContent).toContain('s’ouvre au niveau 100');
  });
});

describe('les états fermés', () => {
  test('sous le niveau 100 : on dit où l’on en est, aucune offre', () => {
    const html = renderToStaticMarkup(<GamePrestige {...props(5_000, 0)} />);
    expect(text(html)).toContain('s’ouvre au niveau 100');
    expect(text(html)).toContain('Requis 100');
    expect(text(html)).toMatch(/Il manque \d+ niveaux/);
    expect(html).not.toContain('data-game-prestige-go');
  });

  test('aux cinq étoiles : on le fête, aucune offre', () => {
    const html = renderToStaticMarkup(<GamePrestige {...props(levelThreshold(100) + 40, 5)} />);
    expect(text(html)).toContain('ses cinq renaissances');
    expect(html).not.toContain('data-game-prestige-go');
  });
});
