import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';

import { MY_PROFILE_QUERY_KEY, type MyProfile } from '@/lib/api/profile';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { httpTransport } from '@/lib/api/client';
import { appQueryClient } from '@/lib/api/query-client';
import { callStore } from '@/lib/calls/call-store';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { playerBannerVisitStore } from '@/lib/view/player-banner-visit';
import { reportCallResumeShown } from '@/lib/view/top-band';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TopBand } from './top-band';

/**
 * LE BANDEAU DU HAUT (#9494) — l'appel prime, puis l'audio ; la bannière du
 * joueur n'a la place que quand rien ne joue, et jamais quand le jeu est
 * masqué. Elle se peint depuis le bloc `game` en cache, sans squelette.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
  const cached = await loadEngagementProgress({ source: 'fixtures', transport: httpTransport });
  if (!cached.ok) throw new Error('progression de démonstration attendue');
  appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, cached.data);
});
afterEach(() => {
  unmountAll();
  reportCallResumeShown(false);
  callStore.setState({ call: null, waiting: null });
  gamePrefs.set({ hidden: false });
  playerBannerVisitStore.setState({ phase: 'armed', visit: 1 });
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const band = (host: ParentNode): Element | null => host.querySelector('[data-top-bars]');
/** La sortie dure `BANNER_EXIT_MS` : on attend un peu plus, jamais moins. */
const leftTheBand = async (host: ParentNode): Promise<void> => {
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-player-slot]') !== null; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
};
const waitForBanner = async (host: ParentNode): Promise<Element | null> => {
  for (let attempt = 0; attempt < 20 && host.querySelector('[data-player-banner]') === null; attempt += 1) await settle();
  return host.querySelector('[data-player-banner]');
};

describe('la priorité appel > audio > bannière', () => {
  test('rien ne joue : la bannière du joueur se peint depuis le cache, sans squelette', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(band(host)?.getAttribute('data-top-band')).toBe('player');
    expect(await waitForBanner(host)).not.toBeNull();
    expect(host.querySelector('[aria-busy="true"], [data-skeleton]')).toBeNull();
  });

  test('un appel arrive : la bannière s’efface ; il part : elle revient à la même place', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(await waitForBanner(host)).not.toBeNull();
    await act(async () => reportCallResumeShown(true));
    expect(band(host)?.getAttribute('data-top-band')).toBe('call');
    expect(host.querySelector('[data-player-banner]')).not.toBeNull();
    await leftTheBand(host);
    expect(host.querySelector('[data-player-banner]')).toBeNull();
    await act(async () => reportCallResumeShown(false));
    expect(band(host)?.getAttribute('data-top-band')).toBe('player');
    expect(await waitForBanner(host)).not.toBeNull();
  });

  test('un appel entrant prime aussi', async () => {
    callStore.setState({
      waiting: { callId: 'c1', conversationId: 'conv-1', media: 'audio', callerName: 'Amina', callerAvatar: null, isGroup: false, title: 'Amina' },
    });
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(band(host)?.getAttribute('data-top-band')).toBe('call');
    await leftTheBand(host);
    expect(host.querySelector('[data-player-banner]')).toBeNull();
  });
});

describe('la bannière sort en glissant, elle ne disparaît pas sèchement', () => {
  test('un appel arrive : elle est marquée « en sortie », hors de la pile, puis retirée', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(await waitForBanner(host)).not.toBeNull();
    expect(host.querySelector('[data-player-slot]')?.getAttribute('data-player-slot')).toBe('shown');
    await act(async () => reportCallResumeShown(true));
    expect(host.querySelector('[data-player-slot]')?.getAttribute('data-player-slot')).toBe('leaving');
    await leftTheBand(host);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
  });

  test('en sortie, elle n’est plus atteignable : ni clic par-dessus l’appel, ni Tab, ni lecteur d’écran', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(await waitForBanner(host)).not.toBeNull();
    expect(host.querySelector('[data-player-slot]')?.hasAttribute('inert')).toBe(false);
    await act(async () => reportCallResumeShown(true));
    const slot = host.querySelector('[data-player-slot="leaving"]');
    expect(slot?.hasAttribute('inert')).toBe(true);
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
    await leftTheBand(host);
    await act(async () => reportCallResumeShown(false));
    expect(host.querySelector('[data-player-slot]')?.hasAttribute('inert')).toBe(false);
    expect(host.querySelector('[data-player-slot]')?.hasAttribute('aria-hidden')).toBe(false);
  });

  test('elle revient quand l’appel part, à sa place, sans rester marquée en sortie', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(await waitForBanner(host)).not.toBeNull();
    await act(async () => reportCallResumeShown(true));
    await leftTheBand(host);
    await act(async () => reportCallResumeShown(false));
    expect(host.querySelector('[data-player-slot]')?.getAttribute('data-player-slot')).toBe('shown');
  });

  test('« Jeu masqué » : aucun remplaçant, aucune sortie — le bandeau est vide tout de suite', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(await waitForBanner(host)).not.toBeNull();
    await act(async () => gamePrefs.set({ hidden: true }));
    expect(host.querySelector('[data-player-slot]')).toBeNull();
  });
});

