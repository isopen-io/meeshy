import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { apiDeps } from '@/lib/api/deps';
import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { commentDrafts } from '@/lib/comments/comment-draft';
import type { CommentMediaUpload } from '@/lib/comments/comment-media';
import { unsentComments } from '@/lib/comments/unsent-comments';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { pendingAttachmentOf } from '@/lib/send/attachments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * #9743 — **LE FIL NE PERD NI BROUILLON NI COMMENTAIRE EN ATTENTE** : fermer
 * la feuille garde le texte et les pièces ; un téléversement refusé les rend
 * même si la feuille s'est fermée entre-temps ; un commentaire dont la
 * création n'a pas abouti reste dans la liste, « Non envoyé », relançable, et
 * repart seul à l'ouverture du fil et au retour du réseau.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const POST = 'post-text-rank2';

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

const viewer = () => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session });
const scope = () => `u_${viewer().id ?? ''}`;

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/* Le brouillon vit pour la durée du PROCESSUS : un témoin voisin peut en avoir laissé un. */
beforeEach(() => {
  commentDrafts.set(scope(), POST, { text: '', pending: [] });
  unsentComments.getState().forgetScope(scope());
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  appQueryClient.clear();
  resetFixtureCommentsForTests();
  unsentComments.getState().forgetScope(scope());
  commentDrafts.set(scope(), POST, { text: '', pending: [] });
  setOnline(true);
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

const okUpload: CommentMediaUpload = async (): Promise<ApiResult<PostMediaUploadResult>> => ({
  ok: true,
  status: 201,
  data: { postMediaId: 'fx-pm-photo', fileUrl: 'https://cdn.example/plage.jpg', mimeType: 'image/jpeg' },
});

async function mountThread(uploadMedia: CommentMediaUpload = okUpload): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentThread postId={POST} uploadMedia={uploadMedia} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

async function fermer(): Promise<void> {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
}

async function écrire(host: HTMLElement, texte: string): Promise<void> {
  const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
  await act(async () => {
    if (field === null) return;
    field.value = texte;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function joindre(host: HTMLElement): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
  if (input === null) throw new Error('sélecteur absent');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array([1])], 'plage.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await settle();
}

const champ = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value;
const tuiles = (host: HTMLElement) => host.querySelectorAll('[data-pending-tile]').length;

function attendre(tempId: string): void {
  const me = viewer();
  unsentComments.getState().park({
    tempId,
    scope: scope(),
    postId: POST,
    body: { content: 'Parti hors ligne', attachmentIds: ['fx-pm-photo'] },
    clientMutationId: tempId.replace(/^cid_/, 'cmid_'),
    row: {
      id: tempId,
      content: 'Parti hors ligne',
      createdAt: '2026-10-09T10:00:00.000Z',
      author: { id: me.id ?? '', displayName: me.displayName },
      pending: true,
      media: [{ id: 'fx-pm-photo', fileUrl: 'https://cdn.example/plage.jpg', mimeType: 'image/jpeg' }],
    },
    pieces: [pendingAttachmentOf(new File([new Uint8Array([1])], 'plage.jpg', { type: 'image/jpeg' }))],
    state: 'unsent',
  });
}

describe('le brouillon d’un commentaire survit à la fermeture du fil (#9743)', () => {
  test('texte et pièce choisis, fil fermé puis rouvert : ils sont là', async () => {
    const host = await mountThread();
    await écrire(host, 'Je reviens');
    await joindre(host);
    expect(tuiles(host)).toBe(1);
    await fermer();
    const reopened = await mountThread();
    await settle();
    expect(champ(reopened)).toBe('Je reviens');
    expect(tuiles(reopened)).toBe(1);
  });

  test('envoyé, le brouillon est vide à la réouverture', async () => {
    const host = await mountThread();
    await écrire(host, 'Parti');
    await joindre(host);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    await settle();
    await fermer();
    const reopened = await mountThread();
    expect(champ(reopened)).toBe('');
    expect(tuiles(reopened)).toBe(0);
  });

  test('fil fermé PENDANT la montée, puis téléversement refusé : texte et pièce reviennent à la réouverture', async () => {
    let refuser: (() => void) | undefined;
    const upload: CommentMediaUpload = () =>
      new Promise((resolve) => {
        refuser = () => resolve({ ok: false, status: 0, error: 'réseau' });
      });
    const host = await mountThread(upload);
    await écrire(host, 'Hors ligne');
    await joindre(host);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    await fermer();
    expect(commentDrafts.get(scope(), POST).pending).toHaveLength(0);
    await act(async () => refuser?.());
    await settle();
    const reopened = await mountThread();
    expect(champ(reopened)).toBe('Hors ligne');
    expect(tuiles(reopened)).toBe(1);
  });
});

describe('un commentaire non envoyé reste dans le fil, relançable (#9743)', () => {
  test('hors ligne : la rangée est là avec son média, « Non envoyé », et « Réessayer »', async () => {
    setOnline(false);
    attendre('cid_attente-1');
    const host = await mountThread();
    const row = host.querySelector('[data-comment-pending]');
    expect(row?.textContent).toContain('Parti hors ligne');
    expect(row?.textContent).toContain('Non envoyé');
    expect(row?.querySelector('[data-comment-media] img')).not.toBeNull();
    expect(row?.querySelector<HTMLButtonElement>('[data-comment-send-retry]')?.textContent).toBe('Réessayer');
    expect(unsentComments.getState().entries).toHaveLength(1);
  });

  test('« Réessayer » le fait partir : la rangée servie prend sa place', async () => {
    setOnline(false);
    attendre('cid_attente-2');
    const host = await mountThread();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-send-retry]')?.click());
    await settle();
    await settle();
    expect(unsentComments.getState().entries).toHaveLength(0);
    expect(host.querySelector('[data-comment-pending]')).toBeNull();
    expect(host.textContent).toContain('Parti hors ligne');
  });

  test('au RETOUR du réseau, il repart seul', async () => {
    setOnline(false);
    attendre('cid_attente-3');
    const host = await mountThread();
    expect(unsentComments.getState().entries).toHaveLength(1);
    await act(async () => setOnline(true));
    await settle();
    await settle();
    expect(unsentComments.getState().entries).toHaveLength(0);
    expect(host.querySelector('[data-comment-pending]')).toBeNull();
  });

  test('à l’OUVERTURE du fil en ligne, il repart seul', async () => {
    attendre('cid_attente-4');
    const host = await mountThread();
    await settle();
    expect(unsentComments.getState().entries).toHaveLength(0);
    expect(host.textContent).toContain('Parti hors ligne');
  });
});
