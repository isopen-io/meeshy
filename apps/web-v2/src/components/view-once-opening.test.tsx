import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Attachment } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Attachments } from './attachment-blocks';
import { ProtectedContent } from './protected-content';

/**
 * L'OUVERTURE D'UNE VUE UNIQUE (#7580, règle porteur du 2026-09-23) — par un
 * tap simple :
 * - un MÉDIA s'ouvre en PLEIN ÉCRAN ; à la fermeture, la puce passe à
 *   « (1) · Déjà ouvert », et ses fichiers quittent les caches du navigateur ;
 * - un TEXTE s'affiche à sa place ; il passe à « Déjà ouvert » dès qu'on le
 *   retouche OU dès qu'il sort de l'écran au défilement.
 * Rien du contenu n'existe dans le DOM avant l'ouverture.
 */
const globals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  caches?: CacheStorage;
  IntersectionObserver?: typeof IntersectionObserver;
};

type Observed = { readonly callback: IntersectionObserverCallback; readonly target: Element };
const observers: Observed[] = [];
let nativeObserver: typeof IntersectionObserver | undefined;
let nativeCaches: CacheStorage | undefined;
const deleted: string[] = [];

class FakeIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    observers.push({ callback: this.callback, target });
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

const fakeCaches = {
  keys: async () => ['meeshy-media'],
  open: async () => ({
    delete: async (url: string) => {
      deleted.push(url);
      return true;
    },
  }),
} as unknown as CacheStorage;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  nativeObserver = globals.IntersectionObserver;
  nativeCaches = globals.caches;
  globals.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  globals.caches = fakeCaches;
});

afterAll(async () => {
  if (nativeObserver === undefined) delete globals.IntersectionObserver;
  else globals.IntersectionObserver = nativeObserver;
  if (nativeCaches === undefined) delete globals.caches;
  else globals.caches = nativeCaches;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  observers.length = 0;
  deleted.length = 0;
});

const photo = { id: 'a-1', fileUrl: 'https://cdn.test/secret.jpg', thumbnailUrl: 'https://cdn.test/secret-thumb.jpg', mimeType: 'image/jpeg' } as Attachment;

const mountViewOnce = (attachments: readonly Attachment[]) =>
  mounter.mount(
    <ProtectedContent
      messageId="m-vu"
      kind="viewOnce"
      isViewOnce
      contentLength={12}
      attachments={attachments}
      surface="bubble"
      onConsumeViewOnce={async () => true}
    >
      <p data-secret>SECRET-VU</p>
    </ProtectedContent>,
  );

const settleFog = async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  await mounter.settle();
};

describe('un MÉDIA à vue unique s’ouvre en plein écran', () => {
  test('avant : une seule puce, et rien du contenu nulle part dans le document', async () => {
    const host = await mountViewOnce([photo]);
    expect(host.querySelectorAll('[data-view-once-chip]').length).toBe(1);
    expect(document.body.innerHTML).not.toContain('SECRET-VU');
    expect(document.body.innerHTML).not.toContain('secret.jpg');
  });

  test('le toucher ouvre le plein écran ; le fermer passe la puce à « Déjà ouvert » et purge les caches', async () => {
    const host = await mountViewOnce([photo]);
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));

    const stage = document.body.querySelector('[data-view-once-stage]');
    expect(stage?.getAttribute('role')).toBe('dialog');
    expect(stage?.textContent).toContain('SECRET-VU');

    await mounter.click(document.body.querySelector<HTMLButtonElement>('.view-once-stage-close'));
    await mounter.settle();

    expect(document.body.querySelector('[data-view-once-stage]')).toBe(null);
    expect(host.querySelector('[data-view-once-chip]')?.getAttribute('data-view-once-chip')).toBe('opened');
    expect(document.body.innerHTML).not.toContain('SECRET-VU');
    expect(deleted).toEqual(['https://cdn.test/secret.jpg', 'https://cdn.test/secret-thumb.jpg']);
  });
});

describe('la pièce d’une vue unique s’ouvre EN CLAIR dans le plein écran (#7672)', () => {
  /* La passerelle pose `isViewOnce` sur les pièces d'un message à vue unique
     (#7498) : `maskedAttachment` les masquait jusque DANS l'ouverture, et le
     lecteur voyait « Photo protégée » au lieu de sa photo. Les enfants sont
     ici les VRAIS blocs de pièces, jamais un substitut. */
  const viewOncePhoto = { ...photo, isViewOnce: true } as Attachment;

  test('ouvert, le plein écran montre l’image et aucun masque', async () => {
    const host = await mounter.mount(
      <ProtectedContent
        messageId="m-vu"
        kind="viewOnce"
        isViewOnce
        contentLength={0}
        attachments={[viewOncePhoto]}
        surface="bubble"
        onConsumeViewOnce={async () => true}
      >
        <Attachments attachments={[viewOncePhoto]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />
      </ProtectedContent>,
    );
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));

    const stage = document.body.querySelector('[data-view-once-stage]');
    expect(stage?.querySelector('[data-protected-attachment]')).toBe(null);
    expect(stage?.querySelector('img')).not.toBe(null);
  });

  test('hors de l’ouverture, la même pièce reste masquée', async () => {
    const host = await mounter.mount(
      <Attachments attachments={[viewOncePhoto]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />,
    );
    expect(host.querySelector('[data-protected-attachment]')).not.toBe(null);
  });
});

describe('un TEXTE à vue unique s’ouvre à sa place', () => {
  test('retouché, il passe à « Déjà ouvert »', async () => {
    const host = await mountViewOnce([]);
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    expect(host.textContent).toContain('SECRET-VU');

    await mounter.click(host.querySelector('[data-view-once-open]'));
    await settleFog();

    expect(host.textContent).not.toContain('SECRET-VU');
    expect(host.querySelector('[data-view-once-chip]')?.getAttribute('data-view-once-chip')).toBe('opened');
  });

  test('sorti de l’écran au défilement, il passe à « Déjà ouvert »', async () => {
    const host = await mountViewOnce([]);
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    const watched = observers.at(-1);
    expect(watched).toBeDefined();

    const entry = (isIntersecting: boolean) => ({ isIntersecting, target: watched!.target }) as IntersectionObserverEntry;
    await mounter.settle();
    watched!.callback([entry(true)], {} as IntersectionObserver);
    await mounter.settle();
    expect(host.textContent).toContain('SECRET-VU');

    watched!.callback([entry(false)], {} as IntersectionObserver);
    await settleFog();

    expect(host.textContent).not.toContain('SECRET-VU');
    expect(host.querySelector('[data-view-once-chip]')?.getAttribute('data-view-once-chip')).toBe('opened');
  });
});
