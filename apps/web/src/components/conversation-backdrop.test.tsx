import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

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

async function show(c: Conversation): Promise<HTMLElement> {
  const queryClient = new QueryClient();
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ConversationBackdrop conversation={c} accent="#6366F1" live={false} />
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
});
