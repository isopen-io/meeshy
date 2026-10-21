import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { GAME_SETTINGS_QUERY_KEY, userGameQueryKey } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContactGameStripSlot, GameBannerOwnSlot, GameBannerVisitorSlot } from './game-profile-slots';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

/**
 * Les emplacements lisent `appQueryClient`, le cache PARTAGÉ par tout le
 * process `bun test` : sans le vider, « d’abord rien » et « sans session : rien »
 * dépendent de ce qu’un témoin précédent — de ce fichier ou d’un autre — y a
 * laissé sous `['me', 'engagement']`. Dans la suite complète, le profil se
 * dessinait dès le montage ; l’échec d’un `toBeNull()` sur un élément monté par
 * React met ~13 s à se formater (et ne lève pas sous bun 1.3.14), le témoin
 * dépassait son délai, et son corps abandonné poursuivait ses `act()` par-dessus
 * les fichiers suivants (3 523 rouges, #9481). Les verdicts sur ces éléments se
 * lisent donc en booléens : un échec y coûte une milliseconde et reste local.
 *
 * Le chunk du jeu peut déjà être chargé par un fichier précédent : au montage,
 * on voit alors le profil entier tout de suite. « D’abord rien » se lit donc
 * « rien OU le profil entier » — jamais un squelette, jamais une moitié.
 */
beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  appQueryClient.clear();
  gamePrefs.set({ hidden: false });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  appQueryClient.clear();
  gamePrefs.set({ hidden: false });
});
afterEach(unmountAll);

/** Le chunk du jeu, son catalogue et la lecture se résolvent l’un après l’autre : on laisse passer quelques tours. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 25)));
};

/**
 * LES EMPLACEMENTS DU JEU DANS LES PROFILS (#9481, #10092) — chargés à la demande, après
 * la première peinture de l’écran qui les héberge : jusqu’à ce qu’ils soient
 * prêts, RIEN (jamais un squelette pour un niveau qui n’existe pas toujours).
 */
describe('mon profil', () => {
  test('le niveau et le rang arrivent quand ils sont prêts, et jamais avant : d’abord rien', async () => {
    const host = await mount(<GameBannerOwnSlot enabled />);
    const drawn = host.querySelector('[data-profile-banner-game]') !== null;
    expect(drawn || host.innerHTML === '').toBe(true);
    await settle();
    expect(host.querySelector('[data-profile-banner-game]') !== null).toBe(true);
  });

  test('sur ma fiche : mes étincelles au début de la bannière ; ce qu’il me reste, le cercle le dit (#10231, #10951)', async () => {
    const host = await mount(<GameBannerOwnSlot enabled />);
    await settle();
    expect(host.querySelector('[data-profile-banner-level] [data-profile-banner-points]') !== null).toBe(true);
    expect(host.querySelector('[data-profile-banner-level] [data-profile-banner-missing]') === null).toBe(true);
  });

  test('sur ma fiche : ma Gloire totale à côté du blason, plus le total d’étincelles à vie (#10913, #10951)', async () => {
    const host = await mount(<GameBannerOwnSlot enabled />);
    await settle();
    expect(host.querySelector('[data-profile-banner-rank] [data-profile-banner-glory="620"]') !== null).toBe(true);
    expect(host.querySelector('[data-profile-banner-lifetime]') === null).toBe(true);
  });

  test('« Jeu masqué » : le jeu ne se dessine pas sur le profil', async () => {
    /* Le serveur fait foi (#9481) : le réglage du COMPTE, lu, règle la copie de l'appareil. */
    appQueryClient.setQueryData(GAME_SETTINGS_QUERY_KEY, { gameHidden: true, friendsLeagueOptOut: false, visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' } });
    const host = await mount(<GameBannerOwnSlot enabled />);
    await settle();
    expect(host.querySelector('[data-profile-banner-game]') === null).toBe(true);
  });

  test('sans session (lecture désactivée) : rien ne part, rien ne se dessine', async () => {
    const host = await mount(<GameBannerOwnSlot enabled={false} />);
    await settle();
    expect(host.querySelector('[data-profile-banner-game]') === null).toBe(true);
  });
});

describe('le profil d’un autre et la carte de contact', () => {
  test('son niveau et son rang, si ses réglages l’autorisent', async () => {
    const host = await mount(<GameBannerVisitorSlot userId="friend-1" enabled />);
    await settle();
    expect(host.querySelector('[data-profile-banner-game] [data-game-level]') !== null).toBe(true);
    expect(host.querySelector('[data-profile-banner-game] [data-game-rank]') !== null).toBe(true);
    /* Sa progression n'est jamais servie : aucun « encore » sur la fiche d'un autre. */
    expect(host.querySelector('[data-profile-banner-missing]') === null).toBe(true);
  });

  test('un AMI lit sa Gloire totale, servie par la passerelle ; un non-ami, à qui elle n’est pas servie, rien (#10913)', async () => {
    const shown = { level: 11, tier: 'lueur', prestige: 0, flame: null, rank: 'conteur', division: 3, division5: 5, mythic: null } as const;
    appQueryClient.setQueryData(userGameQueryKey('friend-3'), { visible: true, standing: { ...shown, points: 976, sparks: 976, sparksLifetime: 41_250, glory: 16_000 }, treasury: null });
    appQueryClient.setQueryData(userGameQueryKey('stranger-1'), { visible: true, standing: shown, treasury: null });
    const friend = await mount(<GameBannerVisitorSlot userId="friend-3" enabled={false} />);
    await settle();
    expect(friend.querySelector('[data-profile-banner-rank] [data-profile-banner-glory="16000"]') !== null).toBe(true);
    expect(friend.querySelector('[data-profile-banner-lifetime]') === null).toBe(true);
    const stranger = await mount(<GameBannerVisitorSlot userId="stranger-1" enabled={false} />);
    await settle();
    expect(stranger.querySelector('[data-profile-banner-game]') !== null).toBe(true);
    expect(stranger.querySelector('[data-profile-banner-glory]') === null).toBe(true);
  });

  test('ses réglages ferment son rang : rien ne se dessine, pas même « fermé »', async () => {
    appQueryClient.setQueryData(userGameQueryKey('friend-2'), { visible: false, standing: null, treasury: null });
    const host = await mount(<GameBannerVisitorSlot userId="friend-2" enabled={false} />);
    await settle();
    expect(host.textContent).toBe('');
  });

  test('la bande de la carte de contact : le niveau et les coupes, en lecture seule', async () => {
    const host = await mount(<ContactGameStripSlot userId="friend-1" enabled />);
    await settle();
    expect(host.querySelector('[data-game-contact-standing]') !== null).toBe(true);
    expect(host.querySelector('[data-game-contact-strip]') !== null).toBe(true);
  });

  test('lecture désactivée (et rien en cache pour ce membre) : rien', async () => {
    const host = await mount(<GameBannerVisitorSlot userId="friend-9" enabled={false} />);
    await settle();
    expect(host.textContent).toBe('');
  });
});
