import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { ReglagesBody } from './progression-reglages';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/reglages' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => gamePrefs.set({ hidden: false, celebrations: true }));
afterEach(unmountAll);

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const progress: EngagementWithGame = { ...base, game: gameBlockWithExtrasFixture() };

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
 * LA PAGE « RÉGLAGES DU JEU » (#9481) — câblée aux gestes et aux réglages de
 * l’appareil. Les célébrations se posent tout de suite sur l’appareil ; quitter
 * la ligue est le geste de consentement retiré.
 */
describe('la page Réglages du jeu', () => {
  test('éteindre les célébrations se pose sur l’appareil, sans réseau', async () => {
    const host = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} />);
    await click(host.querySelector('[data-game-setting-celebrations]'));
    expect(gamePrefs.get().celebrations).toBe(false);
  });

  test('changer la visibilité de la vitrine envoie ce champ seul', async () => {
    const patches: Array<Record<string, string | undefined>> = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions({ visibility: gesture((patch) => patches.push(patch)) })} online hide={() => undefined} />);
    const fieldset = [...host.querySelectorAll('[data-game-visibility]')].find((node) => node.textContent?.includes('Vitrine de trophées'));
    await click(fieldset?.querySelector('input[value="everyone"]') ?? null);
    expect(patches).toEqual([{ showcase: 'everyone' }]);
  });

  test('quitter la ligue : le consentement retiré, sans pseudonyme', async () => {
    const calls: Array<{ consent: boolean; pseudonym?: string }> = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions({ consent: gesture((vars) => calls.push(vars)) })} online hide={() => undefined} />);
    await click(host.querySelector('[data-game-setting-league-leave]'));
    expect(calls).toEqual([{ consent: false }]);
  });

  test('masquer le jeu appelle le geste composé de l’écran', async () => {
    const hidden: boolean[] = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={(on) => hidden.push(on)} />);
    await click(host.querySelector('[data-game-setting-hidden]'));
    expect(hidden).toEqual([true]);
  });
});
