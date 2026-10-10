import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { appQueryClient } from '@/lib/api/query-client';
import { resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import type { PendingAttachment } from '@/lib/send/attachments';
import type { RecorderEngine, RecorderEngineResult } from '@/lib/view/use-recorder';
import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer, type CommentComposerProps, type CommentComposerResult } from './comment-composer';
import type { PickedSticker } from './composer-sticker-sheet';

/**
 * #9318 — **UN COMMENTAIRE PORTE UN SON (fichier ou vocal), UN STICKER, UN
 * EMOJI, UNE VIDÉO OU UN GIF**. La règle « un commentaire n'a ni son ni
 * fichier » est levée par le porteur : le composeur de commentaire reprend
 * les pièces du composeur de message — son micro (`useRecorder` et la barre
 * d'enregistrement du plateau), sa grille d'emojis, sa feuille de stickers.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadStickerPacksCatalog('fr');
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
  root = undefined;
  container = undefined;
  appQueryClient.clear();
  resetFixtureStickersForTests();
  resetFixturePacksForTests();
  globalThis.fetch = realFetch;
});

type Envoi = { readonly content: string; readonly pending: readonly PendingAttachment[] };

async function monter(props: Partial<CommentComposerProps> & { readonly sent?: Envoi[] }): Promise<HTMLDivElement> {
  const sent = props.sent ?? [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentComposer
          language="fr"
          canWrite
          onSend={async (content, pending): Promise<CommentComposerResult> => {
            sent.push({ content, pending });
            return { ok: true };
          }}
          {...props}
        />
      </QueryClientProvider>,
    ),
  );
  return container;
}

async function attendre(predicate: () => boolean): Promise<void> {
  for (let tour = 0; tour < 50 && !predicate(); tour += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

const cliquer = async (node: Element | null | undefined) => {
  if (!(node instanceof HTMLElement)) throw new Error('contrôle absent');
  await act(async () => node.click());
};

async function joindre(host: HTMLElement, files: readonly File[]): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-comment-attach-input]');
  if (input === null) throw new Error('sélecteur absent');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await attendre(() => host.querySelectorAll('[data-composer-edit]').length + host.querySelectorAll('[data-pending-glyph]').length >= files.length);
}

/** Un micro bouchonné et une horloge qu'on avance à la main. */
function micro(result: RecorderEngineResult): { readonly engine: RecorderEngine; readonly clock: { now: number } } {
  const clock = { now: 0 };
  const engine: RecorderEngine = {
    requestStream: async () => result,
    start: () => undefined,
    stop: async () => ({ blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: 'audio/webm;codecs=opus' }),
    release: () => undefined,
  };
  return { engine, clock };
}

/** La barre n'arme ses boutons qu'au tic suivant de son horloge (seuil d'une demi-seconde). */
const armé = (host: HTMLElement, label: string) =>
  attendre(() => host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-disabled') === null);

const flux = (): RecorderEngineResult => ({ ok: true, stream: new EventTarget() as MediaStream });

describe('CommentComposer — un son joint depuis un fichier, et le GIF (#9318)', () => {
  test('le sélecteur ouvre photos, vidéos et sons', async () => {
    const host = await monter({});
    expect(host.querySelector('[data-comment-attach]')?.getAttribute('aria-label')).toBe('Joindre une photo, une vidéo ou un son');
    expect(host.querySelector<HTMLInputElement>('[data-comment-attach-input]')?.accept).toBe('image/*,video/*,audio/*');
  });

  test('un son et un GIF joints partent avec le commentaire, sans texte', async () => {
    const sent: Envoi[] = [];
    const host = await monter({ sent });
    await joindre(host, [
      new File([new Uint8Array([1])], 'chant.mp3', { type: 'audio/mpeg' }),
      new File([new Uint8Array([2])], 'chat.gif', { type: 'image/gif' }),
    ]);
    expect(host.querySelector<HTMLButtonElement>('[data-comment-send]')?.disabled).toBe(false);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.pending.map((piece) => [piece.name, piece.kind])).toEqual([
      ['chant.mp3', 'audio'],
      ['chat.gif', 'image'],
    ]);
  });
});

