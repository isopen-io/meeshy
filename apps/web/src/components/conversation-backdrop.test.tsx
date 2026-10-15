import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { HttpRequest } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationBackdrop } from './conversation-backdrop';

const conversation = (appearance?: unknown): Conversation =>
  ({ id: 'c1', type: 'group', title: 'Équipe', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: new Date(), updatedAt: new Date(), ...(appearance === undefined ? {} : { userPreferences: [{ appearance }] }) }) as Conversation;

const chosen = (background: unknown) => ({ v: 1, background, accent: null, animate: true });

let host: HTMLElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => releaseHappyDomIfRegistered());
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.classList.remove('light');
});

const offline: ConversationsDeps = { source: 'fixtures', transport: undefined } as unknown as ConversationsDeps;

async function show(c: Conversation, deps: ConversationsDeps = offline): Promise<HTMLElement> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ConversationBackdrop conversation={c} accent="#6366F1" live={false} deps={deps} />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 20 && host.querySelector('[data-appearance]') === null && c.userPreferences !== undefined; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return host.querySelector('.thread-backdrop') as HTMLElement;
}

describe('le fond du fil', () => {
  test('sans apparence, il rend Signature à l’identique : la couche d’origine, sans style en ligne', async () => {
    const backdrop = await show(conversation());
    expect(backdrop.outerHTML).toBe('<div class="thread-backdrop" aria-hidden="true"></div>');
  });

  test('une couleur unie change le fond au rendu, sans réseau', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'solid', color: 'azur' })));
    expect(backdrop.dataset['appearance']).toBe('solid');
    expect(backdrop.style.backgroundColor).not.toBe('');
  });

  test('un modèle builtin se peint depuis le catalogue embarqué', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'design', pack: 'essentiels', design: 'chevrons' })));
    expect(backdrop.dataset['appearance']).toBe('design');
    expect(backdrop.style.backgroundImage).toContain('data:image/svg+xml');
  });

  test('l’illustration ancrée en bas à droite se retourne en RTL', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'design', pack: 'illustrations', design: 'baobab' })));
    expect(backdrop.hasAttribute('data-flip-rtl')).toBe(true);
  });

  test('un modèle inconnu garde Signature', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'design', pack: 'inconnu', design: 'x' })));
    expect(backdrop.dataset['appearance']).toBeUndefined();
  });

  test('une photo introuvable garde Signature, sans erreur', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'photo', attachmentId: 'a'.repeat(24), veil: 0.3, blur: 4 })));
    expect(backdrop.dataset['appearance']).toBeUndefined();
  });

  test('une photo choisie sur un autre appareil (galerie absente) se lit par les métadonnées de la pièce, jamais par la route authentifiée', async () => {
    const calls: HttpRequest[] = [];
    const request = async (req: HttpRequest) => {
      calls.push(req);
      return { ok: true, data: { attachment: { id: 'b'.repeat(24), fileUrl: 'https://cdn.x/p.jpg' } } };
    };
    const deps = { source: 'gateway', transport: Object.assign(request, { request }) } as unknown as ConversationsDeps;
    const OriginalImage = globalThis.Image;
    class LoadingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as { Image: unknown }).Image = LoadingImage;
    try {
      const backdrop = await show(conversation(chosen({ kind: 'photo', attachmentId: 'b'.repeat(24), veil: 0.3, blur: 4 })), deps);
      expect(backdrop.dataset['appearance']).toBe('photo');
      expect(backdrop.innerHTML).toContain('cdn.x/p.jpg');
      expect(calls.map((call) => call.path)).toEqual([`/api/v1/attachments/${'b'.repeat(24)}/metadata`]);
    } finally {
      (globalThis as { Image: unknown }).Image = OriginalImage;
    }
  });

  test('la pleine définition déjà chargée n’est jamais remplacée par la vignette arrivée après elle', async () => {
    const id = 'c'.repeat(24);
    const request = async () => ({ ok: true, data: { attachment: { id, fileUrl: 'https://cdn.x/full.jpg', thumbnailUrl: 'https://cdn.x/thumb.jpg' } } });
    const deps = { source: 'gateway', transport: Object.assign(request, { request }) } as unknown as ConversationsDeps;
    const OriginalImage = globalThis.Image;
    class CachedFullImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        setTimeout(() => this.onload?.(), value.includes('thumb') ? 60 : 0);
      }
    }
    (globalThis as { Image: unknown }).Image = CachedFullImage;
    try {
      const backdrop = await show(conversation(chosen({ kind: 'photo', attachmentId: id, veil: 0.3, blur: 4 })), deps);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });
      const photo = backdrop.querySelector('.thread-backdrop-photo') as HTMLElement;
      expect(photo.style.backgroundImage).toContain('full.jpg');
      expect(photo.style.filter).toBe('blur(4px)');
      const veil = backdrop.querySelector('.thread-backdrop-veil') as HTMLElement;
      expect(veil.style.backgroundColor).toContain('0.3');
    } finally {
      (globalThis as { Image: unknown }).Image = OriginalImage;
    }
  });
  test('un modèle animé joue sa couche Lottie au-dessus du dessin ; « animations » coupées, le dessin seul reste (#10638)', async () => {
    const animated = await show(conversation(chosen({ kind: 'design', pack: 'animes', design: 'brume-vivante' })));
    expect(animated.dataset['appearance']).toBe('design');
    expect(animated.querySelector('[data-lottie-layer="b19ebab0f4cfeed8.json"]')).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    const still = await show(conversation({ ...chosen({ kind: 'design', pack: 'animes', design: 'brume-vivante' }), animate: false }));
    expect(still.dataset['appearance']).toBe('design');
    expect(still.querySelector('[data-lottie-layer]')).toBeNull();
  });

  test('un modèle statique n’ajoute aucune couche', async () => {
    const backdrop = await show(conversation(chosen({ kind: 'design', pack: 'essentiels', design: 'chevrons' })));
    expect(backdrop.querySelector('[data-lottie-layer]')).toBeNull();
  });
});
