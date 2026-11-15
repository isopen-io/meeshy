import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createOfflineQueue, type OfflineQueue } from '@/lib/offline-queue';
import type { SafeStorage } from '@/lib/storage';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import {
  acknowledgePresented,
  flushPhotoWrites,
  keptToSignal,
  parsePhotoWriteJob,
  setInvitations,
  signalKept,
  watchPhotoWrites,
  type PhotoWriteDeps,
  type PhotoWriteJob,
} from './alert-acks';

/**
 * LES ÉCRITURES DU REGISTRE PARTAGÉ (#10174, L18) — cache d'abord, réseau ensuite, file hors ligne, 404 muet.
 */
const view = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockFixture() });

const bench = (over: { readonly online?: boolean; readonly reply?: RoutedReply; readonly queue?: OfflineQueue<PhotoWriteJob>; readonly now?: string } = {}) => {
  let online = over.online ?? true;
  const client = new QueryClient();
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view());
  const routed = routedTransport(over.reply ?? ((req) => (pathOf(req).startsWith('/api/v1/me/game/photo-moments/') ? { ok: true, data: { presented: [], kept: [], invitations: 'never' } } : undefined)));
  let n = 0;
  const deps: PhotoWriteDeps = {
    transport: routed.transport,
    client,
    queue: over.queue ?? createOfflineQueue(),
    isOnline: () => online,
    requestId: () => `req-${(n += 1)}`,
    now: () => new Date(over.now ?? '2026-10-22T12:00:00.000Z'),
  };
  const goOnline = () => {
    online = true;
  };
  const photo = () => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.photo;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { deps, routed, photo, tick, client, goOnline };
};

describe('l’accusé de présentation', () => {
  test('pose `presentedAt` dans le cache avant la réponse, puis poste les identifiants sur la route du contrat', async () => {
    const b = bench();
    acknowledgePresented(['meesh:10', 'meesh:1', 'meesh:10'], b.deps);
    expect(b.photo()?.moments.map((m) => [m.stepId, m.presentedAt])).toEqual([
      ['meesh:10', '2026-10-22T12:00:00.000Z'],
      ['meesh:1', '2026-10-22T12:00:00.000Z'],
    ]);
    await b.tick();
    expect(b.routed.calls().map((c) => [c.method, pathOf(c)])).toEqual([['POST', `/api/v1${GAME_PHOTO_ROUTES.photoPresented}`]]);
    expect(b.routed.calls()[0]?.body).toMatchObject({ stepIds: ['meesh:10', 'meesh:1'] });
  });

  test('hors ligne, l’accusé attend dans la file et part au retour du réseau', async () => {
    const b = bench({ online: false });
    acknowledgePresented(['flame:7'], b.deps);
    expect(b.routed.calls()).toEqual([]);
    expect(b.deps.queue.size()).toBe(1);
    await flushPhotoWrites(b.deps);
    expect(b.routed.calls()).toHaveLength(1);
    expect(b.deps.queue.size()).toBe(0);
  });

  test('un ancien serveur (404) abandonne sans bruit ; une panne (503) remet le job en file', async () => {
    const old = bench({ reply: () => ({ ok: false, status: 404, error: 'Not found', code: 'NOT_FOUND' }) });
    acknowledgePresented(['flame:7'], old.deps);
    await old.tick();
    expect(old.deps.queue.size()).toBe(0);
    const down = bench({ reply: () => ({ ok: false, status: 503, error: 'down' }) });
    acknowledgePresented(['flame:7'], down.deps);
    await down.tick();
    expect(down.deps.queue.size()).toBe(1);
  });

  test('plus de 64 étapes partent en plusieurs lots', async () => {
    const b = bench();
    acknowledgePresented(Array.from({ length: 70 }, (_, i) => `meesh:${(i + 1) * 10}`), b.deps);
    await b.tick();
    expect(b.routed.calls().map((c) => ((c.body as { stepIds: string[] }).stepIds.length))).toEqual([64, 6]);
  });
});

describe('le signal « immortalisée » et le réglage', () => {
  test('`keptAt` se pose dans le cache, l’identifiant seul part ; une étape déjà gardée côté serveur ne repart pas', async () => {
    const b = bench();
    signalKept(['flame:7'], b.deps);
    expect(b.photo()?.moments.find((m) => m.stepId === 'flame:7')?.keptAt).toBe('2026-10-22T12:00:00.000Z');
    await b.tick();
    expect(Object.keys(b.routed.calls()[0]?.body as object).sort()).toEqual(['requestId', 'stepIds']);
    expect(keptToSignal(['flame:7', 'meesh:1'], b.photo()?.moments ?? [])).toEqual(['meesh:1']);
  });

  test('le réglage d’invitation se pose dans le cache puis part en PUT ; deux changements rapides hors ligne ne gardent que le dernier', async () => {
    const b = bench({ online: false });
    setInvitations('major', b.deps);
    setInvitations('never', b.deps);
    expect(b.photo()?.invitations).toBe('never');
    expect(b.deps.queue.size()).toBe(1);
    await flushPhotoWrites(b.deps);
    expect(b.routed.calls().map((c) => [c.method, (c.body as { invitations: string }).invitations])).toEqual([['PUT', 'never']]);
  });
});

/**
 * LE CONTRAT DU REGISTRE (`packages/shared/utils/game/photo-step-ids.ts`) : « les clients filtrent avec la même
 * fonction avant d'accuser : une identité refusée ferait tomber tout le lot ». Une réalisation du jour gardée il y a
 * plus de deux jours faisait refuser tout le carnet en 400, à chaque séance.
 */
