import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { ReglagesBody, hideGame } from './progression-reglages';

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

/**
 * « JEU MASQUÉ » NE MENT PAS (#9481, conformité A-7 et D-2) — le drapeau de
 * l’appareil n’est que la moitié locale du geste. Si la passerelle REFUSE de
 * fermer les visibilités ou de sortir de la ligue, l’interrupteur ne reste pas
 * sur « masqué » : il dirait que le jeu est caché alors que les autres le voient
 * encore. Hors ligne, le geste est déjà suspendu pour la même raison.
 */
describe('masquer le jeu : un échec côté serveur rouvre l’interrupteur', () => {
  const visibility = (seen: unknown[], refused: boolean): GameV2Actions['visibility'] => ({
    pending: false,
    vars: undefined,
    error: undefined,
    run: (vars, handlers) => {
      seen.push(vars);
      if (refused) handlers?.onError?.();
    },
  });
  const consent = (seen: unknown[], refused: boolean): GameV2Actions['consent'] => ({
    pending: false,
    vars: undefined,
    error: undefined,
    run: (vars, handlers) => {
      seen.push(vars);
      if (refused) handlers?.onError?.();
    },
  });

  test('les visibilités refusées : le jeu n’est plus marqué masqué sur l’appareil', () => {
    const closed: unknown[] = [];
    hideGame({ on: true, progress, actions: actions({ visibility: visibility(closed, true) }) });
    expect(closed).toEqual([{ showcase: 'me', rank: 'me', treasury: 'me', atlas: 'me' }]);
    expect(gamePrefs.get().hidden).toBe(false);
  });

  test('la sortie de la ligue refusée : idem', () => {
    const left: unknown[] = [];
    const game = gameBlockWithExtrasFixture();
    if (game.league === undefined) throw new Error('la fixture porte la ligue');
    const inLeague: EngagementWithGame = { ...progress, game: { ...game, league: { ...game.league, access: 'open' } } };
    hideGame({ on: true, progress: inLeague, actions: actions({ consent: consent(left, true) }) });
    expect(left).toEqual([{ consent: false }]);
    expect(gamePrefs.get().hidden).toBe(false);
  });

  test('tout réussit : le jeu reste masqué', () => {
    hideGame({ on: true, progress, actions: actions({ visibility: visibility([], false), consent: consent([], false) }) });
    expect(gamePrefs.get().hidden).toBe(true);
  });

  test('réafficher ne touche jamais au serveur', () => {
    gamePrefs.set({ hidden: true });
    const sent: unknown[] = [];
    hideGame({ on: false, progress, actions: actions({ visibility: visibility(sent, false), consent: consent(sent, false) }) });
    expect(sent).toEqual([]);
    expect(gamePrefs.get().hidden).toBe(false);
  });
});
