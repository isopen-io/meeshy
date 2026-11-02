import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import { preferences as preferencesPath } from '@meeshy/shared/api/endpoints/me';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { APP_PREFERENCES_QUERY_KEY, type AppPreferences } from '@/lib/api/app-preferences';
import type { PreferenceActionDeps } from '@/lib/api/app-preferences-actions';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { atmosphereTilesOf, type AtmosphereGate, type AtmosphereOutcome } from '@/lib/game/atmosphere';
import type { GameHiddenOutcome } from '@/lib/game/game-hidden';
import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { scriptedGateway } from '@/test-support/scripted-transport';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { ReglagesBody, hideGame, useGameNotifications } from './progression-reglages';

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
    const fieldset = [...host.querySelectorAll('[data-game-visibility]')].find((node) => node.textContent?.includes('Trophées'));
    await click(fieldset?.querySelector('input[value="everyone"]') ?? null);
    expect(patches).toEqual([{ showcase: 'everyone' }]);
  });

  test('quitter la ligue : le consentement retiré, sans pseudonyme', async () => {
    const calls: Array<{ consent: boolean; pseudonym?: string }> = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions({ consent: gesture((vars) => calls.push(vars)) })} online hide={() => undefined} />);
    await click(host.querySelector('[data-game-setting-league-leave]'));
    expect(calls).toEqual([{ consent: false }]);
  });

  test('les notifications du jeu : l’interrupteur envoie son nouvel état, le refus se lit dessous (#9490)', async () => {
    const calls: boolean[] = [];
    const host = await mount(
      <ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} notifications={{ enabled: true, onToggle: (on) => calls.push(on), error: 'Réessaie.' }} />,
    );
    const input = host.querySelector<HTMLInputElement>('[data-game-setting-notifications]');
    expect(input?.checked).toBe(true);
    await click(input);
    expect(calls).toEqual([false]);
    expect(host.querySelector('#game-settings-notifications [role="alert"]')?.textContent).toBe('Réessaie.');
  });

  test('« Moments à immortaliser » : l’interrupteur vit dans la carte des notifications du jeu et envoie son nouvel état (#10268)', async () => {
    const calls: boolean[] = [];
    const host = await mount(
      <ReglagesBody
        progress={progress}
        actions={actions()}
        online
        hide={() => undefined}
        notifications={{ enabled: true, onToggle: () => undefined, photo: { enabled: true, onToggle: (on) => calls.push(on) } }}
      />,
    );
    const input = host.querySelector<HTMLInputElement>('#game-settings-notifications [data-game-setting-photo]');
    expect(input?.checked).toBe(true);
    await click(input);
    expect(calls).toEqual([false]);
  });

  test('masquer le jeu appelle le geste composé de l’écran', async () => {
    const hidden: boolean[] = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={(on) => hidden.push(on)} />);
    await click(host.querySelector('[data-game-setting-hidden]'));
    expect(hidden).toEqual([true]);
  });
});