describe('seules les identités que le registre accepte partent', () => {
  const lotOf = (b: ReturnType<typeof bench>): readonly (readonly string[])[] => b.routed.calls().map((c) => (c.body as { stepIds: string[] }).stepIds);

  test('un jour ancien parmi les étapes gardées ne fait pas tomber le lot : les autres partent, lui reste sur l’appareil', async () => {
    const b = bench({ now: '2026-10-25T12:00:00.000Z' });
    signalKept(['day:2026-10-01', 'rank:voix:3', 'flame:7'], b.deps);
    await b.tick();
    expect(lotOf(b)).toEqual([['rank:voix:3', 'flame:7']]);
    expect(b.deps.queue.size()).toBe(0);
  });

  test('l’accusé suit la même règle, et un lot sans aucune identité recevable ne part pas', async () => {
    const b = bench({ now: '2026-10-25T12:00:00.000Z' });
    acknowledgePresented(['day:2026-10-01', 'inventee:1'], b.deps);
    acknowledgePresented(['day:2026-10-24', 'day:2026-10-01'], b.deps);
    await b.tick();
    expect(lotOf(b)).toEqual([['day:2026-10-24']]);
  });

  test('un accusé mis en file la veille se relit au jour du REJEU : ce qui a vieilli hors fenêtre ne part plus', async () => {
    const queue = createOfflineQueue<PhotoWriteJob>();
    acknowledgePresented(['day:2026-10-22', 'flame:7'], bench({ online: false, queue }).deps);
    const later = bench({ queue, now: '2026-10-26T08:00:00.000Z' });
    await flushPhotoWrites(later.deps);
    expect(lotOf(later)).toEqual([['flame:7']]);
  });
});

const memoryStorage = (): SafeStorage => {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
};

/**
 * LE REJEU EST CÂBLÉ (#10174) — rien n'appelle la file à la main : le retour du réseau, une lecture fraîche du
 * jeu ou le début de la séance la vident, et ce qu'elle porte encore reste AFFICHÉ par-dessus ce que le serveur
 * relit (sinon « ton choix partira avec la connexion » revenait à l'ancienne valeur sans le dire).
 */
describe('le rejeu de la file', () => {
  test('hors ligne, le signal « immortalisée » part au retour du réseau, sans que personne ne vide la file', async () => {
    const b = bench({ online: false });
    const target = new EventTarget();
    const stop = watchPhotoWrites(() => b.deps, target);
    signalKept(['flame:7'], b.deps);
    expect(b.routed.calls()).toEqual([]);
    b.goOnline();
    target.dispatchEvent(new Event('online'));
    await b.tick();
    expect(b.routed.calls().map((c) => pathOf(c))).toEqual([`/api/v1${GAME_PHOTO_ROUTES.photoKept}`]);
    expect(b.deps.queue.size()).toBe(0);
    stop();
  });

  test('un réglage refusé par une panne reste affiché par-dessus la relecture du serveur, et repart avec elle', async () => {
    let down = true;
    const b = bench({
      reply: (req) => (down ? { ok: false, status: 503, error: 'down' } : pathOf(req).endsWith('/invitations') ? { ok: true, data: { invitations: 'never' } } : undefined),
    });
    const stop = watchPhotoWrites(() => b.deps, new EventTarget());
    setInvitations('never', b.deps);
    await b.tick();
    expect(b.deps.queue.size()).toBe(1);
    down = false;
    await b.client.fetchQuery({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY, queryFn: async () => view(), staleTime: 0 });
    expect(b.photo()?.invitations).toBe('never');
    await b.tick();
    await b.tick();
    expect(b.routed.calls().filter((c) => c.method === 'PUT').map((c) => (c.body as { invitations: string }).invitations)).toEqual(['never', 'never']);
    expect(b.deps.queue.size()).toBe(0);
    stop();
  });

  test('une écriture mise en file survit au rechargement et part au début de la séance suivante', async () => {
    const storage = memoryStorage();
    const persisted = () => createOfflineQueue<PhotoWriteJob>({ storage, key: 'photo-writes', parse: parsePhotoWriteJob });
    signalKept(['flame:7'], bench({ online: false, queue: persisted() }).deps);
    const next = bench({ queue: persisted() });
    expect(next.deps.queue.size()).toBe(1);
    const stop = watchPhotoWrites(() => next.deps, new EventTarget());
    await next.tick();
    expect(next.routed.calls().map((c) => (c.body as { stepIds: string[] }).stepIds)).toEqual([['flame:7']]);
    expect(persisted().size()).toBe(0);
    stop();
  });

  test('une entrée stockée qui n’a pas la forme d’une écriture est écartée', () => {
    expect(parsePhotoWriteJob({ kind: 'kept', stepIds: ['flame:7'], requestId: 'r' })).toEqual({ kind: 'kept', stepIds: ['flame:7'], requestId: 'r' });
    expect(parsePhotoWriteJob({ kind: 'invitations', invitations: 'never', requestId: 'r' })).toEqual({ kind: 'invitations', invitations: 'never', requestId: 'r' });
    expect(parsePhotoWriteJob({ kind: 'invitations', invitations: 'toujours', requestId: 'r' })).toBeNull();
    expect(parsePhotoWriteJob({ kind: 'kept', stepIds: [7], requestId: 'r' })).toBeNull();
    expect(parsePhotoWriteJob({ kind: 'effacer', stepIds: [], requestId: 'r' })).toBeNull();
    expect(parsePhotoWriteJob('kept')).toBeNull();
  });
});
