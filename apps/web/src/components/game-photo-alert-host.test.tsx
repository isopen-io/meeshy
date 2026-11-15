import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import { appQueryClient } from '@/lib/api/query-client';
import { callStore } from '@/lib/calls/call-store';
import { createPhotoAlerts, type PhotoAlerts } from '@/lib/game-photo/alerts';
import type { PhotoEnv } from '@/lib/game-photo/env';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePhotoAlertHost } from './game-photo-alert-host';

/**
 * L'HÔTE DES INVITATIONS (#10174, L18) — une étape PASSIVE n'ouvre aucune feuille modale : une bannière polie,
 * qui s'efface seule ; la toucher ouvre la feuille (annonce, reprise, aperçu sans réseau, trois gestes). Jamais
 * hors d'un hub, pendant un appel, une saisie ; push déjà envoyé ⇒ rien ; réglage « jamais » ⇒ rien.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
beforeEach(() => {
  appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view({ streak: 6 }));
});
afterEach(() => {
  unmountAll();
  callStore.setState({ call: null, waiting: null });
  gamePrefs.set({ hidden: false, celebrations: true });
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}, photo?: Partial<NonNullable<EngagementWithGame['game']>['photo']>): EngagementWithGame => {
  const game = gameBlockFixture(patch);
  return {
    ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
    game: photo === undefined ? game : { ...game, photo: { atmosphere: null, invitations: 'every', baselineAt: null, baseline: null, treasuryPeakTier: null, moments: [], ...photo } },
  };
};

const settle = async (rounds = 6): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

type Bench = {
  readonly alerts: PhotoAlerts;
  readonly acked: string[][];
  readonly deferred: string[];
  readonly settings: number[];
  readonly env: () => PhotoEnv;
};

const bench = (entries: readonly Partial<NotebookEntry>[] = []): Bench => {
  const memory = new Map<string, string>();
  const acked: string[][] = [];
  const deferred: string[] = [];
  const settings: number[] = [];
  const alerts = createPhotoAlerts({
    storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) },
    sessionStartedAt: null,
    acknowledge: (ids) => void acked.push([...ids]),
  });
  const env = {
    notebook: {
      list: async () => entries as NotebookEntry[],
      defer: async (moment: PhotoMoment) => (deferred.push(moment.id), true),
      remove: async () => true,
    },
    now: () => new Date('2026-10-22T12:00:00.000Z'),
  } as unknown as PhotoEnv;
  return { alerts, acked, deferred, settings, env: () => env };
};

async function show(b: Bench, props: { readonly routeKey?: string; readonly bannerMs?: number } = {}) {
  const host = await mount(<GamePhotoAlertHost routeKey={props.routeKey ?? 'list'} alerts={b.alerts} env={b.env} bannerMs={props.bannerMs ?? 60_000} openSettings={() => b.settings.push(1)} signalKept={() => undefined} />);
  await settle();
  return host;
}

const reach = async (next: EngagementWithGame): Promise<void> => {
  await act(async () => appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, next));
  await settle();
};

describe('une étape passive', () => {
  test('la Flamme constatée à 7 jours : une bannière polie, aucune feuille modale, l’accusé part', async () => {
    const b = bench();
    const host = await show(b);
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    await reach(view({ streak: 7 }));
    const banner = host.querySelector('[data-photo-alert-banner="flame:7"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
    expect(b.acked).toEqual([['flame:7']]);
  });

  test('la bannière s’efface seule ; l’étape reste dans la file et la pastille s’allume', async () => {
    const b = bench();
    const host = await show(b, { bannerMs: 20 });
    await reach(view({ streak: 7 }));
    await settle(8);
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    expect(b.alerts.store.getState().pending?.propose.id).toBe('flame:7');
    expect(b.alerts.badge('u-viewer')).toBe(true);
    expect(b.alerts.store.getState().noticed).toEqual(['flame:7']);
  });

  test('hors d’un hub (Progression, composer, story…) : rien, l’étape attend', async () => {
    const b = bench();
    const host = await show(b, { routeKey: 'progression' });
    await reach(view({ streak: 7 }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    expect(b.alerts.store.getState().pending?.propose.id).toBe('flame:7');
    expect(b.acked).toEqual([]);
  });

  test('pendant un appel : rien ; l’appel fini, la bannière vient', async () => {
    const b = bench();
    callStore.setState({ waiting: { conversationId: 'c1' } as never });
    const host = await show(b);
    await reach(view({ streak: 7 }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    await act(async () => callStore.setState({ waiting: null }));
    await settle();
    expect(host.querySelector('[data-photo-alert-banner]')).not.toBeNull();
  });

  test('pendant une saisie : rien', async () => {
    const b = bench();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const host = await show(b);
    await act(async () => input.focus());
    await reach(view({ streak: 7 }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    input.remove();
  });

  test('push déjà envoyé, ou présentée sur un autre appareil : aucune bannière ici', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }, { moments: [{ stepId: 'flame:7', detectedAt: null, presentedAt: null, notifiedAt: '2026-10-22T10:00:00.000Z', keptAt: null }] }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    expect(b.alerts.store.getState().pending).toBeNull();
  });

  test('réglage « jamais » : aucune surface', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }, { invitations: 'never' }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
  });

  test('jeu masqué sur cet appareil : rien n’est lu, rien n’est montré', async () => {
    const b = bench();
    gamePrefs.set({ hidden: true });
    const host = await show(b);
    await reach(view({ streak: 7 }));
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    expect(b.alerts.store.getState().pending).toBeNull();
  });
});

describe('la feuille', () => {
  test('toucher la bannière ouvre la feuille : nommée, focalisée, avec l’aperçu de la carte et les trois gestes', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    const sheet = host.querySelector<HTMLElement>('[data-photo-alert-sheet="flame:7"]');
    expect(sheet?.getAttribute('role')).toBe('dialog');
    expect(sheet?.getAttribute('aria-label')).toBe('Flamme : 7 jours de Flamme. Immortaliser ce moment avec Mee et Meo ?');
    expect(document.activeElement).toBe(sheet);
    expect(sheet?.querySelector('[data-photo-frame="story"]')).not.toBeNull();
    expect(sheet?.querySelector('[data-photo-alert-start]')?.textContent).toBe('Immortaliser');
    expect(sheet?.querySelector('[data-photo-alert-sheet-later]')?.textContent).toBe('Plus tard');
    expect(sheet?.querySelector('[data-photo-alert-never]')?.textContent).toBe('Ne plus me proposer');
    expect(host.querySelector('[data-photo-alert-banner]')).toBeNull();
    expect(b.acked).toEqual([['flame:7']]);
  });

  test('l’annonce et la proposition diffèrent : la phrase de reprise nomme l’étape proposée', async () => {
    const b = bench();
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view({ mintedLifetime: 9 }));
    const host = await show(b);
    await reach(view({ mintedLifetime: 10 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    expect(host.querySelector('[data-photo-alert-resume="meesh:1"]')?.textContent).toBe('Ta Chronique reprend à Ma première Meesh : on l’immortalise ?');
    expect(b.acked).toEqual([['meesh:10', 'meesh:1']]);
  });

  test('Échap vaut « Plus tard » : la feuille se ferme, l’étape attend au carnet, la file se libère', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    const sheet = host.querySelector<HTMLElement>('[data-photo-alert-sheet]');
    await act(async () => {
      sheet?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(host.querySelector('[data-photo-alert-sheet]')).toBeNull();
    expect(b.alerts.store.getState().pending).toBeNull();
    expect(b.deferred).toEqual(['flame:7']);
  });

  test('« Immortaliser » libère la file et ouvre le déroulé du moment proposé', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    await click(host.querySelector('[data-photo-alert-start]'));
    await settle();
    expect(host.querySelector('[data-photo-alert-sheet]')).toBeNull();
    expect(b.alerts.store.getState().pending).toBeNull();
    expect(host.querySelector('[data-photo-alert-flow="flame:7"]')).not.toBeNull();
  });

  test('« Ne plus me proposer » OUVRE le réglage et n’agit jamais en silence', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    await click(host.querySelector('[data-photo-alert-never]'));
    expect(b.settings).toEqual([1]);
    expect(host.querySelector('[data-photo-alert-sheet]')).toBeNull();
    expect(appQueryClient.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.photo?.invitations ?? 'every').toBe('every');
  });

  test('aucune surface n’annonce un « nouveau pack » ni un « nouveau cadre »', async () => {
    const b = bench();
    const host = await show(b);
    await reach(view({ streak: 7 }));
    await click(host.querySelector('[data-photo-alert-open]'));
    expect(host.textContent ?? '').not.toMatch(/nouveau (pack|cadre)/i);
  });
});