/**
 * « JEU MASQUÉ » NE MENT PAS (#9481, conformité A-7 et D-2) — le réglage du compte
 * est la moitié « masquer » du geste. Si la passerelle REFUSE de fermer les
 * visibilités ou de sortir de la ligue, l'interrupteur ne reste pas sur
 * « masqué » : il dirait que le jeu est caché alors que les autres le voient
 * encore. Hors ligne, le geste est suspendu pour la même raison.
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
  /** Ce que fait `setGameHidden` une fois le serveur d'accord : la copie de l'appareil suit le compte. */
  const persisting = (written: boolean[]) => async (hidden: boolean): Promise<GameHiddenOutcome> => {
    written.push(hidden);
    gamePrefs.set({ hidden });
    return { status: 'saved' };
  };

  test('le réglage du compte s’écrit d’abord, les visibilités se ferment', () => {
    const written: boolean[] = [];
    const closed: unknown[] = [];
    hideGame({ on: true, progress, actions: actions({ visibility: visibility(closed, false) }), persist: persisting(written) });
    expect(written).toEqual([true]);
    expect(closed).toEqual([{ showcase: 'me', rank: 'me', treasury: 'me', atlas: 'me' }]);
    expect(gamePrefs.get().hidden).toBe(true);
  });

  test('les visibilités refusées : le jeu est réaffiché, côté compte aussi', () => {
    const written: boolean[] = [];
    hideGame({ on: true, progress, actions: actions({ visibility: visibility([], true) }), persist: persisting(written) });
    expect(written).toEqual([true, false]);
    expect(gamePrefs.get().hidden).toBe(false);
  });

  test('la sortie de la ligue refusée : idem', () => {
    const written: boolean[] = [];
    const left: unknown[] = [];
    const game = gameBlockWithExtrasFixture();
    if (game.league === undefined) throw new Error('la fixture porte la ligue');
    const inLeague: EngagementWithGame = { ...progress, game: { ...game, league: { ...game.league, access: 'open' } } };
    hideGame({ on: true, progress: inLeague, actions: actions({ consent: consent(left, true) }), persist: persisting(written) });
    expect(left).toEqual([{ consent: false }]);
    expect(written).toEqual([true, false]);
    expect(gamePrefs.get().hidden).toBe(false);
  });

  test('tout réussit : le jeu reste masqué', () => {
    const written: boolean[] = [];
    hideGame({ on: true, progress, actions: actions({ visibility: visibility([], false), consent: consent([], false) }), persist: persisting(written) });
    expect(written).toEqual([true]);
    expect(gamePrefs.get().hidden).toBe(true);
  });

  test('réafficher écrit le compte (sinon la lecture suivante le masquerait de nouveau) mais ne rouvre AUCUNE visibilité', () => {
    gamePrefs.set({ hidden: true });
    const written: boolean[] = [];
    const sent: unknown[] = [];
    hideGame({ on: false, progress, actions: actions({ visibility: visibility(sent, false), consent: consent(sent, false) }), persist: persisting(written) });
    expect(written).toEqual([false]);
    expect(sent).toEqual([]);
    expect(gamePrefs.get().hidden).toBe(false);
  });
});

/**
 * « MON ATMOSPHÈRE » (#10163, L10b) — l'atmosphère du compte se lit sur la carte ; le geste ouvre le MÊME écran
 * de choix que le déroulé photo, sans « Choisir plus tard » ; choisir appelle la porte et referme l'écran ;
 * une écriture mise en file hors ligne se dit sous la carte.
 */
describe('Mon atmosphère', () => {
  const gate = (current: 'olympe' | null, outcome: AtmosphereOutcome, chosen: string[]): AtmosphereGate => ({
    current,
    tiles: atmosphereTilesOf({ catalogue: [], installed: [], origin: 'https://gate.example' }),
    offers: () => false,
    choose: async (atmosphere) => {
      chosen.push(atmosphere);
      return outcome;
    },
    defer: () => undefined,
  });

  test('sans atmosphère : la carte le dit et propose de choisir ; avec : le nom et « Changer d’atmosphère »', async () => {
    const none = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} atmosphere={gate(null, { status: 'saved', packInstalled: true }, [])} />);
    expect(none.querySelector('[data-game-setting-atmosphere-current]')?.textContent).toContain('Afrique éternelle');
    expect(none.querySelector('[data-game-setting-atmosphere]')?.textContent).toBe('Choisir mon atmosphère');
    const some = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} atmosphere={gate('olympe', { status: 'saved', packInstalled: true }, [])} />);
    expect(some.querySelector('[data-game-setting-atmosphere-current]')?.textContent).toBe('Olympe');
    expect(some.querySelector('[data-game-setting-atmosphere]')?.textContent).toBe('Changer d’atmosphère');
  });

  test('le geste ouvre l’écran de choix sans « plus tard » ; choisir appelle la porte, ferme l’écran, et une file hors ligne se dit', async () => {
    const chosen: string[] = [];
    const host = await mount(<ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} atmosphere={gate('olympe', { status: 'queued' }, chosen)} />);
    await click(host.querySelector('[data-game-setting-atmosphere]'));
    expect(host.querySelector('[data-atmosphere-choice]')).not.toBeNull();
    expect(host.querySelector('[data-atmosphere-later]')).toBeNull();
    expect(host.querySelector('[data-atmosphere-option="olympe"]')?.getAttribute('aria-checked')).toBe('true');
    await click(host.querySelector('[data-atmosphere-option="neon"]'));
    await click(host.querySelector('[data-atmosphere-continue]'));
    expect(chosen).toEqual(['neon']);
    expect(host.querySelector('[data-atmosphere-choice]')).toBeNull();
    expect(host.querySelector('#game-settings-atmosphere [role="status"]')?.textContent).toContain('Hors ligne');
  });
});

