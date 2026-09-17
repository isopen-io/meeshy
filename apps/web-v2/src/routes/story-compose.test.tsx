import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { sessionStore } from '@/lib/api/session';
import { studioDraftStore } from '@/lib/stories/studio-draft-store';
import { buttonNamed } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import StoryComposeScreen, { type StoryStudioDeps } from './story-compose';

/**
 * `StoryComposeScreen` (#6900) — les TROIS critères de fin de la
 * spécification `story-compose.test.tsx` : le bouton Publier est INERTE sans
 * contenu (loi 4), l'aperçu monte `[data-scene-player]` dès qu'un fond est
 * choisi (le MÊME moteur que le fil, D-79), et un échec de publication
 * CONSERVE le brouillon — relu après remontage (§0 de la spécification).
 *
 * DEUX SEAMS réseau, deux techniques — ni l'une ni l'autre ne passe par les
 * fixtures (aucune n'existe pour la montée d'un `PostMedia`, § 3.6 de la
 * spécification) :
 *  - `uploadPostMedia` (TUS) résout `fetch` à CHAQUE appel (une référence
 *    globale, jamais figée) : `globalThis.fetch` suffit à le bouchonner ;
 *  - `publishStory` passe par `httpTransport`, qui fige son `fetchImpl` à sa
 *    CONSTRUCTION (`createHttpTransport`, `client.ts`) — un `globalThis.fetch`
 *    posé APRÈS l'import du module n'a plus de prise sur lui (mesuré en
 *    revue-correction : l'écran contactait la VRAIE passerelle de
 *    production). `deps.transport` (`StoryStudioDeps`, exporté par l'écran)
 *    est le seul point d'injection ouvert pour ce second seam.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  // Réchauffe le chunk du moteur AVANT tout montage — un budget de tours ne
  // peut pas attendre un `import()` (leçon du dépôt, `composer.test.tsx`) ;
  // le module est déjà en cache quand le premier test le demande.
  await import('@/components/scene-player');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  studioDraftStore.clear();
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'auteur', displayName: 'Auteur', avatar: '' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
    sessionStore.getState().clearSession();
  });
  container.remove();
  studioDraftStore.clear();
  globalThis.fetch = originalFetch;
});

/** Un budget de tours BORNÉ, jamais un compte fixe (même leçon que
 * `composer.test.tsx` : « un budget de tours ne peut pas attendre un
 * `import()` » — ici une chaîne de promesses réseau, même bouchée). */
const ATTENTE_MAX_MS = 2000;
async function flush(condition?: () => boolean): Promise<void> {
  const limite = Date.now() + ATTENTE_MAX_MS;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    if (condition === undefined || condition() || Date.now() >= limite) return;
  }
}

function mount(deps?: StoryStudioDeps): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<StoryComposeScreen {...(deps === undefined ? {} : { deps })} />);
  });
  return container;
}

function selectFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  act(() => {
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Le setter NATIF, cherché sur la chaîne de prototypes DE L'ÉLÉMENT — même
 * piège que `act-mount.ts#writeNativeValue` (React pose son suivi de valeur
 * sur l'instance ; une affectation directe ne le met pas à jour sous
 * happy-dom, et React ne rappelle alors jamais `onChange`). `typeInto`
 * (`act-mount.ts`) ne couvre que `<input>`/`<select>` : ce champ-ci est une
 * `<textarea>`, d'où cette variante locale. */
function writeNativeValue(element: HTMLElement, prototype: object | null, value: string): boolean {
  if (prototype === null) return false;
  const setter: unknown = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (typeof setter !== 'function') return writeNativeValue(element, Object.getPrototypeOf(prototype), value);
  Reflect.apply(setter, element, [value]);
  return true;
}

function typeText(textarea: HTMLTextAreaElement, value: string): void {
  act(() => {
    if (!writeNativeValue(textarea, Object.getPrototypeOf(textarea), value)) {
      throw new Error('aucun setter natif de value pour #story-studio-text');
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (textarea.value !== value) throw new Error(`le champ n’a pas reçu « ${value} »`);
}

/** `POST /uploads` + `PATCH /uploads/:id` — réussissent TOUJOURS ici : ce
 * fichier éprouve l'aperçu et un échec de PUBLICATION, jamais de montée
 * (couvert par `post-media-upload.test.ts`). Posé sur `globalThis.fetch`,
 * seul seam que `uploadPostMedia` regarde. */
function fakeUploadsFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/v1/uploads') && method === 'POST') {
      return new Response(null, { status: 201, headers: { Location: 'https://gate.meeshy.me/api/v1/uploads/up-1' } });
    }
    if (url.includes('/api/v1/uploads/') && method === 'PATCH') {
      return new Response(
        JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: '2026/09/u1/bg.jpg', mimeType: 'image/jpeg' } } }),
        { status: 200, headers: { 'Upload-Offset': '3' } },
      );
    }
    throw new Error(`appel réseau inattendu dans ce témoin (uploads) : ${method} ${url}`);
  }) as typeof fetch;
}

