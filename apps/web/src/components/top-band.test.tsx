import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { httpTransport } from '@/lib/api/client';
import { appQueryClient } from '@/lib/api/query-client';
import { callStore } from '@/lib/calls/call-store';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
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
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const band = (host: ParentNode): Element | null => host.querySelector('[data-top-bars]');
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
    expect(host.querySelector('[data-player-banner]')).toBeNull();
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