/**
 * CE QUI PART QUAND ON BASCULE UNE NOTIFICATION DU JEU (#9490, #10268) — le câblage de l'écran, pas un rappel
 * tendu à la main : chaque interrupteur de la carte écrit SA clé, et seulement elle, dans `PATCH /me/preferences`.
 * Un interrupteur « Moments à immortaliser » qui écrirait `gameEnabled` couperait tout le jeu en croyant ne couper
 * que les photos.
 */
describe('les notifications du jeu : ce que la bascule envoie à la passerelle', () => {
  const served: AppPreferences = {
    theme: 'auto',
    pushEnabled: true,
    soundEnabled: true,
    showOnlineStatus: true,
    showLastSeen: true,
    showReadReceipts: true,
    showTypingIndicator: true,
    hideProfileFromSearch: false,
    acceptCallsFromNonContacts: true,
    notifyContactsOnReturn: true,
    contactActivityEnabled: true,
    gameEnabled: true,
    gamePhotoEnabled: true,
  };

  /** La passerelle sert la catégorie `notification` ENTIÈRE, telle qu'elle l'a retenue. */
  const screen = (retained: Pick<AppPreferences, 'gameEnabled' | 'gamePhotoEnabled'>) => {
    const { pushEnabled, soundEnabled, contactActivityEnabled, gameEnabled, gamePhotoEnabled } = { ...served, ...retained };
    const notification = { pushEnabled, soundEnabled, contactActivityEnabled, gameEnabled, gamePhotoEnabled };
    const gateway = scriptedGateway({ [`PATCH ${preferencesPath}`]: { ok: true, status: 200, data: { notification } } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, served);
    const deps: PreferenceActionDeps = { ...gateway.deps, queryClient, isOnline: () => true };
    function Host() {
      return <ReglagesBody progress={progress} actions={actions()} online hide={() => undefined} notifications={useGameNotifications(deps)} />;
    }
    return { gateway, queryClient, Host };
  };

  test('« Moments à immortaliser » éteint envoie notification.gamePhotoEnabled = false, et rien d’autre', async () => {
    const { gateway, queryClient, Host } = screen({ gameEnabled: true, gamePhotoEnabled: false });
    const host = await mount(<Host />);
    await click(host.querySelector('[data-game-setting-photo]'));
    expect(gateway.calls().map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'PATCH', path: preferencesPath, body: { notification: { gamePhotoEnabled: false } } },
    ]);
    expect(queryClient.getQueryData<AppPreferences>(APP_PREFERENCES_QUERY_KEY)).toMatchObject({ gameEnabled: true, gamePhotoEnabled: false });
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-photo]')?.checked).toBe(false);
  });

  test('les notifications du jeu éteintes envoient notification.gameEnabled = false, et rien d’autre', async () => {
    const { gateway, Host } = screen({ gameEnabled: false, gamePhotoEnabled: true });
    const host = await mount(<Host />);
    await click(host.querySelector('[data-game-setting-notifications]'));
    expect(gateway.calls().map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'PATCH', path: preferencesPath, body: { notification: { gameEnabled: false } } },
    ]);
  });
});
