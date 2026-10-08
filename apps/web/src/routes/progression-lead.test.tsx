import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';

import { ONBOARDING_STEP_KEYS } from '@meeshy/shared/utils/game/guide';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { PhotoEnv } from '@/lib/game-photo/env';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { GameLead } from './progression-lead';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const ALL_STEPS = ONBOARDING_STEP_KEYS.map((key) => `onboarding.${key}`);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
const by = (host: ParentNode, attribute: string) => host.querySelector<HTMLElement>(`[${attribute}]`);

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
});

function bench(initial: EngagementWithGame) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, initial);
  const { transport } = routedTransport((req) =>
    pathOf(req) === '/api/v1/me/game/guide/seen' ? { ok: true, data: { guideSeen: (req.body as { keys: string[] }).keys } } : undefined,
  );
  const log = { navigated: [] as string[], scrolled: [] as string[], deferred: [] as PhotoMoment[], known: [] as string[] };
  const env = {
    notebook: {
      list: async () => log.known.map((momentId) => ({ momentId }) as NotebookEntry),
      defer: async (moment: PhotoMoment) => (log.deferred.push(moment), true),
      keep: async () => true,
      remove: async () => true,
    },
    openCamera: async () => ({ ok: false as const, reason: 'unsupported' as const }),
    now: () => new Date('2026-10-05T10:00:00.000Z'),
    playOptions: { reducedMotion: false, haptics: false, schedule: (run: () => void) => (run(), () => undefined) },
  } as unknown as PhotoEnv;
  return { client, transport, env, log };
}

async function render(initial: EngagementWithGame, mountView: EngagementWithGame = initial) {
  const b = bench(initial);
  let setView: (next: EngagementWithGame) => void = () => undefined;
  const { useState } = await import('react');
  function Host() {
    const [shown, set] = useState(mountView);
    setView = set;
    return <GameLead view={shown} env={() => b.env} transport={b.transport} navigateTo={(to) => b.log.navigated.push(to)} openConcept={(concept) => b.log.scrolled.push(concept)} />;
  }
  const host = await mount(
    <QueryClientProvider client={b.client}>
      <Host />
    </QueryClientProvider>,
  );
  await settle();
  return {
    ...b,
    host,
    show: async (next: EngagementWithGame) => {
      await act(async () => setView(next));
      await settle();
    },
  };
}

/**
 * LE GUIDE ET LES PHOTOS SUR « PROGRESSION » (#9379, #9382) — l'assemblage :
 * la carte de Mee et Meo, les propositions de photo après la célébration, le
 * déroulé de la photo. Jamais plus d'UNE carte ; jamais deux propositions pour
 * le même moment.
 */
describe('l’intégration, carte après carte', () => {
  test('un compte neuf : la carte de bienvenue', async () => {
    const r = await render(view({ guideSeen: [] }));
    expect(r.host.querySelector('[data-game-guide="onboarding.welcome"]')).not.toBeNull();
  });

  test('« Passer » montre l’étape suivante', async () => {
    const r = await render(view({ guideSeen: [] }));
    await click(by(r.host, 'data-game-guide-dismiss'));
    await settle();
    expect(r.host.querySelector('[data-game-guide="onboarding.first-points"]')).not.toBeNull();
  });

  test('le bouton d’une étape mène : la première, ailleurs — la liste des conversations', async () => {
    const r = await render(view({ guideSeen: [] }));
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.log.navigated).toEqual(['list']);
  });

  test('une étape qui attend son geste : son bouton y mène SANS l’écarter — la carte reste jusqu’au geste', async () => {
    const fresh: EngagementWithGame = {
      ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
      isEmpty: true,
      game: gameBlockFixture({ score: 0, debitablePoints: 0, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, lastActiveDay: null, missions: [], guideSeen: [] }),
    };
    const r = await render(fresh);
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.log.navigated).toEqual(['list']);
    expect(r.host.querySelector('[data-game-guide="onboarding.welcome"]')).not.toBeNull();
  });

  test('la mission facile attendue : le bouton fait défiler jusqu’aux missions, la carte reste', async () => {
    const seen = ALL_STEPS.slice(0, 4);
    const waiting: EngagementWithGame = {
      ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
      game: gameBlockFixture({
        score: 800,
        guideSeen: seen,
        missions: [
          { id: 'm-easy', difficulty: 'easy', templateKey: 'send-texts', signal: 'axis:content.text_message', prism: false, target: 5, progress: 1, reward: 36, glory: 0, completedAt: null },
        ],
      }),
    };
    const r = await render(waiting);
    expect(r.host.querySelector('[data-game-guide="onboarding.missions"]')).not.toBeNull();
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.log.scrolled).toEqual(['missions']);
    expect(r.host.querySelector('[data-game-guide="onboarding.missions"]')).not.toBeNull();
  });

  test('le bouton d’une étape sur l’écran fait défiler jusqu’à la carte visée', async () => {
    const r = await render(view({ guideSeen: ALL_STEPS.slice(0, 1) }));
    expect(r.host.querySelector('[data-game-guide="onboarding.first-points"]')).not.toBeNull();
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.log.scrolled).toEqual(['level']);
  });

  test('la dernière étape ouvre la photo de départ', async () => {
    const r = await render(view({ guideSeen: ALL_STEPS.slice(0, 6) }));
    expect(r.host.querySelector('[data-game-guide="onboarding.rank"]')).not.toBeNull();
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Photo : Mon départ sur Meeshy');
  });

  test('« Passer l’intégration » les écarte toutes', async () => {
    const r = await render(view({ guideSeen: [] }));
    await click(by(r.host, 'data-game-guide-skip-all'));
    await settle();
    expect(r.host.querySelector('[data-game-guide^="onboarding."]')).toBeNull();
  });
});

