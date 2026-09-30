import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { clearConversationBanners, shellTray, workerTray, type BannerTray } from './conversation-banners';

/**
 * OUVRIR UNE CONVERSATION RETIRE SES BANNIÈRES (#8781) — iOS vide le fil
 * consommé du centre de notifications (#6999) ; le web et la coque Android
 * ferment les bannières dont le tag est la conversation lue.
 */

type Entry = { readonly tag: string | null; readonly id: string };

const fakeTray = (entries: readonly Entry[]) => {
  const removed: string[] = [];
  const tray: BannerTray<Entry> = {
    list: () => Promise.resolve(entries),
    tagOf: (entry) => entry.tag,
    remove: (chosen) => {
      removed.push(...chosen.map((entry) => entry.id));
      return Promise.resolve();
    },
  };
  return { tray, removed };
};

describe('clearConversationBanners — le fil lu quitte la barre de notifications', () => {
  test('les bannières taguées par la conversation se ferment', async () => {
    const { tray, removed } = fakeTray([
      { tag: 'conv-1', id: 'a' },
      { tag: 'conv-2', id: 'b' },
      { tag: 'conv-1', id: 'c' },
    ]);
    await clearConversationBanners('conv-1', tray);
    expect(removed).toEqual(['a', 'c']);
  });

  test('une bannière sans tag, ou d’une autre conversation, reste — et rien ne part quand rien ne correspond', async () => {
    const { tray, removed } = fakeTray([
      { tag: null, id: 'a' },
      { tag: 'notif-9', id: 'b' },
    ]);
    await clearConversationBanners('conv-1', tray);
    expect(removed).toEqual([]);
  });

  test('sans barre accessible, ou une barre qui échoue, rien ne lève', async () => {
    await expect(clearConversationBanners('conv-1', null)).resolves.toBeUndefined();
    const failing: BannerTray<Entry> = {
      list: () => Promise.reject(new Error('refused')),
      tagOf: (entry) => entry.tag,
      remove: () => Promise.reject(new Error('refused')),
    };
    await expect(clearConversationBanners('conv-1', failing)).resolves.toBeUndefined();
  });
});

describe('shellTray — la barre de la coque Android passe par PushNotifications', () => {
  const coque = (calls: { method: string; options: object }[], delivered: readonly object[]): CoqueNative => ({
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'PushNotifications', methods: [{ name: 'getDeliveredNotifications' }, { name: 'removeDeliveredNotifications' }] },
    ],
    nativePromise: (_plugin: string, method: string, options: object) => {
      calls.push({ method, options });
      return Promise.resolve(method === 'getDeliveredNotifications' ? { notifications: delivered } : {});
    },
  });

  test('les notifications du tag de la conversation sont retirées par leur tag et leur id', async () => {
    const calls: { method: string; options: object }[] = [];
    const delivered = [
      { id: 0, tag: 'conv-1', title: 'Awa' },
      { id: 0, tag: 'conv-2', title: 'Ben' },
    ];
    await clearConversationBanners('conv-1', shellTray(coque(calls, delivered)));
    expect(calls.map((call) => call.method)).toEqual(['getDeliveredNotifications', 'removeDeliveredNotifications']);
    expect(calls[1]?.options).toEqual({ notifications: [{ id: 0, tag: 'conv-1', title: 'Awa' }] });
  });

  test('une coque qui ne déclare pas les méthodes n’offre aucune barre', () => {
    expect(shellTray({ getPlatform: () => 'android', PluginHeaders: [] })).toBeNull();
    expect(shellTray(undefined)).toBeNull();
  });
});

describe('workerTray — la barre du web passe par le service worker', () => {
  test('les bannières du tag de la conversation se ferment', async () => {
    const closed: string[] = [];
    const banner = (tag: string) => ({ tag, close: () => closed.push(tag) });
    const registration = { getNotifications: () => Promise.resolve([banner('conv-1'), banner('conv-2')]) };
    await clearConversationBanners('conv-1', workerTray(() => Promise.resolve(registration)));
    expect(closed).toEqual(['conv-1']);
  });

  test('sans service worker inscrit, rien ne se ferme', async () => {
    await expect(clearConversationBanners('conv-1', workerTray(() => Promise.resolve(null)))).resolves.toBeUndefined();
  });
});

describe('le fil branche le retrait', () => {
  test('thread.tsx retire les bannières quand la frontière de lecture avance', () => {
    const source = readFileSync(new URL('../../routes/thread.tsx', import.meta.url), 'utf8');
    expect(source).toContain('clearConversationBanners(markedConversationId)');
  });
});
