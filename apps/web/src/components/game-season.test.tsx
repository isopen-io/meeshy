import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameSeasonBlock } from '@meeshy/shared/types/game';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { formatCount } from '@/lib/view/game-copy';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameSeason, type GameSeasonProps } from './game-season';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/saison' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const season = (patch: Partial<GameSeasonBlock> = {}): GameSeasonBlock => {
  const block = gameBlockWithExtrasFixture().season;
  if (block === undefined || block === null) throw new Error('la fixture porte la saison');
  return { ...block, ...patch };
};

const props = (patch: Partial<GameSeasonProps> = {}): GameSeasonProps => ({
  season: season(),
  held: 12,
  online: true,
  claimingStep: null,
  buyingSeal: false,
  errors: {},
  onClaim: () => undefined,
  onBuySeal: () => undefined,
  ...patch,
});

/**
 * LA SAISON (#9386, conception II.7) — huit semaines, un thème, quarante étapes
 * GRATUITES, une rangée Sceau cosmétique. Rien n’y rapporte de l’argent ni ne
 * change le jeu ; l’écran dit chaque état d’étape par le texte, pas seulement
 * par la couleur.
 */
describe('une saison en cours', () => {
  const html = renderToStaticMarkup(<GameSeason {...props()} />);

  test('le numéro, la semaine, le thème nommé dans la langue, les étoiles', () => {
    const t = text(html);
    expect(t).toContain('Saison 1 · semaine 4 sur 8');
    expect(t).toContain('Thème : Français');
    expect(t).toContain('56 étoiles');
  });

  test('ce qu’il manque pour l’étape suivante, et comment on gagne des étoiles', () => {
    expect(text(html)).toContain('étoiles pour l’étape suivante');
    expect(text(html)).toContain('4 étoiles ouvrent une étape');
  });

  test('quarante étapes, chacune lisible : réclamée, à réclamer, à venir', () => {
    expect((html.match(/data-game-season-step=/g) ?? []).length).toBe(40);
    expect(html).toContain('data-game-season-state="claimed"');
    expect(html).toContain('data-game-season-state="ready"');
    expect(html).toContain('data-game-season-state="locked"');
    expect(html).toContain('aria-label="Étape 1, réclamée, +100"');
    expect(html).toContain('aria-label="Étape 5, à réclamer, Un fragment"');
  });

  test('les trois premières sont réclamées, les onze suivantes à réclamer, le reste à venir', () => {
    const states = [...html.matchAll(/data-game-season-state="(\w+)"/g)].map((m) => m[1]);
    expect(states.filter((s) => s === 'claimed')).toHaveLength(3);
    expect(states.filter((s) => s === 'ready')).toHaveLength(11);
    expect(states.filter((s) => s === 'locked')).toHaveLength(26);
  });

  test('la rangée Sceau : un objet toutes les quatre étapes, dix au total', () => {
    expect((html.match(/data-game-seal-mark=/g) ?? []).length).toBe(10);
  });

  test('le Sceau est cosmétique et le dit', () => {
    expect(text(html)).toContain('purement décoratif');
  });
});

describe('réclamer', () => {
  test('le bouton nomme l’étape à réclamer et le geste part avec elle', async () => {
    const claimed: number[] = [];
    const host = await mount(<GameSeason {...props({ onClaim: (step) => claimed.push(step) })} />);
    expect(host.querySelector('[data-game-season-claim]')?.textContent).toContain('Réclamer l’étape 4');
    await click(host.querySelector('[data-game-season-claim]'));
    expect(claimed).toEqual([4]);
  });

  test('toucher une étape à réclamer la réclame ; une étape à venir ne fait rien', async () => {
    const claimed: number[] = [];
    const host = await mount(<GameSeason {...props({ onClaim: (step) => claimed.push(step) })} />);
    await click(host.querySelector('[data-game-season-step="10"]'));
    await click(host.querySelector('[data-game-season-step="30"]'));
    expect(claimed).toEqual([10]);
  });

  test('hors ligne : on ne réclame pas, et on le dit', async () => {
    const host = await mount(<GameSeason {...props({ online: false })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-season-step="4"]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });

  test('une réclamation en vol rend le bouton occupé', async () => {
    const host = await mount(<GameSeason {...props({ claimingStep: 4 })} />);
    expect(host.querySelector('[data-game-season-claim]')?.getAttribute('aria-busy')).toBe('true');
  });

  test('un refus de la passerelle se lit', () => {
    expect(text(renderToStaticMarkup(<GameSeason {...props({ errors: { claim: 'Cette étape est déjà réclamée.' } })} />))).toContain('déjà réclamée');
  });

  test('tout est réclamé : plus de bouton', () => {
    const all = Array.from({ length: 14 }, (_, i) => i + 1);
    const html = renderToStaticMarkup(<GameSeason {...props({ season: season({ claimedSteps: all, nextReward: null }) })} />);
    expect(html).not.toContain('data-game-season-claim');
  });
});

describe('le Sceau', () => {
  test('acheter : le prix en Meeshes, le geste part', async () => {
    let bought = 0;
    const host = await mount(<GameSeason {...props({ onBuySeal: () => (bought += 1) })} />);
    await click(host.querySelector('[data-game-seal-buy]'));
    expect(bought).toBe(1);
    expect(host.querySelector('[data-game-seal-buy]')?.textContent).toContain('10 Meeshes');
  });

  test('pas assez de Meeshes : le bouton se tait en disant pourquoi', async () => {
    const host = await mount(<GameSeason {...props({ held: 3 })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-seal-buy]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Il te manque des Meeshes pour le Sceau');
  });

  test('déjà possédé : on le dit, plus d’achat', () => {
    const html = renderToStaticMarkup(<GameSeason {...props({ season: season({ sealOwned: true }) })} />);
    expect(text(html)).toContain('Tu as le Sceau de cette saison.');
    expect(html).not.toContain('data-game-seal-buy');
  });
});

describe('les autres états', () => {
  test('parcours terminé : la coupe, le badge daté et la Gloire', () => {
    const done = season({ steps: 40, stars: 160, completed: true, starsToNext: 0, progress: 1, claimedSteps: Array.from({ length: 40 }, (_, i) => i + 1), nextReward: null });
    // #9674 — la Gloire dite est celle que le serveur verse (`GLORY_POINTS.season`), jamais un nombre recopié.
    expect(text(renderToStaticMarkup(<GameSeason {...props({ season: done })} />)).replace(/\s/g, ' ')).toContain(
      `une coupe, un badge daté et ${formatCount(GLORY_POINTS.season, 'fr').replace(/\s/g, ' ')} de Gloire`,
    );
  });

  test('aucune saison ouverte : on dit que la prochaine arrive', () => {
    expect(text(renderToStaticMarkup(<GameSeason {...props({ season: null })} />))).toContain('Aucune saison n’est ouverte');
  });
});
