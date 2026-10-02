import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { appQueryClient } from '@/lib/api/query-client';
import type { CommentMediaUpload } from '@/lib/comments/comment-media';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
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
  resetFixtureCommentsForTests();
});

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
