import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';
import * as uploadsEndpoints from '@meeshy/shared/api/endpoints/uploads';

import { createHttpTransport } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { createStudioDraftStore, type StudioDraftSnapshot, type StudioPageSnapshot, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import StoryComposeScreen, { type StoryStudioDeps } from '@/routes/story-compose';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from './happy-dom-environment';

/**
 * LE BANC DU STUDIO (#6900), partagé par ses témoins d'écran — extrait par la
 * revue-correction de #7684 quand `story-compose.test.tsx` passait les mille
 * lignes : les PAGES ont leur propre fichier (`story-compose-pages.test.tsx`),
 * et un banc recopié deux fois divergerait au premier ajustement.
 *
 * Tout le réseau passe par `StoryStudioDeps` INJECTÉ (transport JSON, client
 * TUS, magasin de brouillons) — aucun `globalThis.fetch` rebranché.
 * `registerStudioBench()` pose les crochets du fichier qui l'appelle.
 */
export const VIEWER_ID = 'c'.repeat(24);
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

export function registerStudioBench(): void {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    // L'allemand sert le témoin de RANG D-113 (§ 4.4, « en ALLEMAND ») : en
    // français, un libellé en dur et un libellé du catalogue rendent le même
    // texte — leçon 261.
    await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('de')]);
    // Un budget de tours ne peut pas attendre un `import()` : les chunks à la
    // demande de l'écran (moteur, montée, feuille d'audience, éditeur d'objet)
    // sont réchauffés avant tout montage.
    await Promise.all([
      import('@/components/scene-player'),
      import('@/lib/api/post-media-upload'),
      import('@/routes/story-compose-audience-sheet'),
      import('@/routes/story-compose-editor'),
      import('@/routes/story-compose-pages'),
      import('@/routes/story-compose-frame'),
      import('@/routes/story-compose-object-menu'),
      import('@/routes/story-compose-effects'),
      import('@/routes/story-compose-overlays'),
      import('@/lib/stories/studio-composite'),
      import('@/components/layout-mark'),
    ]);
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    document.documentElement.lang = 'fr';
    await releaseHappyDomIfRegistered();
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      sessionStore.getState().establish({
        user: { id: VIEWER_ID, username: 'auteur', displayName: 'Auteur', avatar: '' },
        token: 'jeton-du-temoin',
        sessionToken: 'session-du-temoin',
        expiresIn: 3600,
      });
    });
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(({ root, container }) => {
        root.unmount();
        container.remove();
      });
      sessionStore.getState().clearSession();
    });
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });
}

export async function flush(condition?: () => boolean): Promise<void> {
  const limit = Date.now() + 2000;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    if (condition === undefined || condition() || Date.now() >= limit) return;
  }
}

export function mount(deps: StoryStudioDeps, initialKind?: PublicationKind): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(initialKind === undefined ? <StoryComposeScreen deps={deps} /> : <StoryComposeScreen deps={deps} initialKind={initialKind} />);
  });
  return container;
}

export function unmountAll(): void {
  act(() => {
    mounted.splice(0).forEach(({ root, container }) => {
      root.unmount();
      container.remove();
    });
  });
}

