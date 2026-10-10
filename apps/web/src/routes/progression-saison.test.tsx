import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { SaisonBody } from './progression-saison';

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

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const progress = (game = gameBlockWithExtrasFixture({ balance: 12 })): EngagementWithGame => ({ ...base, game });

const gesture = <V,>(run: (vars: V) => void = () => undefined) => ({ run, pending: false, vars: undefined as V | undefined, error: undefined });
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
 * LA PAGE « SAISON » (#9386) — le parcours, câblé aux gestes. Réclamer et
 * acheter le Sceau passent par les gestes optimistes de la vague 2 ; un ancien
 * serveur (aucune clé `season`) n’affiche rien d’autre que le message.
 */
describe('la page Saison', () => {
  test('réclamer une étape appelle le geste avec le numéro de l’étape', async () => {
    const claimed: number[] = [];
    const host = await mount(<SaisonBody progress={progress()} online actions={actions({ claimStep: gesture((step: number) => claimed.push(step)) })} />);
    await click(host.querySelector('[data-game-season-step="6"]'));
    expect(claimed).toEqual([6]);
  });

  test('l’étape en vol est marquée occupée', async () => {
    const claiming = { run: () => undefined, pending: true, vars: 4 as number | undefined, error: undefined };
    const host = await mount(<SaisonBody progress={progress()} online actions={actions({ claimStep: claiming })} />);
    expect(host.querySelector('[data-game-season-step="4"]')?.getAttribute('aria-busy')).toBe('true');
  });

  test('acheter le Sceau appelle le geste', async () => {
    let bought = 0;
    const host = await mount(<SaisonBody progress={progress()} online actions={actions({ buySeal: gesture(() => (bought += 1)) })} />);
    await click(host.querySelector('[data-game-seal-buy]'));
    expect(bought).toBe(1);
  });

  test('un refus de la passerelle remonte sous le parcours', async () => {
    const refused = { run: () => undefined, pending: false, vars: undefined as number | undefined, error: 'Cette étape est déjà réclamée.' };
    const host = await mount(<SaisonBody progress={progress()} online actions={actions({ claimStep: refused })} />);
    expect(host.textContent).toContain('déjà réclamée');
  });

  test('un ancien serveur : le message, pas de parcours', async () => {
    const host = await mount(<SaisonBody progress={progress(gameBlockFixture())} online actions={actions()} />);
    expect(host.textContent).toContain('pas encore disponible');
    expect(host.querySelector('[data-game-season-path]')).toBeNull();
  });

  test('aucune saison ouverte (null) n’est PAS un ancien serveur : on le dit autrement', async () => {
    const host = await mount(<SaisonBody progress={progress({ ...gameBlockWithExtrasFixture(), season: null })} online actions={actions()} />);
    expect(host.textContent).toContain('Aucune saison n’est ouverte');
    expect(host.textContent).not.toContain('pas encore disponible');
  });
});
