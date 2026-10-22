import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import { createOfflineQueue } from '@/lib/offline-queue';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { acknowledgePresented, flushPhotoWrites, keptToSignal, setInvitations, signalKept, type PhotoWriteDeps } from './alert-acks';

/**
 * LES ÉCRITURES DU REGISTRE PARTAGÉ (#10174, L18) — cache d'abord, réseau ensuite, file hors ligne, 404 muet.
 */
const view = (): EngagementWithGame => ({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockFixture() });

const bench = (over: { readonly online?: boolean; readonly reply?: RoutedReply } = {}) => {
  const client = new QueryClient();
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view());
  const routed = routedTransport(over.reply ?? ((req) => (pathOf(req).startsWith('/api/v1/me/game/photo-moments/') ? { ok: true, data: { presented: [], kept: [], invitations: 'never' } } : undefined)));
  let n = 0;
  const deps: PhotoWriteDeps = {
    transport: routed.transport,
    client,
    queue: createOfflineQueue(),
    isOnline: () => over.online ?? true,
    requestId: () => `req-${(n += 1)}`,
    now: () => new Date('2026-10-22T12:00:00.000Z'),
  };
  const photo = () => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.photo;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { deps, routed, photo, tick };
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
    acknowledgePresented(Array.from({ length: 70 }, (_, i) => `meesh:${i + 1}`), b.deps);
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
