import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import * as storySaveStore from '@/lib/stories/save-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryOwnerRail, type StoryOwnerRailState } from './use-story-owner-rail';

/**
 * `useStoryOwnerRail` (#7116) — extrait de `routes/story.tsx` (§ périmètre de
 * la spécification, déjà hors budget avant ce lot). Ce témoin mesure le
 * CÂBLAGE (pause/reprise, idempotence, annonces) ; les lois pures qu'il
 * COMPOSE — `resolveStoryExportRailButtons`, `downloadFile`,
 * `fileDeliveryPortal`, `storySaveStore`, `shareStory` — sont éprouvées
 * chacune séparément.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  // `downloadFile` refuse SANS identité (§ `no-identity`, `refused`) : une
  // session invitée suffit — c'est le crédential que le port lit, jamais le
  // rôle qu'il présente.
  sessionStore.getState().establishGuest({
    sessionToken: 'st-owner-rail-test',
    guest: { participantId: null, nickname: 'Auteur', conversationId: 'c1', link: 'l1', mayWrite: true },
  });
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;
const seen: StoryOwnerRailState[] = [];
const pauseCalls: string[] = [];
const resumeCalls: string[] = [];
const announced: string[] = [];

beforeEach(() => {
  seen.length = 0;
  pauseCalls.length = 0;
  resumeCalls.length = 0;
  announced.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  storySaveStore.finish('st-mienne');
});

function Harness({ storyId, exportMediaId }: { readonly storyId: string; readonly exportMediaId?: string }) {
  const rail = useStoryOwnerRail({
    storyId,
    exportMediaId,
    pause: () => pauseCalls.push(storyId),
    resume: () => resumeCalls.push(storyId),
    announce: (m) => announced.push(m),
    language: 'fr',
  });
  seen.push(rail);
  return (
    <div>
      <button type="button" data-open-viewers onClick={rail.openViewers} />
      <button type="button" data-close-viewers onClick={rail.closeViewers} />
      <span data-viewers-open>{String(rail.viewersOpen)}</span>
      <button type="button" data-save onClick={rail.onSave} />
      <button type="button" data-cancel-save onClick={rail.onCancelSave} />
      <span data-saving>{rail.saving === null ? 'aucun' : JSON.stringify(rail.saving)}</span>
    </div>
  );
}

function mount(props: { readonly storyId: string; readonly exportMediaId?: string }): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...props} />);
  });
  return container;
}

describe('useStoryOwnerRail — la feuille « Vues » met la lecture EN PAUSE', () => {
  test('ouvrir met en pause, fermer reprend', () => {
    const el = mount({ storyId: 'st-mienne' });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-open-viewers]')!.click();
    });
    expect(el.querySelector('[data-viewers-open]')?.textContent).toBe('true');
    expect(pauseCalls).toEqual(['st-mienne']);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-close-viewers]')!.click();
    });
    expect(resumeCalls).toEqual(['st-mienne']);
  });
});

describe('useStoryOwnerRail — `onSave` télécharge puis livre, avec IDEMPOTENCE', () => {
  const globalWithFetch = globalThis as typeof globalThis & { fetch: typeof fetch };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalWithFetch.fetch;
  });
  afterEach(() => {
    globalWithFetch.fetch = originalFetch;
  });

  test('un export réussi ANNONCE le succès, et libère le job (le bouton redevient disponible)', async () => {
    globalWithFetch.fetch = (async () =>
      new Response(new Blob(['octets'], { type: 'image/jpeg' }), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })) as unknown as typeof fetch;

    const el = mount({ storyId: 'st-mienne', exportMediaId: 'm4' });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-save]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(announced).toContain('Story enregistrée');
    expect(storySaveStore.getState('st-mienne')).toBeNull();
  });

  test('un SECOND `onSave` pendant le premier est IGNORÉ — un seul export part', async () => {
    let calls = 0;
    globalWithFetch.fetch = (async () => {
      calls += 1;
      // Ne se résout jamais pendant ce test — le job reste EN COURS.
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const el = mount({ storyId: 'st-mienne', exportMediaId: 'm4' });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-save]')!.click();
      el.querySelector<HTMLButtonElement>('[data-save]')!.click();
      // `downloadFile`/`fileDeliveryPortal` sont chargés par `import()` (§
      // budget `story_reader`) : une pause laisse ce chargement se résoudre
      // avant de mesurer combien de fois `fetch` a été appelé.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls).toBe(1);
  });

  test('annuler pendant le téléchargement ANNONCE « Export annulé »', async () => {
    globalWithFetch.fetch = ((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        };
        // `fetch` refuse un signal DÉJÀ aborté (spec) — l'annulation peut
        // survenir avant même que l'`import()` du port n'ait résolu et
        // appelé `fetch`, donc avant que ce mock n'écoute l'événement.
        if (init?.signal?.aborted === true) abort();
        else init?.signal?.addEventListener('abort', abort);
      });
    }) as unknown as typeof fetch;

    const el = mount({ storyId: 'st-mienne', exportMediaId: 'm4' });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-save]')!.click();
      el.querySelector<HTMLButtonElement>('[data-cancel-save]')!.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(announced).toContain('Export annulé');
  });
});