describe('CommentComposer — le vocal (#9318)', () => {
  test('le micro enregistre, « Arrêter » joint le vocal au plateau, puis l’envoi le porte', async () => {
    const { engine, clock } = micro(flux());
    const sent: Envoi[] = [];
    const host = await monter({ sent, recording: { engine, now: () => clock.now } });
    const voice = host.querySelector('[data-comment-voice]');
    expect(voice?.getAttribute('aria-label')).toBe('Enregistrer un commentaire vocal');
    await cliquer(voice);
    await attendre(() => host.querySelector('[aria-label="Arrêter et ajouter aux pièces jointes"]') !== null);
    clock.now = 2_000;
    await armé(host, 'Arrêter et ajouter aux pièces jointes');
    await cliquer(host.querySelector('[aria-label="Arrêter et ajouter aux pièces jointes"]'));
    await attendre(() => host.querySelector('[data-comment-field]') !== null && host.querySelector('[data-comment-tray]') !== null);
    await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.pending.map((piece) => piece.kind)).toEqual(['audio']);
  });

  test('« Envoyer » depuis la barre d’enregistrement part d’un seul geste, avec le texte', async () => {
    const { engine, clock } = micro(flux());
    const sent: Envoi[] = [];
    const host = await monter({ sent, recording: { engine, now: () => clock.now } });
    const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
    await act(async () => {
      if (field === null) return;
      field.value = 'Écoute ça';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await cliquer(host.querySelector('[data-comment-voice]'));
    await attendre(() => host.querySelector('[aria-label="Envoyer le message vocal"]') !== null);
    clock.now = 1_500;
    await armé(host, 'Envoyer le message vocal');
    await cliquer(host.querySelector('[aria-label="Envoyer le message vocal"]'));
    await attendre(() => sent.length > 0);
    expect(sent[0]?.content).toBe('Écoute ça');
    expect(sent[0]?.pending.map((piece) => piece.kind)).toEqual(['audio']);
  });

  test('un micro refusé se DIT, dans la langue d’interface', async () => {
    const { engine } = micro({ ok: false, reason: 'refused' });
    const host = await monter({ recording: { engine } });
    await cliquer(host.querySelector('[data-comment-voice]'));
    await attendre(() => host.querySelector('[data-comment-notice]') !== null);
    expect(host.querySelector('[data-comment-notice]')?.textContent).toBe('Micro refusé — autorisez-le dans les réglages');
  });
});

describe('CommentComposer — l’emoji (#9318)', () => {
  test('la grille insère l’emoji AU CURSEUR, puis se ferme', async () => {
    const host = await monter({});
    const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
    if (field === null) throw new Error('champ absent');
    await act(async () => {
      field.value = 'ab';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    field.setSelectionRange(1, 1);
    const open = host.querySelector('[data-comment-emoji-open]');
    expect(open?.getAttribute('aria-label')).toBe('Insérer un emoji');
    await cliquer(open);
    const emoji = EXTENDED_REACTIONS[0] ?? '';
    await attendre(() => document.querySelector(`button[aria-label="${emoji}"]`) !== null);
    await cliquer(document.querySelector(`button[aria-label="${emoji}"]`));
    expect(field.value).toBe(`a${emoji}b`);
    expect(document.querySelector(`button[aria-label="${emoji}"]`)).toBeNull();
  });
});

const stickerDe = (id: string): StickerDefinition => ({
  id,
  name: null,
  origin: 'paste',
  mimeType: 'image/png',
  fileUrl: `stickers/u1/${id}.png`,
  width: 512,
  height: 512,
  sizeBytes: 4,
  animated: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-25T10:00:00.000Z',
});

describe('CommentComposer — le sticker (#9318)', () => {
  test('sans envoi de sticker offert par l’hôte, aucun bouton qui mentirait', async () => {
    const host = await monter({});
    expect(host.querySelector('[data-comment-sticker-open]')).toBeNull();
  });

  test('choisir un sticker le remet à l’hôte, à lui seul : le texte en cours reste au champ', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [stickerDe('a')]);
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })) as unknown as typeof fetch;
    const picked: PickedSticker[] = [];
    const host = await monter({
      onSendSticker: async (sticker) => {
        picked.push(sticker);
        return { ok: true };
      },
    });
    const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
    await act(async () => {
      if (field === null) return;
      field.value = 'brouillon';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const open = host.querySelector('[data-comment-sticker-open]');
    expect(open?.getAttribute('aria-label')).toBe('Envoyer un sticker');
    await cliquer(open);
    await attendre(() => document.querySelector('[data-sticker="a"]') !== null);
    await cliquer(document.querySelector('[data-sticker="a"]'));
    await attendre(() => picked.length > 0);
    expect(picked.map((p) => p.sticker.stickerId)).toEqual(['a']);
    expect(document.querySelector('[data-sticker="a"]')).toBeNull();
    expect(field?.value).toBe('brouillon');
  });
});
