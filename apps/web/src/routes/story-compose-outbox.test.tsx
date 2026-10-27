import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { memoryDeviceRecords, type DeviceRecords } from '@/lib/send/send-queue';
import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { createStudioOutbox } from '@/lib/stories/studio-outbox';
import { VIEWER_ID, flush, harness, image, mount, publishButton, registerStudioBench, selectFile, typeText, unmountAll } from '@/test-support/story-studio-bench';

/**
 * **UNE PUBLICATION NE SE PERD JAMAIS AVANT D'ÊTRE PUBLIÉE** (#13416) — une
 * création et ses médias restent sur l'appareil jusqu'à la confirmation du
 * serveur ou jusqu'à leur suppression EXPLICITE par l'auteur. Le rechargement
 * se rejoue en démontant le studio puis en le remontant sur les MÊMES
 * magasins (brouillon, publications non envoyées) et un réseau neuf.
 */

registerStudioBench();

function goOffline(): void {
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));
}

function goOnline(): void {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  window.dispatchEvent(new Event('online'));
}

const device = () => ({ drafts: createStudioDraftStore(null), outbox: createStudioOutbox(memoryDeviceRecords()) });

describe('StoryComposeScreen — une publication en cours se retrouve après un rechargement (#13416)', () => {
  test('un média choisi, la page rechargée pendant sa montée : il revient, remonte, et part avec la publication', async () => {
    const stores = device();
    const before = harness({ ...stores, uploadsHold: () => true });
    const first = mount(before.deps, 'POST');
    selectFile(first, 'visual', image());
    await flush(() => before.uploadCreations() === 1);
    unmountAll();

    const after = harness(stores);
    const el = mount(after.deps, 'POST');
    await flush(() => after.uploadCreations() === 1);
    expect(after.uploadCreations()).toBe(1);
    await flush(() => publishButton(el)?.disabled === false);
    act(() => publishButton(el)!.click());
    await flush(() => after.posts.length === 1);
    expect(after.posts[0]!.mediaIds).toEqual(['pm-1']);
    expect(await stores.outbox.load(VIEWER_ID)).toBeNull();
  });

  test('armée hors ligne puis la page rechargée : elle attend encore le réseau, et part seule à son retour', async () => {
    const stores = device();
    goOffline();
    const before = harness({ ...stores, uploadsHold: () => true });
    const first = mount(before.deps, 'POST');
    typeText(first, 'Écrit dans le métro');
    selectFile(first, 'visual', image());
    act(() => publishButton(first)!.click());
    await flush();
    unmountAll();

    const after = harness(stores);
    const el = mount(after.deps, 'POST');
    await flush(() => el.querySelector('[data-studio-pending]') !== null);
    expect(el.querySelector('[data-studio-pending]')?.getAttribute('data-studio-pending')).toBe('awaiting');
    expect(after.posts).toHaveLength(0);

    act(() => goOnline());
    await flush(() => after.posts.length === 1);
    expect(after.posts[0]!.mediaIds).toEqual(['pm-1']);
  });

  test('l’envoi retiré n’est pas rejoué au rechargement, mais le brouillon et son média restent', async () => {
    const stores = device();
    goOffline();
    const before = harness({ ...stores, uploadsHold: () => true });
    const first = mount(before.deps, 'POST');
    selectFile(first, 'visual', image());
    act(() => publishButton(first)!.click());
    await flush();
    act(() => first.querySelector<HTMLButtonElement>('[data-studio-cancel-send]')!.click());
    await flush();
    unmountAll();

    goOnline();
    const after = harness(stores);
    mount(after.deps, 'POST');
    await flush(() => after.uploadCreations() === 1);
    await flush();
    expect(after.uploadCreations()).toBe(1);
    expect(after.posts).toHaveLength(0);
  });

  test('ÉCHOUÉE puis la page rechargée : elle est PROPOSÉE — Réessayer la publie', async () => {
    const stores = device();
    const before = harness({ ...stores, postsStatus: () => 500 });
    const first = mount(before.deps, 'POST');
    selectFile(first, 'visual', image());
    await flush(() => publishButton(first)?.disabled === false);
    act(() => publishButton(first)!.click());
    await flush(() => before.posts.length === 1);
    await flush();
    unmountAll();

    const after = harness(stores);
    const el = mount(after.deps, 'POST');
    await flush(() => el.querySelector('[data-studio-unsent]') !== null);
    expect(el.querySelector('[data-studio-unsent]')?.textContent).toContain('Publication non envoyée');
    await flush();
    expect(after.posts).toHaveLength(0);
    act(() => el.querySelector<HTMLButtonElement>('[data-studio-unsent-retry]')!.click());
    await flush(() => after.posts.length === 1);
    expect(after.posts[0]!.mediaIds).toEqual(['pm-1']);
    expect(el.querySelector('[data-studio-unsent]')).toBeNull();
  });

  test('ÉCHOUÉE puis la page rechargée : Supprimer efface le brouillon et ses médias de l’appareil', async () => {
    const stores = device();
    const before = harness({ ...stores, postsStatus: () => 500 });
    const first = mount(before.deps, 'POST');
    typeText(first, 'À oublier');
    selectFile(first, 'visual', image());
    await flush(() => publishButton(first)?.disabled === false);
    act(() => publishButton(first)!.click());
    await flush(() => before.posts.length === 1);
    await flush();
    unmountAll();

    const after = harness(stores);
    const el = mount(after.deps, 'POST');
    await flush(() => el.querySelector('[data-studio-unsent-discard]') !== null);
    act(() => el.querySelector<HTMLButtonElement>('[data-studio-unsent-discard]')!.click());
    await flush();
    expect(el.querySelector('[data-studio-unsent]')).toBeNull();
    expect(el.querySelector('[data-scene-text]')?.textContent ?? '').toBe('');
    expect(stores.drafts.get(VIEWER_ID)).toBeNull();
    expect(await stores.outbox.load(VIEWER_ID)).toBeNull();
  });

  test('un appareil qui refuse de garder les médias (navigation privée) : le studio marche, et le DIT', async () => {
    const refusing: DeviceRecords = { load: async () => undefined, save: () => Promise.reject(new DOMException('plein', 'QuotaExceededError')) };
    const bench = harness({ outbox: createStudioOutbox(refusing), uploadsHold: () => true });
    const el = mount(bench.deps, 'POST');
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-studio-volatile]') !== null);
    expect(el.querySelector('[data-studio-volatile]')?.textContent).toContain('ne rechargez pas la page');
    expect(bench.uploadCreations()).toBe(1);
  });
});