export function selectFile(host: ParentNode, door: 'visual' | 'sound', file: File): void {
  const input = host.querySelector<HTMLInputElement>(`input[data-door="${door}"]`)!;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  act(() => {
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function writeNativeValue(element: HTMLElement, prototype: object | null, value: string): boolean {
  if (prototype === null) return false;
  const setter: unknown = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (typeof setter !== 'function') return writeNativeValue(element, Object.getPrototypeOf(prototype), value);
  Reflect.apply(setter, element, [value]);
  return true;
}

/** Le point où le doigt touche l'invite : `happy-dom` ne peint rien, la
 * boîte de la saisie y est POSÉE (hors de toute boîte peinte substituée par un
 * témoin, `tapObject` en pose en 10,10 → 110,50). */
const INVITE_BOX = { top: 100, left: 20, width: 200, height: 40 } as const;
const INVITE_POINT = { clientX: 120, clientY: 120 } as const;

/** TOUCHER LA SCÈNE — par le calque des gestes, comme le doigt (#8515) :
 * c'est lui qui recouvre la scène, jamais la saisie. */
export function tapStageAt(host: ParentNode, point: { readonly clientX: number; readonly clientY: number }): void {
  const layer = host.querySelector<HTMLElement>('[data-story-stage-gestures]');
  if (layer === null) throw new Error('aucun calque des gestes : la scène ne se touche pas');
  layer.setPointerCapture = () => undefined;
  const at = { bubbles: true, button: 0, pointerId: 1, ...point };
  act(() => layer.dispatchEvent(new PointerEvent('pointerdown', at)));
  act(() => layer.dispatchEvent(new PointerEvent('pointerup', at)));
}

/** TOUCHER L'INVITE « Écrivez… » — la boîte de la saisie. */
export function tapInvite(host: ParentNode): void {
  const field = host.querySelector<HTMLTextAreaElement>('#story-studio-text');
  if (field === null) throw new Error('aucune invite à écrire sur la scène');
  field.getBoundingClientRect = () => fakeRect(INVITE_BOX);
  tapStageAt(host, INVITE_POINT);
}

/**
 * **ÉCRIRE COMME UN AUTEUR** (#8515) — la saisie n'est remplie qu'une fois
 * ATTEINTE par le doigt : un toucher sur l'invite (un texte vide), deux sur un
 * texte déjà écrit (la sélection silencieuse le sélectionne au premier). Le
 * banc écrivait directement dans le champ et gardait le défaut : le calque des
 * gestes le couvrait et aucun doigt n'y arrivait.
 */
export function typeText(host: ParentNode, value: string): void {
  const reached = () => document.activeElement !== null && document.activeElement === host.querySelector('#story-studio-text');
  if (!reached()) tapInvite(host);
  if (!reached()) tapInvite(host);
  if (!reached()) throw new Error('toucher la scène n’a pas donné le focus à la saisie : on ne peut pas y écrire (#8515)');
  const textarea = host.querySelector<HTMLTextAreaElement>('#story-studio-text')!;
  act(() => {
    if (!writeNativeValue(textarea, Object.getPrototypeOf(textarea), value)) throw new Error('aucun setter natif de value');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Un `DOMRect` complet — `happy-dom` ne peint rien (toutes ses boîtes sont
 * `0,0,0,0`) : c'est en le SUBSTITUANT sur les deux nœuds réels (la carte,
 * le texte peint) qu'on peut prouver, hors navigateur, que la saisie ADOPTE
 * la boîte MESURÉE plutôt qu'une formule recopiée (défaut 1, revue-correction). */
export function fakeRect(box: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }): DOMRect {
  const { top, left, width, height } = box;
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

export const publishButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-publish]');
export const removeButton = (host: ParentNode, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

export type Harness = {
  readonly deps: StoryStudioDeps;
  readonly posts: Array<Record<string, unknown>>;
  readonly uploadCreations: () => number;
  /** Les montées ABANDONNÉES en vol — le signal de l'appelant a coupé le
   * transport (`uploadsHold`). */
  readonly uploadAborts: () => number;
  /** Rend la PLUS ANCIENNE réponse `POST /posts` retenue (`postsHold`) — les
   * témoins d'une séquence (#7707) avancent ainsi requête par requête. */
  readonly releasePost: () => void;
};

/** Un seul banc : `POST /posts` répond `postsStatus`, la montée TUS rend
 * `pm-<n>` (ou lève tant que `uploadsFail()` est vrai). */
export function harness(options: {
  readonly postsStatus?: () => number;
  readonly uploadsFail?: () => boolean;
  /** Tant que vrai, le transfert d'octets RESTE en vol jusqu'à son abandon. */
  readonly uploadsHold?: () => boolean;
  /** Tant que vrai, chaque `POST /posts` RESTE en vol jusqu'à `releasePost()`
   * — la requête est ENREGISTRÉE (`posts`) dès son émission. */
  readonly postsHold?: () => boolean;
  readonly drafts?: StudioDraftStore;
}): Harness {
  const posts: Array<Record<string, unknown>> = [];
  const heldPosts: Array<() => void> = [];
  let creations = 0;
  let aborts = 0;
  const postsFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith(postsEndpoints.root) || init?.method !== 'POST') throw new Error(`appel inattendu : ${init?.method} ${url}`);
    posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    if (options.postsHold?.() === true) await new Promise<void>((resolve) => heldPosts.push(resolve));
    const status = options.postsStatus?.() ?? 201;
    const body = status === 201 ? { success: true, data: { id: `post-${posts.length}` } } : { success: false, error: 'boom' };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const uploadsFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (options.uploadsFail?.() === true) throw new TypeError('Failed to fetch');
    if (init?.method === 'POST') {
      creations += 1;
      return new Response(null, { status: 201, headers: { Location: uploadsEndpoints.byWildcard(`up-${creations}`) } });
    }
    if (options.uploadsHold?.() === true) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborts += 1;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    return new Response(
      JSON.stringify({ success: true, data: { attachment: { id: `pm-${creations}`, fileUrl: `2026/09/u/f-${creations}.jpg`, mimeType: 'image/jpeg' } } }),
      { status: 200, headers: { 'Upload-Offset': '3' } },
    );
  }) as typeof fetch;
  return {
    posts,
    uploadCreations: () => creations,
    uploadAborts: () => aborts,
    releasePost: () => heldPosts.shift()?.(),
    deps: {
      api: { source: 'gateway', transport: createHttpTransport({ base: '', fetchImpl: postsFetch }) },
      upload: { source: 'gateway', base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 't' }), fetchImpl: uploadsFetch },
      drafts: options.drafts ?? createStudioDraftStore(null),
    },
  };
}

export const image = () => new File([new Uint8Array([1, 2, 3])], 'fond.jpg', { type: 'image/jpeg' });

/** UN brouillon SEMÉ à UNE page (schéma 2, #7684) — la forme que les témoins
 * de ce fichier écrivent DIRECTEMENT dans le magasin, sans passer par
 * l'écran. `visibility` reste au niveau du BROUILLON (pas de la page) ; tout
 * le reste (`texts`, `background`, `overlay`, `sound`) va sur `page-1`. */
export function onePageSnapshot(fields: {
  readonly texts: StudioPageSnapshot['texts'];
  readonly visibility?: StudioDraftSnapshot['visibility'];
  readonly background?: StudioPageSnapshot['background'];
  readonly overlay?: StudioPageSnapshot['overlay'];
  readonly sound?: StudioPageSnapshot['sound'];
}): StudioDraftSnapshot {
  const { texts, visibility, background, overlay, sound } = fields;
  return {
    schema: 2,
    pages: [
      {
        id: 'page-1',
        texts,
        ...(background !== undefined ? { background } : {}),
        ...(overlay !== undefined ? { overlay } : {}),
        ...(sound !== undefined ? { sound } : {}),
      },
    ],
    currentPage: 'page-1',
    ...(visibility !== undefined ? { visibility } : {}),
  };
}