describe('un moment qui se photographie', () => {
  const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'first-mint-possible', 'treasury-tier'];

  test('la carte du nouveau rang propose « Immortaliser » — et c’est ELLE qui propose, pas une seconde carte', async () => {
    const r = await render(view({ guideSeen: seen, glory: GLORY_RANKS[1].minGlory + 100, mintedLifetime: 3 }));
    expect(r.host.querySelector('[data-game-guide="new-rank"]')).not.toBeNull();
    expect(r.host.querySelector('[data-photo-offer]')).toBeNull();
  });

  test('le bouton principal du rang EST la photo : il ouvre le déroulé du rang', async () => {
    const r = await render(view({ guideSeen: seen, glory: GLORY_RANKS[1].minGlory + 100, mintedLifetime: 3 }));
    await click(by(r.host, 'data-game-guide-action'));
    await settle();
    expect(r.host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toMatch(/^Photo : /);
  });
});

describe('la proposition après la célébration', () => {
  const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier', 'first-mint-possible'];

  test('la Flamme franchit 7 jours : Mee propose', async () => {
    const r = await render(view({ guideSeen: seen, mintedLifetime: 3, streak: 6 }));
    expect(r.host.querySelector('[data-photo-offer]')).toBeNull();
    await r.show(view({ guideSeen: seen, mintedLifetime: 3, streak: 7 }));
    expect(r.host.querySelector('[data-photo-offer="flame:7"]')).not.toBeNull();
  });

  test('« Photographier » ouvre le déroulé et retire la proposition', async () => {
    const r = await render(view({ guideSeen: seen, mintedLifetime: 3, streak: 6 }));
    await r.show(view({ guideSeen: seen, mintedLifetime: 3, streak: 7 }));
    await click(by(r.host, 'data-photo-offer-start'));
    await settle();
    expect(r.host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Photo : 7 jours de Flamme');
    expect(r.host.querySelector('[data-photo-offer]')).toBeNull();
  });

  test('« Plus tard » laisse le moment en attente dans le carnet et retire la proposition', async () => {
    const r = await render(view({ guideSeen: seen, mintedLifetime: 3, streak: 6 }));
    await r.show(view({ guideSeen: seen, mintedLifetime: 3, streak: 7 }));
    await click(by(r.host, 'data-photo-offer-later'));
    await settle();
    expect(r.log.deferred.map((m) => m.id)).toEqual(['flame:7']);
    expect(r.host.querySelector('[data-photo-offer]')).toBeNull();
  });
});

/**
 * LA LIGNE DU GUIDE AU HÉROS (#5841) — Mee se pose sur le coin du héros et dit
 * la ligne COURTE de la carte du moment : le guide la remonte à l'écran, qui la
 * passe au héros. Pas de carte, pas de ligne : Mee propose alors les règles.
 */
describe('la ligne courte du guide est remontée au héros', () => {
  async function announced(initial: EngagementWithGame) {
    const b = bench(initial);
    const lines: (string | null)[] = [];
    const host = await mount(
      <QueryClientProvider client={b.client}>
        <GameLead view={initial} env={() => b.env} transport={b.transport} onGuideLine={(line) => lines.push(line)} />
      </QueryClientProvider>,
    );
    await settle();
    return { lines, host };
  }

  test('un compte neuf : la ligne courte de la carte de bienvenue', async () => {
    const { lines, host } = await announced(view({ guideSeen: [] }));
    expect(host.querySelector('[data-game-guide="onboarding.welcome"]')).not.toBeNull();
    const last = lines.at(-1);
    expect(typeof last).toBe('string');
    expect((last ?? '').length).toBeGreaterThan(0);
    expect(host.textContent).toContain(last ?? '\u0000');
  });

  test('quand la carte disparaît, la ligne disparaît avec elle', async () => {
    const { lines, host } = await announced(view({ guideSeen: [] }));
    await click(by(host, 'data-game-guide-skip-all'));
    await settle();
    expect(host.querySelector('[data-game-guide]')).toBeNull();
    expect(lines.at(-1)).toBeNull();
  });
});