/** `POST /api/v1/posts` — configurable, posé sur `deps.transport`
 * (`StoryStudioDeps`), le SEUL seam de `publishStory`. */
function depsForPosts(postsResponse: () => Response): StoryStudioDeps {
  return {
    transport: createHttpTransport({
      base: '',
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/api/v1/posts') && method === 'POST') return postsResponse();
        throw new Error(`appel réseau inattendu dans ce témoin (posts) : ${method} ${url}`);
      }) as typeof fetch,
    }),
  };
}

const publishedOk = () => new Response(JSON.stringify({ success: true, data: { id: 'post-1' } }), { status: 201 });
const publishRefused = () =>
  new Response(JSON.stringify({ success: false, error: 'La passerelle est indisponible' }), { status: 500 });

describe('StoryComposeScreen — le bouton Publier est INERTE sans contenu (loi 4)', () => {
  test('brouillon vide : Publier est désactivé', () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    expect(buttonNamed(el, 'Publier')?.disabled).toBe(true);
  });

  test('un texte tapé rend Publier ACTIF', () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    typeText(el.querySelector<HTMLTextAreaElement>('#story-studio-text')!, 'Bonjour');
    expect(buttonNamed(el, 'Publier')?.disabled).toBe(false);
  });

  test('vider le texte à nouveau redésactive Publier — un contrôle qui REFLÈTE l’état, pas seulement son premier verdict', () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    const textarea = el.querySelector<HTMLTextAreaElement>('#story-studio-text')!;
    typeText(textarea, 'Bonjour');
    expect(buttonNamed(el, 'Publier')?.disabled).toBe(false);
    typeText(textarea, '   ');
    expect(buttonNamed(el, 'Publier')?.disabled).toBe(true);
  });
});

describe('StoryComposeScreen — l’aperçu par le moteur PARTAGÉ (D-79)', () => {
  test('[data-scene-player] apparaît dès qu’un fond (image) est choisi', async () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    expect(el.querySelector('[data-scene-player]')).toBeNull();

    const input = el.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]')!;
    selectFile(input, new File([new Uint8Array([1, 2, 3])], 'fond.jpg', { type: 'image/jpeg' }));

    await flush(() => el.querySelector('[data-scene-player]') !== null);
    expect(el.querySelector('[data-scene-player]')).not.toBeNull();
  });

  test('rien n’est posé ⇒ aucun moteur monté (le chunk n’est jamais téléchargé pour un texte seul)', () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    typeText(el.querySelector<HTMLTextAreaElement>('#story-studio-text')!, 'Juste un mot');
    expect(el.querySelector('[data-scene-player]')).toBeNull();
  });
});

describe('StoryComposeScreen — le brouillon SURVIT à un échec de publication (§0)', () => {
  test('un POST /posts refusé conserve le TEXTE — relu après remontage', async () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishRefused));
    typeText(el.querySelector<HTMLTextAreaElement>('#story-studio-text')!, 'Ma légende');

    await act(async () => {
      buttonNamed(el, 'Publier')!.click();
    });
    await flush(() => el.querySelector('[role="alert"]') !== null);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('indisponible');
    // Le bouton REDEVIENT actif — l'échec n'a pas figé l'écran.
    expect(buttonNamed(el, 'Publier')?.disabled).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();

    // REMONTAGE — un écran neuf, comme si l'utilisateur avait quitté puis
    // rouvert « Créer une story ». Le texte n'a JAMAIS quitté le brouillon.
    const remounted = mount();
    expect(remounted.querySelector<HTMLTextAreaElement>('#story-studio-text')?.value).toBe('Ma légende');
  });

  test('une publication qui RÉUSSIT vide le brouillon — rien à restaurer au remontage suivant', async () => {
    globalThis.fetch = fakeUploadsFetch();
    const el = mount(depsForPosts(publishedOk));
    typeText(el.querySelector<HTMLTextAreaElement>('#story-studio-text')!, 'Une story qui part');

    await act(async () => {
      buttonNamed(el, 'Publier')!.click();
    });
    await flush(() => studioDraftStore.get() === null);

    expect(studioDraftStore.get()).toBeNull();
  });
});
