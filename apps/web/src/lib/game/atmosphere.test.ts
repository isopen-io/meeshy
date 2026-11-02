import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import type { FramePackSummary } from '@/lib/api/packs-glory-frame';
import { createOfflineQueue } from '@/lib/offline-queue';
import type { SafeStorage } from '@/lib/storage';
import { routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import {
  ATMOSPHERE_SCREEN_SHOWINGS,
  atmosphereDeferralsOf,
  atmosphereMayBeOffered,
  atmosphereTilesOf,
  chooseAtmosphere,
  flushAtmosphereQueue,
  noteAtmosphereDeferred,
  shouldOfferAtmosphere,
  withAtmosphere,
  type AtmosphereJob,
} from './atmosphere';

/**
 * LE CHOIX D'ATMOSPHÈRE (#10163, L10b ; D7 #10182) — une préférence de COMPTE, Afrique éternelle par défaut,
 * « Choisir plus tard » sans enregistrement et écran reproposé UNE fois (compteur en mémoire appareil, par
 * compte) ; la choisir installe son pack dans la même écriture, optimiste, retour arrière sur refus, en file
 * hors ligne, et un ancien serveur (404) laisse le choix local.
 */
const memory = (): SafeStorage => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

const seed = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockWithExtrasFixture() });

const FRAME_KEYS = packQueryKeys('glory-frame');
const summary = (slug: string, installed: boolean): FramePackSummary => ({
  slug,
  name: slug,
  description: '',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 19,
  coverUrl: null,
  installed,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  downloadBytes: { story: 2_300_000, square: null },
  removable: slug !== 'afrique',
  names: {},
  preview: null,
  previewUrl: null,
  usage: null,
});

describe('l’écran se montre à Ambassadeur sans atmosphère, et se repropose une fois', () => {
  test('une étape de rang dès Ambassadeur sans atmosphère ⇒ l’écran ; avec une atmosphère, ou avant Ambassadeur, jamais', () => {
    expect(shouldOfferAtmosphere({ stepId: 'rank:ambassadeur:1', atmosphere: null, deferrals: 0 })).toBe(true);
    expect(shouldOfferAtmosphere({ stepId: 'rank:legende:3', atmosphere: null, deferrals: 0 })).toBe(true);
    expect(shouldOfferAtmosphere({ stepId: 'rank:ambassadeur:1', atmosphere: 'olympe', deferrals: 0 })).toBe(false);
    expect(shouldOfferAtmosphere({ stepId: 'rank:voix:2', atmosphere: null, deferrals: 0 })).toBe(false);
    expect(shouldOfferAtmosphere({ stepId: 'meesh:10', atmosphere: null, deferrals: 0 })).toBe(false);
  });

  test('« Choisir plus tard » compte : au-delà de deux passages, l’écran ne vit plus que dans les réglages', () => {
    expect(ATMOSPHERE_SCREEN_SHOWINGS).toBe(2);
    expect(shouldOfferAtmosphere({ stepId: 'rank:ambassadeur:1', atmosphere: null, deferrals: 1 })).toBe(true);
    expect(shouldOfferAtmosphere({ stepId: 'rank:ambassadeur:1', atmosphere: null, deferrals: 2 })).toBe(false);
  });

  test('le compteur vit sur l’appareil, PAR compte, et un stockage illisible vaut zéro', () => {
    const storage = memory();
    expect(atmosphereDeferralsOf(storage, 'u1')).toBe(0);
    noteAtmosphereDeferred(storage, 'u1');
    noteAtmosphereDeferred(storage, 'u1');
    expect(atmosphereDeferralsOf(storage, 'u1')).toBe(2);
    expect(atmosphereDeferralsOf(storage, 'u2')).toBe(0);
    storage.setItem('meeshy.game.atmosphere-deferred.u1', 'beaucoup');
    expect(atmosphereDeferralsOf(storage, 'u1')).toBe(0);
  });

  test('l’écran ne peut s’ouvrir que pour un compte dont le RANG photographie dans une atmosphère : avant Ambassadeur, jamais, même sans atmosphère', () => {
    const ambassador = gameBlockFixture({ glory: 130_000 });
    expect(ambassador.glory.rank).toBe('ambassadeur');
    expect(atmosphereMayBeOffered({ game: ambassador, deferrals: 0 })).toBe(true);
    expect(atmosphereMayBeOffered({ game: ambassador, deferrals: ATMOSPHERE_SCREEN_SHOWINGS })).toBe(false);
    expect(atmosphereMayBeOffered({ game: { ...ambassador, photo: { ...withAtmosphere({ ...seed(), game: ambassador }, 'olympe').game!.photo! } }, deferrals: 0 })).toBe(false);
    const voix = gameBlockFixture({ glory: 6_500 });
    expect(voix.glory.rank).toBe('voix');
    expect(atmosphereMayBeOffered({ game: voix, deferrals: 0 })).toBe(false);
    expect(atmosphereMayBeOffered({ game: null, deferrals: 0 })).toBe(false);
  });
});

