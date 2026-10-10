import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { pendingAttachmentOf, type PendingAttachment } from '@/lib/send/attachments';
import type { StudioRetouchDeps } from '@/lib/stories/studio-retouch';
import { flush, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

import ComposerRetouch from './composer-retouch';
import ComposerTray from './composer-tray';

/**
 * « ÉDITER » UNE IMAGE DU FIL (#8416) — la vignette d'une image en attente
 * ouvre le studio plein écran en mode RETOUCHE ; seuls les contrôles qui
 * peignent y restent ; « Terminé » rend un JPEG qui remplace la pièce.
 */
registerStudioBench();

beforeAll(async () => {
  await Promise.all([import('@/routes/story-compose'), import('./composer-retouch'), import('@/lib/stories/studio-retouch')]);
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove())));
});

function mount(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(element));
  return host;
}

const photo = (): PendingAttachment => pendingAttachmentOf(new File([new Uint8Array([1, 2, 3])], 'plage.png', { type: 'image/png' }));

/** Un canvas factice : la retouche rend un JPEG sans navigateur. */
const fakeRender: StudioRetouchDeps = {
  createCanvas: () => ({
    context: new Proxy({}, { get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as never,
    toBlob: async (type) => new Blob(['jpeg'], { type }),
  }),
  loadImage: async () => ({ naturalWidth: 4, naturalHeight: 3 }) as unknown as CanvasImageSource,
};

describe('la vignette d’une IMAGE en attente propose « Éditer »', () => {
  test('une image : le bouton ; un fichier : aucun', () => {
    const pdf = pendingAttachmentOf(new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' }));
    const el = mount(
      <ComposerTray variant="above" pending={[photo(), pdf]} onRemove={() => undefined} onReplace={() => undefined} notice={null} place={null} onRemovePlace={() => undefined} />,
    );
    expect(el.querySelectorAll('[data-composer-edit]')).toHaveLength(1);
    expect(el.querySelector('[data-composer-edit]')?.getAttribute('aria-label')).toBe('Éditer plage.png');
  });

  test('toucher la vignette ouvre le studio en RETOUCHE, par-dessus le fil', async () => {
    const el = mount(
      <ComposerTray variant="above" pending={[photo()]} onRemove={() => undefined} onReplace={() => undefined} notice={null} place={null} onRemovePlace={() => undefined} />,
    );
    act(() => el.querySelector<HTMLButtonElement>('[data-composer-edit]')!.click());
    await flush(() => document.querySelector('[data-composer-retouch] [data-story-studio]') !== null);
    expect(document.querySelector('[data-composer-retouch] [data-story-retouch-done]')).not.toBeNull();
  });
});

describe('le studio en RETOUCHE — seulement ce qui peint', () => {
  test('ni audience, ni formats, ni Animé, ni ⋯, ni nouvelle scène, ni son, ni texte du post, ni légende', async () => {
    const el = mount(<ComposerRetouch pieces={[photo()]} focus={0} onDone={() => undefined} onCancel={() => undefined} render={fakeRender} />);
    await flush(() => el.querySelector('[data-scene-player]') !== null);
    for (const absent of [
      '[data-story-audience]',
      '[data-story-publish]',
      '[data-story-animated]',
      '[data-story-studio-more]',
      '[data-story-option="add-page"]',
      'input[data-door="sound"]',
      '[data-story-post-text]',
      '#story-studio-caption-visual',
    ]) {
      expect(el.querySelector(absent)).toBeNull();
    }
    for (const present of ['input[data-door="visual"]', 'input[data-door="overlay"]', '[data-story-option="add-text"]', '[data-story-option="frame"]', '[data-story-retouch-done]']) {
      expect(el.querySelector(present)).not.toBeNull();
    }
  });

  test('« Terminé » rend un JPEG nommé d’après l’image retouchée — et rien n’est téléversé', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{}');
    }) as typeof fetch;
    try {
      const piece = photo();
      const got: { done: readonly { readonly localId: string; readonly file: File }[] | null } = { done: null };
      const el = mount(<ComposerRetouch pieces={[piece]} focus={0} onDone={(replaced) => (got.done = replaced)} onCancel={() => undefined} render={fakeRender} />);
      await flush(() => el.querySelector('[data-scene-player]') !== null);
      typeText(el, 'Plage');
      act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
      await flush(() => got.done !== null);
      const [rendu] = got.done ?? [];
      expect(rendu?.localId).toBe(piece.localId);
      expect(rendu?.file.name).toBe('plage-retouche.jpg');
      expect(rendu?.file.type).toBe('image/jpeg');
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('✕ referme sans rien rendre', async () => {
    let cancelled = false;
    let done = false;
    const el = mount(<ComposerRetouch pieces={[photo()]} focus={0} onDone={() => (done = true)} onCancel={() => (cancelled = true)} render={fakeRender} />);
    await flush(() => el.querySelector('[data-story-retouch-cancel]') !== null);
    act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-cancel]')!.click());
    expect(cancelled).toBe(true);
    expect(done).toBe(false);
  });
});

/**
 * LE RETOUR ANDROID REFERME LE STUDIO, PAS LE FIL (#8460) — dans la coque,
 * le bouton retour matériel est un `popstate`. Sans `useBackDismiss`, la
 * couche n'en écoutait aucun : le retour quittait la conversation, studio
 * ouvert, là où Échap le refermait sur le web.
 */
describe('le retour matériel', () => {
  test('popstate ⇒ le studio se referme sans rien rendre', async () => {
    let cancelled = false;
    let done = false;
    const el = mount(<ComposerRetouch pieces={[photo()]} focus={0} onDone={() => (done = true)} onCancel={() => (cancelled = true)} render={fakeRender} />);
    await flush(() => el.querySelector('[data-story-retouch-cancel]') !== null);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(cancelled).toBe(true);
    expect(done).toBe(false);
  });

  test('ouvert ⇒ pose UNE entrée d’historique que le retour consomme', () => {
    const before = window.history.length;
    mount(<ComposerRetouch pieces={[photo()]} focus={0} onDone={() => undefined} onCancel={() => undefined} render={fakeRender} />);
    expect(window.history.length).toBe(before + 1);
  });
});

/**
 * TOUTES LES PIÈCES DU MESSAGE EN SCÈNES (#9126, miroir
 * `ConversationRetouchSeriesEditor` iOS) — « Éditer » sur la 2e ouvre les trois,
 * sur la 2e ; on passe de l’une à l’autre ; « Terminé » rend chaque scène
 * retouchée à SA pièce, les autres restent telles quelles.
 */
describe('« Éditer » ouvre toutes les pièces du message', () => {
  const named = (name: string): PendingAttachment => pendingAttachmentOf(new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' }));

  test('le plateau ouvre le studio sur la pièce TOUCHÉE, avec une scène par pièce et sans corbeille', async () => {
    const pieces = [named('un.png'), named('deux.png'), named('trois.png')];
    const el = mount(
      <ComposerTray variant="above" pending={pieces} onRemove={() => undefined} onReplace={() => undefined} notice={null} place={null} onRemovePlace={() => undefined} />,
    );
    act(() => el.querySelectorAll<HTMLButtonElement>('[data-composer-edit]')[1]!.click());
    await flush(() => document.querySelectorAll('[data-composer-retouch] [data-story-studio-page-tile]').length === 3);
    const tiles = [...document.querySelectorAll('[data-composer-retouch] [data-story-studio-page-tile]')];
    expect(tiles.map((tile) => tile.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(document.querySelector('[data-composer-retouch] [data-story-studio-page-delete]')).toBeNull();
  });

  test('retoucher la 1re et la 3e : « Terminé » rend ces deux-là, à leur place ; la 2e reste', async () => {
    const pieces = [named('un.png'), named('deux.png'), named('trois.png')];
    const got: { done: readonly { readonly localId: string; readonly file: File }[] | null } = { done: null };
    const el = mount(<ComposerRetouch pieces={pieces} focus={1} onDone={(replaced) => (got.done = replaced)} onCancel={() => undefined} render={fakeRender} />);
    await flush(() => el.querySelectorAll('[data-story-studio-page-tile]').length === 3);
    const tile = (index: number) => el.querySelectorAll<HTMLButtonElement>('[data-story-studio-page-tile]')[index]!;
    act(() => tile(0).click());
    await flush(() => tile(0).getAttribute('aria-current') === 'true');
    typeText(el, 'Un');
    act(() => tile(2).click());
    await flush(() => tile(2).getAttribute('aria-current') === 'true');
    typeText(el, 'Trois');
    act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
    await flush(() => got.done !== null);
    expect((got.done ?? []).map(({ localId, file }) => [localId, file.name])).toEqual([
      [pieces[0]!.localId, 'un-retouche.jpg'],
      [pieces[2]!.localId, 'trois-retouche.jpg'],
    ]);
  });

  test('aucune retouche : « Terminé » referme sans rien rendre', async () => {
    let cancelled = false;
    let done = false;
    const el = mount(<ComposerRetouch pieces={[named('un.png'), named('deux.png')]} focus={0} onDone={() => (done = true)} onCancel={() => (cancelled = true)} render={fakeRender} />);
    await flush(() => el.querySelectorAll('[data-story-studio-page-tile]').length === 2);
    act(() => el.querySelector<HTMLButtonElement>('[data-story-retouch-done]')!.click());
    await flush(() => cancelled);
    expect(done).toBe(false);
  });
});
