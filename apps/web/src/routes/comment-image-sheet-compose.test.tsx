import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import CommentImageSheet, { type CommentImageRequest } from './comment-image-sheet';

/**
 * **LES PUCES DE COMPOSITION AU-DESSUS DE L'APERÇU** (#9687, jumelle de
 * `MessageCardCompositionBar` iOS) — un toucher change la carte, et l'aperçu
 * se repeint aussitôt avec ce qu'elle montre désormais.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadExportCardCatalog('fr');
});

afterEach(() => mounter.unmountAll());

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const post: FeedPost = {
  id: 'p-1',
  type: 'POST',
  createdAt: '2026-10-08T10:00:00.000Z',
  content: 'Le coucher de soleil à Dakar',
  author: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  media: [],
};

const comment = (id: string, minute: number, parentId?: string): PostComment => ({
  id,
  content: `texte ${id}`,
  createdAt: `2026-10-08T10:0${minute}:00.000Z`,
  author: { id: `u-${id}`, username: id, displayName: id.toUpperCase() },
  ...(parentId === undefined ? {} : { parentId }),
});

const root = comment('root', 1);
const r1 = comment('r1', 2, 'root');
const r2 = comment('r2', 3, 'root');
const r3 = comment('r3', 4, 'root');

const request = (target: PostComment, thread: readonly PostComment[]): CommentImageRequest => ({
  comment: target,
  servedText: target.content,
  parent: null,
  composition: { post, thread, readerLanguages: ['fr'], viewer: { id: 'me', displayName: 'Moi' } },
});

const mountSheet = async (value: CommentImageRequest) => {
  const painted: MessageCardInput[] = [];
  await mounter.mount(
    <CommentImageSheet
      request={value}
      handle="moi"
      onClose={() => undefined}
      paint={async (input) => {
        painted.push(input);
        return { blob: new Blob(['x'], { type: 'image/png' }), truncated: false, width: 1080, height: 1080, regions: [] };
      }}
    />,
  );
  await mounter.settle();
  return painted;
};

const chip = (selector: string) => document.querySelector<HTMLButtonElement>(`[data-export-compose] ${selector}`);
const last = (painted: readonly MessageCardInput[]) => painted[painted.length - 1];

describe('un commentaire de premier niveau', () => {
  test('s’ouvre sur « Post + commentaire », et « Commentaire seul » retire le post d’un toucher', async () => {
    const painted = await mountSheet(request(root, []));
    expect(chip('[data-export-compose-mode="postAndComment"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip('[data-export-compose-post]')).toBeNull();
    expect(last(painted)?.quoted?.text).toBe('Le coucher de soleil à Dakar');
    expect(last(painted)?.reply.text).toBe('texte root');

    await mounter.click(chip('[data-export-compose-mode="commentAlone"]'));
    await mounter.settle();
    expect(chip('[data-export-compose-mode="commentAlone"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(last(painted)?.quoted).toBeNull();
    expect(last(painted)?.reply.text).toBe('texte root');
  });
});

describe('une réponse', () => {
  test('s’ouvre sur le fil jusqu’ici ; « Post en tête » l’ajoute ; les cases choisissent les réponses', async () => {
    const painted = await mountSheet(request(r2, [root, r1, r2, r3]));
    expect([...document.querySelectorAll('[data-export-compose-mode]')].map((element) => element.getAttribute('data-export-compose-mode'))).toEqual([
      'threadToHere',
      'postRootAndReply',
      'chosenReplies',
    ]);
    expect(last(painted)?.quoted?.text).toBe('texte root');
    expect(last(painted)?.reply).toMatchObject({ author: 'Fil de commentaires', text: 'R1 : texte r1\nR2 : texte r2' });

    await mounter.click(chip('[data-export-compose-post]'));
    await mounter.settle();
    expect(chip('[data-export-compose-post]')?.getAttribute('aria-pressed')).toBe('true');
    expect(last(painted)?.quoted?.text).toBe('Le coucher de soleil à Dakar');

    await mounter.click(chip('[data-export-compose-mode="chosenReplies"]'));
    await mounter.settle();
    expect(chip('[data-export-compose-post]')?.getAttribute('aria-pressed')).toBe('false');
    expect(chip('[data-export-compose-reply="r1"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip('[data-export-compose-reply="r3"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(chip('[data-export-compose-reply="r2"]')).toBeNull();

    await mounter.click(chip('[data-export-compose-reply="root"]'));
    await mounter.click(chip('[data-export-compose-reply="r3"]'));
    await mounter.settle();
    expect(last(painted)?.quoted?.text).toBe('texte r1');
    expect(last(painted)?.reply.text).toBe('R3 : texte r3\nR2 : texte r2');
  });

  test('les puces sont un groupe nommé, lisible au lecteur d’écran', async () => {
    await mountSheet(request(r2, [root, r1, r2, r3]));
    expect(document.querySelector('[data-export-compose] [role="group"]')?.getAttribute('aria-label')).toBe('Composition');
  });
});
