import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PendingAttachment } from '@/lib/send/attachments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer, type CommentComposerResult } from './comment-composer';

/**
 * #9167 (jumelle web de #9127) — **UN COMMENTAIRE JOINT UNE PHOTO OU UNE
 * VIDÉO** de la photothèque ; sa vignette porte « Éditer » au centre et ouvre
 * la MÊME retouche que le composeur de message (`composer-retouch.tsx`) ; le
 * média seul suffit à envoyer ; un refus REND les pièces avec le texte.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  document.querySelectorAll('[data-composer-retouch]').forEach((node) => node.remove());
  root = undefined;
  container = undefined;
});

async function monter(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const photo = () => new File([new Uint8Array([1, 2, 3])], 'plage.jpg', { type: 'image/jpeg' });
const video = () => new File([new Uint8Array([4, 5, 6])], 'vague.mp4', { type: 'video/mp4' });

async function attendre(predicate: () => boolean): Promise<void> {
  for (let tour = 0; tour < 50 && !predicate(); tour += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function joindre(host: HTMLElement, files: readonly File[]): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
  if (input === null) throw new Error('sélecteur absent');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await attendre(() => host.querySelectorAll('[data-composer-edit]').length > 0);
}

type Envoi = { readonly content: string; readonly pending: readonly PendingAttachment[] };

function hote(sent: Envoi[], result: CommentComposerResult = { ok: true }) {
  return (
    <CommentComposer
      language="fr"
      canWrite
      onSend={async (content, pending) => {
        sent.push({ content, pending });
        return result;
      }}
    />
  );
}

describe('CommentComposer — photo et vidéo jointes (#9167)', () => {
  test('le trombone ouvre la photothèque, photos et vidéos seulement', async () => {
    const host = await monter(hote([]));
    const attach = host.querySelector<HTMLButtonElement>('[data-comment-attach]');
    expect(attach?.getAttribute('aria-label')).toBe('Joindre une photo ou une vidéo');
    const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
    expect(input?.type).toBe('file');
    expect(input?.accept).toBe('image/*,video/*');
    expect(input?.multiple).toBe(true);
  });

  test('une photo et une vidéo jointes : deux vignettes « Éditer », et l’envoi s’arme sans texte', async () => {
    const host = await monter(hote([]));
    await joindre(host, [photo(), video()]);
    expect(host.querySelectorAll('[data-composer-edit]')).toHaveLength(2);
    expect(host.querySelector<HTMLButtonElement>('[data-comment-send]')?.disabled).toBe(false);
  });

  test('« Éditer » ouvre la retouche du composeur, par-dessus le fil', async () => {
    await import('./composer-retouch');
    const host = await monter(hote([]));
    await joindre(host, [photo(), video()]);
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[data-composer-edit]')[1]?.click());
    await attendre(() => document.querySelector('[data-composer-retouch]') !== null);
    expect(document.querySelector('[data-composer-retouch]')).not.toBeNull();
  });

  test('envoyer remet le texte ET les pièces à l’hôte, puis vide le plateau', async () => {
    const sent: Envoi[] = [];
    const host = await monter(hote(sent));
    await joindre(host, [photo(), video()]);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.content).toBe('');
    expect(sent[0]?.pending.map((piece) => piece.name)).toEqual(['plage.jpg', 'vague.mp4']);
    expect(host.querySelectorAll('[data-composer-edit]')).toHaveLength(0);
  });

  test('un refus REND les pièces au plateau', async () => {
    const host = await monter(hote([], { ok: false, message: 'comments.media.upload_failed' }));
    await joindre(host, [photo()]);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    await attendre(() => host.querySelectorAll('[data-composer-edit]').length > 0);
    expect(host.querySelectorAll('[data-composer-edit]')).toHaveLength(1);
    expect(host.querySelector('[data-comment-notice]')?.textContent).toBe('La pièce jointe n’a pas pu être envoyée.');
  });
});
