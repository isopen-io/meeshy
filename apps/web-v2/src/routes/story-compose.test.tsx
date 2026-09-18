import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import type { ProtectedMediaDeps } from '@/lib/api/protected-media';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createStudioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { buttonNamed } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import StoryComposeScreen, { type StoryStudioDeps } from './story-compose';

/**
 * `StoryComposeScreen` (#6900) — le critère de fin (Publier inerte sans
 * contenu, aperçu par le moteur dès qu'un fond est choisi, brouillon relu
 * après remontage sur échec) ET les défauts relevés en revue-correction : un
 * média PRÊT restauré se publie sans remontée, une intention de publier hors
 * ligne part au retour du réseau, un invité est refusé avant tout octet, un
 * fichier hors de sa porte est refusé, une montée échouée se réessaie.
 *
 * Tout le réseau passe par `StoryStudioDeps` INJECTÉ (transport JSON, client
 * TUS, magasin de brouillons) — aucun `globalThis.fetch` rebranché, aucune
 * dépendance à l'ordre d'import des singletons.
 */

const VIEWER_ID = 'c'.repeat(24);
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  // Un budget de tours ne peut pas attendre un `import()` : les deux chunks
  // à la demande de l'écran sont réchauffés avant tout montage.
  await Promise.all([import('@/components/scene-player'), import('@/lib/api/post-media-upload')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

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

async function flush(condition?: () => boolean): Promise<void> {
  const limit = Date.now() + 2000;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    if (condition === undefined || condition() || Date.now() >= limit) return;
  }
}

function mount(deps: StoryStudioDeps): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(<StoryComposeScreen deps={deps} />);
  });
  return container;
}

function unmountAll(): void {
  act(() => {
    mounted.splice(0).forEach(({ root, container }) => {
      root.unmount();
      container.remove();
    });
  });
}