describe('quand la bannière n’a pas de place', () => {
  test('« Jeu masqué » : le bandeau reste vide', async () => {
    gamePrefs.set({ hidden: true });
    const host = await mount(<TopBand routeKey="list" signedIn />);
    expect(band(host)?.getAttribute('data-top-band')).toBe('');
    expect(band(host)?.children.length).toBe(0);
  });

  test('sans session, aucune bannière', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn={false} />);
    expect(band(host)?.getAttribute('data-top-band')).toBe('');
  });

  test('hors des hubs (le fil), aucune bannière ni réserve', async () => {
    const insets: number[] = [];
    const host = await mount(<TopBand routeKey="thread" signedIn onInset={(pixels) => insets.push(pixels)} />);
    expect(band(host)?.getAttribute('data-top-band')).toBe('');
    expect(insets.every((pixels) => pixels === 0)).toBe(true);
  });
});

/**
 * LA VISITE (#9536) — la bannière n'apparaît qu'à l'ouverture de
 * l'application : 30 s après sa première peinture elle remonte, puis reste
 * retirée jusqu'à la prochaine ouverture. Les durées sont celles du porteur ;
 * les témoins les réduisent à quelques millisecondes.
 */
const TIMING = { holdMs: 40, exitMs: 40 } as const;
const sleep = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('la bannière n’est là qu’à l’ouverture de l’application', () => {
  test('peinte, elle reste pendant la présence puis sort en remontant (inerte), puis le bandeau se vide', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn timing={{ holdMs: 60, exitMs: 80 }} />);
    expect(await waitForBanner(host)).not.toBeNull();
    expect(host.querySelector('[data-player-slot]')?.getAttribute('data-player-slot')).toBe('shown');
    await sleep(90);
    const slot = host.querySelector('[data-player-slot]');
    expect(slot?.getAttribute('data-player-slot')).toBe('expiring');
    expect(slot?.hasAttribute('inert')).toBe(true);
    expect(slot?.className).toContain('player-banner-slot-expiring');
    await sleep(120);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    expect(playerBannerVisitStore.getState().phase).toBe('gone');
  });

  test('retirée, elle ne revient ni au changement de route ni à un nouveau rendu', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    expect(await waitForBanner(host)).not.toBeNull();
    await sleep(160);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    const again = await mount(<TopBand routeKey="calls" signedIn timing={TIMING} />);
    await settle();
    expect(again.querySelector('[data-player-banner]')).toBeNull();
  });

  test('une nouvelle ouverture de l’application (retour après une vraie absence) la rappelle', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    expect(await waitForBanner(host)).not.toBeNull();
    await sleep(160);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    await act(async () => playerBannerVisitStore.getState().send('reopened'));
    expect(await waitForBanner(host)).not.toBeNull();
  });

  test('un appel tient la place moins longtemps que la fenêtre d’ouverture : la bannière paraît à son départ, ses 30 s entières', async () => {
    callStore.setState({
      waiting: { callId: 'c1', conversationId: 'conv-1', media: 'audio', callerName: 'Amina', callerAvatar: null, isGroup: false, title: 'Amina' },
    });
    const host = await mount(<TopBand routeKey="list" signedIn timing={{ holdMs: 2_000, exitMs: 40 }} />);
    await sleep(60);
    expect(playerBannerVisitStore.getState().phase).toBe('armed');
    await act(async () => callStore.setState({ waiting: null }));
    expect(await waitForBanner(host)).not.toBeNull();
    expect(playerBannerVisitStore.getState().phase).toBe('shown');
  });

  test('jamais peinte pendant la fenêtre d’ouverture (un appel qui dure) : la visite se ferme, la bannière ne surgit pas en pleine session', async () => {
    callStore.setState({
      waiting: { callId: 'c1', conversationId: 'conv-1', media: 'audio', callerName: 'Amina', callerAvatar: null, isGroup: false, title: 'Amina' },
    });
    const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    await sleep(160);
    expect(playerBannerVisitStore.getState().phase).toBe('gone');
    await act(async () => callStore.setState({ waiting: null }));
    await sleep(60);
    expect(host.querySelector('[data-player-banner]')).toBeNull();
  });

  test('ouverte sur un écran sans bandeau (le fil) : revenir à la liste après la fenêtre ne la fait pas surgir', async () => {
    await mount(<TopBand routeKey="thread" signedIn timing={TIMING} />);
    await sleep(160);
    expect(playerBannerVisitStore.getState().phase).toBe('gone');
    const list = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    await sleep(60);
    expect(list.querySelector('[data-player-banner]')).toBeNull();
  });

  test('sans session, la fenêtre d’ouverture n’est pas entamée : la connexion ouvre la visite', async () => {
    await mount(<TopBand routeKey="list" signedIn={false} timing={TIMING} />);
    await sleep(160);
    expect(playerBannerVisitStore.getState().phase).toBe('armed');
  });

  test('une réouverture pendant qu’elle est encore là (minuteries gelées à l’arrière-plan) relance ses 30 s, puis elle sort — jamais une bannière qui reste', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn timing={{ holdMs: 80, exitMs: 40 }} />);
    expect(await waitForBanner(host)).not.toBeNull();
    await act(async () => playerBannerVisitStore.getState().send('reopened'));
    await sleep(20);
    expect(playerBannerVisitStore.getState().phase).toBe('shown');
    await sleep(260);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    expect(playerBannerVisitStore.getState().phase).toBe('gone');
  });

  test('sans donnée du jeu : aucune bannière, et la visite reste armée', async () => {
    const cached = appQueryClient.getQueryData<{ game?: unknown }>(ENGAGEMENT_PROGRESS_QUERY_KEY);
    await act(async () => appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, { ...cached, game: undefined }));
    const host = await mount(<TopBand routeKey="list" signedIn timing={{ holdMs: 2_000, exitMs: 40 }} />);
    await settle();
    expect(host.querySelector('[data-player-banner]')).toBeNull();
    expect(playerBannerVisitStore.getState().phase).toBe('armed');
    unmountAll();
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, cached);
  });

  test('la bannière de profil de l’utilisateur est le fond translucide de la bannière du joueur', async () => {
    const profile: MyProfile = {
      id: 'u1',
      username: 'amina',
      displayName: null,
      firstName: null,
      lastName: null,
      bio: '',
      avatar: null,
      banner: 'https://cdn.example/banners/amina.jpg',
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
      email: null,
      phone: null,
      createdAt: null,
    };
    appQueryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);
    const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    expect(await waitForBanner(host)).not.toBeNull();
    expect(host.querySelector('[data-player-banner-backdrop]')?.getAttribute('src')).toBe('https://cdn.example/banners/amina.jpg');
    unmountAll();
    appQueryClient.removeQueries({ queryKey: MY_PROFILE_QUERY_KEY });
  });

  test('la sortie dure ce que dit le porteur : une seconde, courbe douce, remontée hors de l’écran', () => {
    const css = readFileSync(new URL('../styles/player-banner.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.player-banner-slot-expiring \{[^}]*animation: player-banner-expire 1000ms cubic-bezier/);
    expect(css).toMatch(/@keyframes player-banner-expire[\s\S]*translateY\(calc\(-100%/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.player-banner-slot-expiring \{\s*animation: player-banner-fade/);
  });
});