describe('withAtmosphere', () => {
  test('pose l’atmosphère sur l’extension photo, et la crée avec ses défauts quand le serveur ne la sert pas', () => {
    const view = seed();
    const posed = withAtmosphere(view, 'olympe');
    expect(posed.game?.photo).toEqual({ atmosphere: 'olympe', invitations: 'every', baselineAt: null, baseline: null, treasuryPeakTier: null, moments: [] });
    const again = withAtmosphere(posed, 'neon');
    expect(again.game?.photo?.atmosphere).toBe('neon');
    expect(again.game?.photo?.invitations).toBe('every');
  });
});

describe('chooseAtmosphere : choisir = installer, optimiste', () => {
  const bench = (answer: RoutedReply, online = true) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, seed());
    client.setQueryData(FRAME_KEYS.catalogue, [summary('afrique', true), summary('olympe', false)]);
    client.setQueryData(FRAME_KEYS.installed, [summary('afrique', true)]);
    /* Des écrans ouverts sur ces clés, servis par un serveur qui ne connaît ni l'extension `photo` ni le pack : une
       invalidation les relit aussitôt, comme le hub et le carnet le feraient. */
    const watchOldServer = (): void => {
      new QueryObserver(client, { queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY, queryFn: async () => seed() }).subscribe(() => undefined);
      new QueryObserver(client, { queryKey: FRAME_KEYS.installed, queryFn: async () => [summary('afrique', true)] }).subscribe(() => undefined);
    };
    const settled = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      while (client.isFetching() > 0) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const routed = routedTransport(answer);
    const queue = createOfflineQueue<AtmosphereJob>();
    const bumps: number[] = [];
    const deps = { transport: routed.transport, client, queue, isOnline: () => online, requestId: () => 'req-a', onInstalled: () => void bumps.push(1) };
    const view = () => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
    const installed = () => (client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed) ?? []).map((pack) => pack.slug);
    return { client, deps, calls: routed.calls, queue, bumps, view, installed, watchOldServer, settled };
  };

  test('le serveur accepte : l’atmosphère et le pack installé se posent AVANT la réponse, l’étagère des cadres le sait', async () => {
    const b = bench(() => ({ ok: true, data: { atmosphere: 'olympe', packInstalled: true } }));
    const outcome = await chooseAtmosphere('olympe', b.deps);
    expect(outcome).toEqual({ status: 'saved', packInstalled: true });
    expect(b.view()?.game?.photo?.atmosphere).toBe('olympe');
    expect(b.installed()).toEqual(['afrique', 'olympe']);
    expect(b.calls()).toHaveLength(1);
    expect(b.calls()[0]?.body).toEqual({ requestId: 'req-a', atmosphere: 'olympe' });
    expect(b.bumps).toHaveLength(1);
  });

  test('le catalogue de la boutique sait le pack installé AVANT la réponse, puis se relit auprès du serveur : sa rangée ne contredit pas l’onglet', async () => {
    const seen: string[][] = [];
    const installedInCatalogue = (client: QueryClient) => (client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue) ?? []).filter((pack) => pack.installed).map((pack) => pack.slug);
    const b = bench(() => {
      seen.push(installedInCatalogue(b.client));
      return { ok: true, data: { atmosphere: 'olympe', packInstalled: true } };
    });
    await chooseAtmosphere('olympe', b.deps);
    expect(seen).toEqual([['afrique', 'olympe']]);
    expect(b.client.getQueryState(FRAME_KEYS.catalogue)?.isInvalidated).toBe(true);
  });

  test('un refus (409) remet aussi le catalogue de la boutique dans son état d’avant', async () => {
    const b = bench(() => ({ ok: false, status: 409, error: 'refus', code: 'GAME_WRITE_CONFLICT' }));
    await chooseAtmosphere('olympe', b.deps);
    expect((b.client.getQueryData<readonly FramePackSummary[]>(FRAME_KEYS.catalogue) ?? []).find((pack) => pack.slug === 'olympe')?.installed).toBe(false);
  });

  test('un refus (409) remet l’état d’avant : ni atmosphère, ni pack', async () => {
    const b = bench(() => ({ ok: false, status: 409, error: 'refus', code: 'GAME_WRITE_CONFLICT' }));
    const outcome = await chooseAtmosphere('olympe', b.deps);
    expect(outcome.status).toBe('refused');
    expect(b.view()?.game?.photo).toBeUndefined();
    expect(b.installed()).toEqual(['afrique']);
    expect(b.queue.size()).toBe(0);
  });

  test('hors ligne : UNE seule écriture en file, le choix reste local ; au retour du réseau la file se vide et l’étagère se relit', async () => {
    const b = bench(() => ({ ok: true, data: { atmosphere: 'neon', packInstalled: true } }), false);
    expect(await chooseAtmosphere('olympe', b.deps)).toEqual({ status: 'queued' });
    expect(await chooseAtmosphere('neon', b.deps)).toEqual({ status: 'queued' });
    expect(b.calls()).toHaveLength(0);
    expect(b.queue.size()).toBe(1);
    expect(b.view()?.game?.photo?.atmosphere).toBe('neon');
    await flushAtmosphereQueue({ ...b.deps, isOnline: () => true });
    expect(b.calls().map((call) => call.body)).toEqual([{ requestId: 'req-a', atmosphere: 'neon' }]);
    expect(b.queue.size()).toBe(0);
    expect(b.bumps).toHaveLength(1);
  });

  test('une panne réseau en vol met l’écriture en file au lieu de défaire le choix', async () => {
    const b = bench(() => ({ ok: false, status: 0, error: 'réseau' }));
    expect(await chooseAtmosphere('olympe', b.deps)).toEqual({ status: 'queued' });
    expect(b.view()?.game?.photo?.atmosphere).toBe('olympe');
    expect(b.queue.size()).toBe(1);
  });

  test('un ancien serveur (404) : le choix reste local APRÈS relecture — rien n’est invalidé, l’époque du catalogue n’avance pas, la file est vide', async () => {
    const b = bench(() => ({ ok: false, status: 404, error: 'Not found' }));
    b.watchOldServer();
    expect(await chooseAtmosphere('olympe', b.deps)).toEqual({ status: 'saved', packInstalled: false });
    await b.settled();
    expect(b.view()?.game?.photo?.atmosphere).toBe('olympe');
    expect(b.installed()).toEqual(['afrique', 'olympe']);
    expect(b.bumps).toHaveLength(0);
    expect(b.queue.size()).toBe(0);
  });

  test('le serveur accepte : la relecture auprès de lui remplace l’optimiste (le choix écrit se relit), l’époque avance', async () => {
    const b = bench(() => ({ ok: true, data: { atmosphere: 'olympe', packInstalled: true } }));
    b.watchOldServer();
    await chooseAtmosphere('olympe', b.deps);
    await b.settled();
    expect(b.installed()).toEqual(['afrique']);
    expect(b.bumps).toHaveLength(1);
  });
});

describe('atmosphereTilesOf : la même valeur de rangée que la boutique', () => {
  test('sept tuiles dans l’ordre fermé ; un pack connu porte sa couverture, sa présence et son poids ; un pack inconnu garde sa tuile', () => {
    const tiles = atmosphereTilesOf({ catalogue: [summary('afrique', true), { ...summary('olympe', false), coverUrl: '/packs/olympe.webp' }], installed: [summary('neon', true)], origin: 'https://gate.example' });
    expect(tiles.map((tile) => tile.atmosphere)).toEqual(['afrique', 'egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon']);
    expect(tiles[0]).toMatchObject({ installed: true, removable: false, downloadBytes: 2_300_000, cover: null });
    expect(tiles[2]).toMatchObject({ installed: false, removable: true, cover: 'https://gate.example/packs/olympe.webp' });
    expect(tiles[1]).toEqual({ atmosphere: 'egypte', cover: null, installed: null, removable: true, downloadBytes: null });
    expect(tiles[6]?.installed).toBe(true);
  });
});
