import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { flush, harness, mount, publishButton, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * **LA PUBLICATION EN ATTENTE SE RETIRE** (#10316) — composée hors ligne, elle
 * attend le réseau dans le composer ; l'auteur la VOIT en attente et la
 * RETIRE. Retirée, elle ne part jamais au retour du réseau ; retirée pendant
 * l'envoi, la requête est coupée — et si le serveur l'avait déjà reçue, le
 * rechargement la montre en ligne (le serveur fait foi). Le rejeu du même
 * contenu garde sa clé d'idempotence.
 */

registerStudioBench();

const cancelButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-studio-cancel-send]');

function goOffline(): void {
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));
}

function goOnline(): void {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  window.dispatchEvent(new Event('online'));
}

describe('StoryComposeScreen — la publication en attente se voit et se retire (#10316)', () => {
  test('armée hors ligne, elle se DIT en attente et offre son retrait', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const el = mount(harness({}).deps);
    typeText(el, 'Écrit dans le métro');
    expect(cancelButton(el)).toBeNull();
    act(() => publishButton(el)!.click());
    await flush();
    expect(el.querySelector('[data-studio-pending]')?.getAttribute('data-studio-pending')).toBe('awaiting');
    expect(cancelButton(el)?.textContent).toBe('Annuler l’envoi');
  });

  test('retirée AVANT le retour du réseau, rien ne part — et le brouillon reste', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Finalement plus tard');
    act(() => publishButton(el)!.click());
    await flush();
    act(() => cancelButton(el)!.click());
    expect(publishButton(el)?.textContent).not.toBe('En attente du réseau…');
    expect(cancelButton(el)).toBeNull();

    act(() => goOnline());
    await flush();
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Finalement plus tard');
  });

  test('retirée PENDANT l’envoi du retour du réseau, la requête en vol est COUPÉE et rien ne repart', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({ postsHold: () => true });
    const el = mount(bench.deps);
    typeText(el, 'Partie au mauvais moment');
    act(() => publishButton(el)!.click());
    await flush();

    act(() => goOnline());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    expect(el.querySelector('[data-studio-pending]')?.getAttribute('data-studio-pending')).toBe('sending');

    act(() => cancelButton(el)!.click());
    await flush();
    expect(bench.postAborts()).toBe(1);
    expect(cancelButton(el)).toBeNull();
    expect(publishButton(el)?.disabled).toBe(false);

    act(() => goOffline());
    act(() => goOnline());
    await flush();
    expect(bench.posts).toHaveLength(1);
  });

  test('une annulation en vol relit les plateaux : si le serveur l’avait reçue, elle apparaît en ligne', async () => {
    appQueryClient.setQueryData(['stories', 'tray-temoin'], { groups: [] });
    const bench = harness({ postsHold: () => true });
    const el = mount(bench.deps);
    typeText(el, 'Reçue juste avant');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);

    act(() => cancelButton(el)!.click());
    await flush();
    expect(appQueryClient.getQueryState(['stories', 'tray-temoin'])?.isInvalidated).toBe(true);
    appQueryClient.removeQueries({ queryKey: ['stories', 'tray-temoin'] });
  });

  test('republier le MÊME contenu après une annulation en vol garde la clé d’idempotence', async () => {
    let holding = true;
    const bench = harness({ postsHold: () => holding });
    const el = mount(bench.deps);
    typeText(el, 'Une seule fois');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    act(() => cancelButton(el)!.click());
    await flush();

    holding = false;
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 1);
    expect(bench.postMutationIds).toHaveLength(2);
    expect(bench.postMutationIds[0]).toMatch(/^cmid_/);
    expect(bench.postMutationIds[1]).toBe(bench.postMutationIds[0]!);
  });

  test('l’issue TARDIVE d’un envoi annulé ne retire pas le geste d’annulation du nouvel envoi', async () => {
    const bench = harness({ postsHold: () => true });
    const el = mount(bench.deps);
    typeText(el, 'Deux essais');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    act(() => cancelButton(el)!.click());
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 1);
    await flush();
    expect(el.querySelector('[data-studio-pending]')?.getAttribute('data-studio-pending')).toBe('sending');
    expect(cancelButton(el)).not.toBeNull();
  });

  test('un envoi qui ABOUTIT ne laisse aucun retrait offert', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Partie sans encombre');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    await flush();
    expect(cancelButton(el)).toBeNull();
  });
});