function selectFile(host: ParentNode, door: 'visual' | 'sound', file: File): void {
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

function typeText(host: ParentNode, value: string): void {
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
function fakeRect(box: { readonly top: number; readonly left: number; readonly width: number; readonly height: number }): DOMRect {
  const { top, left, width, height } = box;
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

const publishButton = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-story-publish]');
const removeButton = (host: ParentNode, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

type Harness = {
  readonly deps: StoryStudioDeps;
  readonly posts: Array<Record<string, unknown>>;
  readonly uploadCreations: () => number;
};

/** Un seul banc : `POST /posts` répond `postsStatus`, la montée TUS rend
 * `pm-<n>` (ou lève tant que `uploadsFail()` est vrai). */
function harness(options: {
  readonly postsStatus?: () => number;
  readonly uploadsFail?: () => boolean;
  readonly drafts?: StudioDraftStore;
}): Harness {
  const posts: Array<Record<string, unknown>> = [];
  let creations = 0;
  const postsFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith('/api/v1/posts') || init?.method !== 'POST') throw new Error(`appel inattendu : ${init?.method} ${url}`);
    posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    const status = options.postsStatus?.() ?? 201;
    const body = status === 201 ? { success: true, data: { id: 'post-1' } } : { success: false, error: 'boom' };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const uploadsFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (options.uploadsFail?.() === true) throw new TypeError('Failed to fetch');
    if (init?.method === 'POST') {
      creations += 1;
      return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/up-${creations}` } });
    }
    return new Response(
      JSON.stringify({ success: true, data: { attachment: { id: `pm-${creations}`, fileUrl: `2026/09/u/f-${creations}.jpg`, mimeType: 'image/jpeg' } } }),
      { status: 200, headers: { 'Upload-Offset': '3' } },
    );
  }) as typeof fetch;
  return {
    posts,
    uploadCreations: () => creations,
    deps: {
      api: { source: 'gateway', transport: createHttpTransport({ base: '', fetchImpl: postsFetch }) },
      upload: { source: 'gateway', base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 't' }), fetchImpl: uploadsFetch },
      drafts: options.drafts ?? createStudioDraftStore(null),
    },
  };
}

const image = () => new File([new Uint8Array([1, 2, 3])], 'fond.jpg', { type: 'image/jpeg' });

describe('StoryComposeScreen — le bouton Publier est INERTE sans contenu (loi 4)', () => {
  test('brouillon vide : désactivé, et un clic n’envoie rien', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);
  });

  test('un texte l’ARME, le vider le désarme', () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    expect(publishButton(el)?.disabled).toBe(false);
    typeText(el, '   ');
    expect(publishButton(el)?.disabled).toBe(true);
  });
});

describe('StoryComposeScreen — l’aperçu par le moteur PARTAGÉ (D-79)', () => {
  test('[data-scene-player] monte dès qu’un fond est choisi, sur l’URL LOCALE, et la montée finit « Prêt »', async () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-scene-player]')).toBeNull();

    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    expect(el.querySelector('[data-scene-player]')).not.toBeNull();
    expect(el.querySelector('[data-scene-player] img')?.getAttribute('src')?.startsWith('blob:')).toBe(true);
    expect(el.querySelector('[data-asset-phase="ready"]')?.textContent).toContain('Prêt');
  });

  test('le champ de texte porte la langue composée (`lang`)', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('#story-studio-text')?.getAttribute('lang')).toBeTruthy();
  });

  test('le texte tapé se DESSINE par le moteur ([data-scene-text]) — jamais SEULEMENT dans le champ de saisie (défaut 5, revue-correction)', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-scene-text]')).toBeNull();

    typeText(el, 'Recette studio');
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Recette studio');
  });

  test('le champ de saisie est TRANSPARENT — le texte visible vient du moteur, pas d’une seconde peinture (défaut 5)', () => {
    const el = mount(harness({}).deps);
    const textarea = el.querySelector('#story-studio-text');
    expect(textarea?.getAttribute('class')).toContain('text-transparent');
    expect(textarea?.getAttribute('style') ?? '').not.toContain('text-shadow');
  });

  test('la saisie ADOPTE la boîte RÉELLEMENT peinte par [data-scene-text], au pixel près — jamais une largeur/hauteur fixes (défaut 1, revue-correction)', () => {
    const el = mount(harness({}).deps);
    typeText(el, 'Bonjour');
    const stage = el.querySelector<HTMLElement>('[data-scene-stage]');
    const textNode = el.querySelector<HTMLElement>('[data-scene-text]');
    expect(stage).not.toBeNull();
    expect(textNode).not.toBeNull();

    // La carte occupe (50,100)-(350,600) sur l'écran ; le moteur peint le
    // texte dans une boîte NARROW, décentrée verticalement — exactement ce
    // qu'un texte court, shrink-to-fit, rend en pratique.
    stage!.getBoundingClientRect = () => fakeRect({ top: 100, left: 50, width: 300, height: 500 });
    textNode!.getBoundingClientRect = () => fakeRect({ top: 260, left: 140, width: 120, height: 30 });

    // Un second caractère force `useLayoutEffect` (dépendance `draft.text`) à
    // remesurer SYNCHRONEMENT, dans le MÊME tour — jamais un `flush` qui
    // masquerait un défaut d'alignement d'un frame.
    typeText(el, 'Bonjour!');

    const textarea = el.querySelector<HTMLTextAreaElement>('#story-studio-text')!;
    // Relatif à la carte : top 260-100=160, left 140-50=90.
    expect(textarea.style.top).toBe('160px');
    expect(textarea.style.left).toBe('90px');
    expect(textarea.style.width).toBe('120px');
    expect(textarea.style.height).toBe('30px');
    // La forme centrée par défaut (translation à 50 %) ne doit PLUS gouverner
    // une fois la boîte réelle connue — elle décalait le curseur d'une ligne
    // entière au-dessus du texte (défaut 1).
    expect(textarea.style.transform).toBe('');
  });
});

describe('StoryComposeScreen — le son de fond s’ÉCOUTE, avec un vrai bouton (défaut 6, revue-correction)', () => {
  test('aucun son posé ⇒ ni lecteur audio ni bouton', () => {
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-sound]')).toBeNull();
    expect(el.querySelector('[data-story-studio-sound-toggle]')).toBeNull();
  });

  test('un son posé ⇒ un <audio> sur l’URL LOCALE et un bouton 44 px qui COUPE/RÉTABLIT effectivement le son', async () => {
    const el = mount(harness({}).deps);
    selectFile(el, 'sound', new File([new Uint8Array([1, 2, 3])], 'son.m4a', { type: 'audio/mp4' }));
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    const soundAudio = el.querySelector<HTMLAudioElement>('[data-story-studio-sound]');
    expect(soundAudio?.getAttribute('src')?.startsWith('blob:')).toBe(true);

    const toggle = el.querySelector<HTMLButtonElement>('[data-story-studio-sound-toggle]')!;
    expect(toggle.getBoundingClientRect).toBeDefined();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(soundAudio?.muted).toBe(true);

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector<HTMLAudioElement>('[data-story-studio-sound]')?.muted).toBe(false);

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector<HTMLAudioElement>('[data-story-studio-sound]')?.muted).toBe(true);
  });
});

/**
 * #7015, revue-correction — **LE TROISIÈME `<audio>` DE LA MÊME SOURCE ÉLUE.**
 *
 * L'aperçu du studio élit sa piste avec `electBackgroundTrack`, la MÊME
 * fonction que le lecteur de story et celui des Réels — et posait sa `src`
 * TELLE QUELLE. Sur un fichier local (`blob:`) c'est juste ; sur une piste
 * servie par `GET /api/v1/static/…` — la route AUTHENTIFIÉE — la balise part
 * sans en-tête et rend `401`.
 *
 * **CE QUE LA MESURE DIT, ET CE QU'ELLE NE DIT PAS.** La bibliothèque de sons
 * n'est PAS encore branchée au studio web (`background-sound.ts` : « `library`
 * reste HORS PÉRIMÈTRE ») : aujourd'hui, `draft.sound.previewUrl` est un
 * `blob:` (fichier choisi) ou un `/api/v1/attachments/file/…` (brouillon
 * restauré, route SANS authentification). Cette surface n'est donc pas
 * atteignable en production À CETTE DATE — elle le devient au premier
 * emprunt, et le brouillon RESTAURÉ est le chemin exact par lequel une piste
 * empruntée y entrerait. Le témoin passe par lui : le studio partage désormais
 * le SITE UNIQUE du transport protégé, au lieu d'attendre que la bibliothèque
 * rouvre le défaut que ce lot vient de fermer deux fois.
 */
const SON_EMPRUNTE = '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';

function draftsAvecSonEmprunte(): StudioDraftStore {
  const drafts = createStudioDraftStore(null);
  drafts.set(VIEWER_ID, {
    texts: [{ id: 't1', text: 'Sur une piste empruntée' }],
    sound: { postMediaId: 'pm-lib', fileUrl: SON_EMPRUNTE },
  });
  return drafts;
}

/** Le type que la route SERT (`EXT_TO_MIME`, `soundFormats.ts`) — un `200` non
 * typé n'est plus une piste depuis la revue-correction. */
function mediaDepsDeTest(options: { readonly typeServi?: string } = {}): ProtectedMediaDeps {
  return {
    credential: () => ({ kind: 'registered', token: 'jeton-du-temoin' }),
    fetchImpl: (() =>
      Promise.resolve(new Response(new Blob(['octets'], { type: options.typeServi ?? 'audio/x-m4a' }), { status: 200 }))) as typeof fetch,
    createObjectURL: () => 'blob:meeshy/studio',
    revokeObjectURL: () => undefined,
  };
}

describe('StoryComposeScreen — la piste PROTÉGÉE de l’aperçu (#7015)', () => {
  test('l’URL protégée n’est JAMAIS posée en `src` — l’aperçu reçoit une URL d’objet', async () => {
    const el = mount({ ...harness({ drafts: draftsAvecSonEmprunte() }).deps, media: mediaDepsDeTest() });
    await flush(() => el.querySelector('[data-scene-player]') !== null && el.querySelector('[data-story-studio-sound]') !== null);

    const soundAudio = el.querySelector<HTMLAudioElement>('[data-story-studio-sound]');
    expect(soundAudio?.getAttribute('src')).toBe('blob:meeshy/studio');
    expect(soundAudio?.getAttribute('src')).not.toContain('/api/v1/static/');
  });

  test('une piste indisponible ⇒ ni lecteur ni bouton — jamais un contrôle INERTE (loi 4)', async () => {
    const el = mount({ ...harness({ drafts: draftsAvecSonEmprunte() }).deps, media: mediaDepsDeTest({ typeServi: 'text/html' }) });
    await flush(() => el.querySelector('[data-scene-player]') !== null);
    expect(el.querySelector('[data-story-studio-sound]')).toBeNull();
    // Le bouton COUPER/RÉTABLIR d'une piste qui ne jouera jamais n'aurait
    // aucun effet : il ne se dessine pas.
    expect(el.querySelector('[data-story-studio-sound-toggle]')).toBeNull();
  });
});

describe('StoryComposeScreen — le brouillon SURVIT, et un média PRÊT n’est jamais remonté', () => {
  test('un POST /posts refusé garde le texte ; relu après remontage', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ postsStatus: () => 500, drafts }).deps);
    typeText(el, 'Ma légende');
    act(() => publishButton(el)!.click());
    await flush(() => el.querySelector('[role="alert"]') !== null);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('La passerelle est indisponible.');
    expect(publishButton(el)?.disabled).toBe(false);

    unmountAll();
    const remounted = mount(harness({ drafts }).deps);
    expect(remounted.querySelector<HTMLTextAreaElement>('#story-studio-text')?.value).toBe('Ma légende');
  });

  test('un fond DÉJÀ MONTÉ, restauré après un échec, se publie avec SON postMediaId — aucune nouvelle montée', async () => {
    const drafts = createStudioDraftStore(null);
    const failing = harness({ postsStatus: () => 500, drafts });
    const el = mount(failing.deps);
    selectFile(el, 'visual', image());
    typeText(el, 'Au soleil');
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    act(() => publishButton(el)!.click());
    await flush(() => el.querySelector('[role="alert"]') !== null);
    expect(failing.posts).toHaveLength(1);

    unmountAll();
    const retrying = harness({ drafts });
    const remounted = mount(retrying.deps);
    expect(remounted.querySelector('[data-asset-phase="ready"]')).not.toBeNull();
    expect(publishButton(remounted)?.disabled).toBe(false);

    act(() => publishButton(remounted)!.click());
    await flush(() => retrying.posts.length > 0);

    expect(retrying.uploadCreations()).toBe(0);
    expect(retrying.posts[0]!.mediaIds).toEqual(['pm-1']);
    const effects = retrying.posts[0]!.storyEffects as { scenes: Array<{ objects: Array<{ payload: Record<string, unknown> }> }> };
    expect(effects.scenes[0]!.objects.map((o) => o.payload.postMediaId).filter(Boolean)).toEqual(['pm-1']);
  });

  test('une publication qui RÉUSSIT purge le brouillon', async () => {
    const drafts = createStudioDraftStore(null);
    const el = mount(harness({ drafts }).deps);
    typeText(el, 'Une story qui part');
    await flush(() => drafts.get(VIEWER_ID) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => drafts.get(VIEWER_ID) === null);
    expect(drafts.get(VIEWER_ID)).toBeNull();
  });

  test('une story PUBLIÉE ne peut pas repartir : Publier reste inerte jusqu’à la navigation', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Une seule fois');
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    await flush();
    expect(publishButton(el)?.disabled).toBe(true);
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(1);
  });

  test('retirer le fond a un EFFET : plus de moteur, plus de postMediaId envoyé, et le retrait est persisté', async () => {
    const drafts = createStudioDraftStore(null);
    const bench = harness({ drafts });
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    typeText(el, 'Sans fond finalement');
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);

    act(() => removeButton(el, 'Retirer le fond')!.click());
    await flush();
    // Le TEXTE reste : un document texte seul est un fond de COULEUR + texte
    // (`composeStoryCanvas` — « une story sans visuel porte un fond de
    // couleur »), donc le moteur continue de peindre — sans image, ni
    // postMediaId (défaut 5, revue-correction : le texte se dessine par le
    // moteur, y compris quand il est la SEULE forme posée).
    expect(el.querySelector('[data-scene-player] img')).toBeNull();
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('Sans fond finalement');
    expect(drafts.get(VIEWER_ID)?.background).toBeUndefined();

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]!.mediaIds).toEqual([]);
  });
});

describe('StoryComposeScreen — les états refus, hors-ligne et échec de montée', () => {
  test('un INVITÉ lit le refus avant de composer : aucune porte de fichier', () => {
    act(() => {
      sessionStore.getState().establishGuest({
        sessionToken: 'anon',
        guest: { participantId: null, nickname: 'Invité', conversationId: 'c1', link: 'l1', mayWrite: true },
      });
    });
    const el = mount(harness({}).deps);
    expect(el.querySelector('[data-story-studio-refusal]')?.textContent).toContain('Un compte est nécessaire pour créer une story.');
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  test('hors ligne, Publier ARME l’intention sans rien envoyer ; au retour du réseau, la story part seule', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Écrit dans le métro');
    act(() => publishButton(el)!.click());
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(publishButton(el)?.textContent).toBe('En attente du réseau…');

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    // Défaut 4 (revue-correction) : le texte de scène ne se recopie JAMAIS
    // dans `content` — le studio n'a pas de champ légende, et l'envoyer y
    // ferait rendre le texte DEUX FOIS chez le lecteur.
    expect('content' in bench.posts[0]!).toBe(false);
    const effects = bench.posts[0]!.storyEffects as { scenes: Array<{ objects: Array<{ kind: string; payload: Record<string, unknown> }> }> };
    const textObject = effects.scenes[0]!.objects.find((o) => o.kind === 'text');
    expect(textObject?.payload.text).toBe('Écrit dans le métro');
  });

  test('une intention armée hors ligne puis VIDÉE ne ment pas au retour du réseau', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const bench = harness({});
    const el = mount(bench.deps);
    typeText(el, 'Finalement non');
    act(() => publishButton(el)!.click());
    await flush();
    typeText(el, '');
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(bench.posts).toHaveLength(0);
    expect(publishButton(el)?.textContent).toBe('Publier');
  });

  test('une image posée par la porte du SON est refusée, et rien ne part', async () => {
    const bench = harness({});
    const el = mount(bench.deps);
    selectFile(el, 'sound', image());
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Choisissez un fichier audio.');
    expect(bench.uploadCreations()).toBe(0);
  });

  test('une montée coupée se DIT, bloque Publier, et « Réessayer » la relance sur le même fichier', async () => {
    let failing = true;
    const bench = harness({ uploadsFail: () => failing });
    const el = mount(bench.deps);
    selectFile(el, 'visual', image());
    await flush(() => el.querySelector('[data-asset-phase="failed"]') !== null);

    expect(el.querySelector('[data-asset-phase="failed"]')?.textContent).toContain('Réseau indisponible.');
    expect(publishButton(el)?.disabled).toBe(true);

    failing = false;
    act(() => buttonNamed(el, 'Réessayer')!.click());
    await flush(() => el.querySelector('[data-asset-phase="ready"]') !== null);
    expect(el.querySelector('[data-asset-phase="ready"]')).not.toBeNull();
    expect(publishButton(el)?.disabled).toBe(false);
  });
});
