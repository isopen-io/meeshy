import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { apiDeps } from '@/lib/api/deps';
import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { commentDrafts } from '@/lib/comments/comment-draft';
import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { commentsQueryKey, flattenCommentPages, type CommentInfiniteData } from '@/lib/api/publication-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import type { CommentMediaUpload } from '@/lib/comments/comment-media';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * #9167 — LE FIL TÉLÉVERSE LES PIÈCES AVANT D'ENVOYER LE COMMENTAIRE (miroir
 * `CommentMediaUploader` iOS). Une pièce refusée : rien ne part, le brouillon
 * reste — texte ET vignettes — et le refus se dit.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadStickerPacksCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  appQueryClient.clear();
  /* Le brouillon (#9743) vit pour la durée du PROCESSUS : un refus le garde, le témoin suivant ne doit pas l'hériter. */
  commentDrafts.set(`u_${resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? ''}`, 'post-text-rank2', { text: '', pending: [] });
  resetFixtureCommentsForTests();
  resetFixtureStickersForTests();
  resetFixturePacksForTests();
  globalThis.fetch = realFetch;
});

const realFetch = globalThis.fetch;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function mountThread(uploadMedia: CommentMediaUpload): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentThread postId="post-text-rank2" uploadMedia={uploadMedia} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

async function joindreEtEnvoyer(host: HTMLElement, texte: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
  if (input === null) throw new Error('sélecteur absent');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array([1])], 'plage.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
  await act(async () => {
    if (field === null) return;
    field.value = texte;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
  await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
  await settle();
}

describe('le fil envoie un commentaire avec sa photo (#9167)', () => {
  test('la photo monte en contexte « comment », puis le commentaire paraît et le brouillon se vide', async () => {
    const montés: string[] = [];
    const upload: CommentMediaUpload = async (file): Promise<ApiResult<PostMediaUploadResult>> => {
      montés.push(file.name);
      return { ok: true, status: 201, data: { postMediaId: 'fx-pm-photo', fileUrl: 'https://cdn.example/plage.jpg', mimeType: 'image/jpeg' } };
    };
    const host = await mountThread(upload);
    await joindreEtEnvoyer(host, 'Regarde la mer');
    expect(montés).toEqual(['plage.jpg']);
    expect(host.textContent).toContain('Regarde la mer');
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('');
    expect(host.querySelectorAll('[data-composer-edit]')).toHaveLength(0);
  });

  test('#9736 — pendant que la photo monte, sa vignette montre la part déjà partie', async () => {
    let finir: ((result: ApiResult<PostMediaUploadResult>) => void) | undefined;
    const upload: CommentMediaUpload = (_file, onProgress) => {
      onProgress?.(0.5);
      return new Promise((resolve) => {
        finir = resolve;
      });
    };
    const host = await mountThread(upload);
    await joindreEtEnvoyer(host, '');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    await act(async () => finir?.({ ok: true, status: 201, data: { postMediaId: 'fx-pm-photo', fileUrl: 'https://cdn.example/plage.jpg', mimeType: 'image/jpeg' } }));
    await settle();
    expect(host.querySelector('[data-pending-tile]')).toBeNull();
  });

  test('un téléversement refusé : rien ne part, texte et vignette restent, le refus se dit', async () => {
    const upload: CommentMediaUpload = async () => ({ ok: false, status: 413, error: 'trop gros' });
    const host = await mountThread(upload);
    await joindreEtEnvoyer(host, 'Regarde la mer');
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('Regarde la mer');
    expect(host.querySelectorAll('[data-composer-edit]')).toHaveLength(1);
    expect(host.querySelector('[data-comment-notice]')?.textContent).toBe('La pièce jointe n’a pas pu être envoyée.');
    expect(host.querySelector('[data-comment-list]')?.textContent ?? '').not.toContain('Regarde la mer');
  });
});

describe('le fil envoie un commentaire-sticker (#9318)', () => {
  test('l’image du sticker monte en contexte « comment », puis le descripteur part et revient servi', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [
      {
        id: 'st-1',
        name: null,
        origin: 'paste',
        mimeType: 'image/png',
        fileUrl: 'stickers/u1/st-1.png',
        width: 512,
        height: 512,
        sizeBytes: 4,
        animated: false,
        createdAt: '2026-09-25T10:00:00.000Z',
        lastUsedAt: '2026-09-25T10:00:00.000Z',
      },
    ]);
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })) as unknown as typeof fetch;
    const montés: string[] = [];
    const upload: CommentMediaUpload = async (file): Promise<ApiResult<PostMediaUploadResult>> => {
      montés.push(file.type);
      return { ok: true, status: 201, data: { postMediaId: 'fx-pm-sticker', fileUrl: 'https://cdn.example/st-1.png', mimeType: 'image/png' } };
    };
    const host = await mountThread(upload);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-sticker-open]')?.click());
    for (let tour = 0; tour < 30 && document.querySelector('[data-sticker="st-1"]') === null; tour += 1) await settle();
    await act(async () => document.querySelector<HTMLButtonElement>('[data-sticker="st-1"]')?.click());
    const servis = () => flattenCommentPages(appQueryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('post-text-rank2')));
    for (let tour = 0; tour < 30 && !servis().some((c) => c.id.startsWith('cm-fx-')); tour += 1) await settle();
    expect(montés).toEqual(['image/png']);
    expect(servis().find((c) => c.id.startsWith('cm-fx-'))?.sticker).toEqual({ stickerId: 'st-1' });
  });
});
