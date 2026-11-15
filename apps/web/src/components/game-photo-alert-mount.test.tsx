import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { httpTransport } from '@/lib/api/client';
import { appQueryClient } from '@/lib/api/query-client';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePhotoAlertMount } from './game-photo-alert-mount';
import { TopBand } from './top-band';

/**
 * L'HÔTE DES INVITATIONS À IMMORTALISER (#10174) — armé au REPOS depuis le chrome différé de la coquille, jamais
 * depuis la bande du haut, qui est dans l'entrée : la première peinture ne paie ni sa porte paresseuse ni son
 * horloge de repos. Il se pose pourtant DANS la colonne de la bande, à la place où l'on attend une bannière.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

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
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const pause = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const waitFor = async (host: ParentNode, selector: string): Promise<Element | null> => {
  for (let attempt = 0; attempt < 40 && host.querySelector(selector) === null; attempt += 1) await pause(20);
  return host.querySelector(selector);
};

describe('l’hôte des invitations', () => {
  test('connecté : il arrive après le repos, DANS la colonne de la bande, sans bannière tant que rien n’est franchi', async () => {
    const runs: (() => void)[] = [];
    const host = await mount(
      <>
        <TopBand routeKey="list" signedIn />
        <GamePhotoAlertMount routeKey="list" signedIn idle={(run) => runs.push(run)} />
      </>,
    );
    await pause(40);
    expect(host.querySelector('[data-photo-alert-host]')).toBeNull();
    await act(async () => runs.forEach((run) => run()));
    expect(await waitFor(host, '[data-top-bars] [data-photo-alert-host]')).not.toBeNull();
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
  });

  test('invité : jamais monté', async () => {
    const host = await mount(
      <>
        <TopBand routeKey="list" signedIn={false} />
        <GamePhotoAlertMount routeKey="list" signedIn={false} idle={(run) => run()} />
      </>,
    );
    await pause(300);
    expect(host.querySelector('[data-photo-alert-host]')).toBeNull();
  });

  test('la bande du haut seule ne le monte jamais : il ne vient que du chrome différé', async () => {
    const host = await mount(<TopBand routeKey="list" signedIn />);
    await pause(300);
    expect(host.querySelector('[data-photo-alert-host]')).toBeNull();
  });
});
