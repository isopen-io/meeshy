import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { levelThreshold } from '@meeshy/shared/utils/game/levels';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { AtlasBody } from './progression-atlas';
import { PrestigeBody } from './progression-prestige';
import { VitrineBody } from './progression-vitrine';

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

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const progress = (game = gameBlockWithExtrasFixture()): EngagementWithGame => ({ ...base, game });

const gesture = <V,>(run: (vars: V) => void = () => undefined) => ({ run, pending: false, vars: undefined as V | undefined, error: undefined as string | undefined });
const actions = (patch: Partial<GameV2Actions> = {}): GameV2Actions => ({
  consent: gesture(),
  pseudonym: gesture(),
  invite: gesture(),
  accept: gesture(),
  abandon: gesture(),
  claimStep: gesture(),
  buySeal: gesture(),
  saveOrder: gesture(),
  visibility: gesture(),
  prestige: gesture(),
  ...patch,
});

/**
 * LES PAGES VITRINE, ATLAS ET PRESTIGE (#9387, #9388, #9389) — câblées aux
 * gestes, et muettes devant un ancien serveur.
 */
describe('la page Vitrine', () => {
  test('descendre une coupe appelle le geste de rangement avec le nouvel ordre', async () => {
    const orders: Array<readonly string[]> = [];
    const host = await mount(<VitrineBody progress={progress()} online actions={actions({ saveOrder: gesture((order: readonly string[]) => orders.push(order)) })} />);
    await click(host.querySelector('[data-game-trophy-down]'));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toHaveLength(3);
  });

  test('choisir qui voit envoie UNIQUEMENT le réglage de la vitrine', async () => {
    const patches: Array<Record<string, string | undefined>> = [];
    const host = await mount(<VitrineBody progress={progress()} online actions={actions({ visibility: gesture((patch) => patches.push(patch)) })} />);
    await click(host.querySelector('input[value="me"]'));
    expect(patches).toEqual([{ showcase: 'me' }]);
  });

  test('un serveur qui ne sert pas les réglages : « amis » par défaut, jamais plus ouvert', async () => {
    const block = gameBlockWithExtrasFixture();
    const { visibility: _visibility, ...withoutVisibility } = block;
    const host = await mount(<VitrineBody progress={progress(withoutVisibility)} online actions={actions()} />);
    expect(host.querySelector<HTMLInputElement>('input[value="friends"]')?.checked).toBe(true);
  });

  test('un ancien serveur : le message', async () => {
    const host = await mount(<VitrineBody progress={progress(gameBlockFixture())} online actions={actions()} />);
    expect(host.textContent).toContain('pas encore disponible');
  });
});

describe('la page Atlas', () => {
  test('choisir « Mes amis » envoie UNIQUEMENT le réglage de l’Atlas', async () => {
    const patches: Array<Record<string, string | undefined>> = [];
    const host = await mount(<AtlasBody progress={progress()} online actions={actions({ visibility: gesture((patch) => patches.push(patch)) })} />);
    await click(host.querySelector('input[value="friends"]'));
    expect(patches).toEqual([{ atlas: 'friends' }]);
  });

  test('un serveur qui ne sert pas les réglages : privé par défaut', async () => {
    const block = gameBlockWithExtrasFixture();
    const { visibility: _visibility, ...withoutVisibility } = block;
    const host = await mount(<AtlasBody progress={progress(withoutVisibility)} online actions={actions()} />);
    expect(host.querySelector<HTMLInputElement>('input[value="me"]')?.checked).toBe(true);
  });

  test('un ancien serveur : le message', async () => {
    const host = await mount(<AtlasBody progress={progress(gameBlockFixture())} online actions={actions()} />);
    expect(host.textContent).toContain('pas encore disponible');
  });
});

describe('la page Prestige', () => {
  const atTop = (): EngagementWithGame => progress(gameBlockWithExtrasFixture({ score: levelThreshold(100) + 40 }));

  test('confirmer appelle le geste de passage', async () => {
    let passes = 0;
    const host = await mount(<PrestigeBody progress={atTop()} online actions={actions({ prestige: gesture(() => (passes += 1)) })} />);
    await click(host.querySelector('[data-game-prestige-go]'));
    await click(host.querySelector('[data-game-prestige-confirm-go]'));
    expect(passes).toBe(1);
  });

  test('un refus de la passerelle se lit sous la proposition', async () => {
    const refused = { run: () => undefined, pending: false, vars: undefined, error: 'Le Prestige s’ouvre au niveau 100.' };
    const host = await mount(<PrestigeBody progress={atTop()} online actions={actions({ prestige: refused })} />);
    expect(host.textContent).toContain('s’ouvre au niveau 100');
  });

  test('un ancien serveur : le message', async () => {
    const host = await mount(<PrestigeBody progress={progress(gameBlockFixture())} online actions={actions()} />);
    expect(host.textContent).toContain('pas encore disponible');
  });
});
