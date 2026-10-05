import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import { openPublicationShare } from './publication-share';

/**
 * `openPublicationShare` (#8884) — « Partager » une publication ouvre la
 * feuille d'envoi UNIQUE (à une ou plusieurs personnes, à un groupe, ou en
 * publication), avec le lien public en « Plus d'options… ». La feuille ne se
 * monte jamais ici : l'entrée ne fait que DEMANDER.
 */
const postOf = (overrides: Partial<FeedPost> = {}): FeedPost => ({ id: 'p1', type: 'POST', createdAt: '2026-09-30T10:00:00Z', ...overrides });

const previewOfFirst = (requests: SendSheetRequest[]): unknown => {
  const payload = requests[0]?.payload;
  return payload?.kind === 'publication' ? payload.preview : undefined;
};

function opened(post: FeedPost | undefined, postId = 'p1'): SendSheetRequest[] {
  const requests: SendSheetRequest[] = [];
  openPublicationShare({ postId, lookup: () => post, open: (request) => void requests.push(request) });
  return requests;
}

describe('openPublicationShare — la feuille d’envoi, avec le lien public en options (#8884)', () => {
  test('ouvre UNE feuille de partage dont « Plus d’options » porte l’adresse canonique', () => {
    const [request, ...rest] = opened(postOf({ content: 'Bonjour' }));
    expect(rest).toEqual([]);
    expect(request?.intent).toBe('share');
    expect(request?.moreOptions).toEqual({ url: 'https://meeshy.me/feeds/post/p1' });
    expect(request?.payload).toEqual({
      kind: 'publication',
      postId: 'p1',
      postType: 'POST',
      url: 'https://meeshy.me/feeds/post/p1',
      preview: { kind: 'publication', text: 'Bonjour' },
    });
  });

  test('un réel part en REEL, une story en STORY — le format d’origine de la publication', () => {
    expect(opened(postOf({ type: 'REEL' }))[0]?.payload).toMatchObject({ postType: 'REEL' });
    expect(opened(postOf({ type: 'STORY' }))[0]?.payload).toMatchObject({ postType: 'STORY' });
    expect(opened(postOf({ type: 'STATUS' }))[0]?.payload).toMatchObject({ postType: 'POST' });
  });

  test('l’aperçu montre la vignette du premier média, sinon une image, sinon rien', () => {
    const withThumb = opened(postOf({ media: [{ id: 'm', fileUrl: 'https://cdn/v.mp4', mimeType: 'video/mp4', thumbnailUrl: 'https://cdn/v.jpg' }] }));
    expect(withThumb[0]?.payload).toMatchObject({ preview: { thumbUrl: 'https://cdn/v.jpg' } });
    const image = opened(postOf({ media: [{ id: 'm', fileUrl: 'https://cdn/i.jpg', mimeType: 'image/jpeg' }] }));
    expect(image[0]?.payload).toMatchObject({ preview: { thumbUrl: 'https://cdn/i.jpg' } });
    const audio = opened(postOf({ media: [{ id: 'm', fileUrl: 'https://cdn/a.m4a', mimeType: 'audio/mp4' }] }));
    expect(previewOfFirst(audio)).toEqual({ kind: 'publication' });
  });

  test('une publication hors cache (lien direct) s’ouvre quand même, en POST, sans aperçu', () => {
    const [request] = opened(undefined, 'inconnue');
    expect(request?.payload).toEqual({
      kind: 'publication',
      postId: 'inconnue',
      postType: 'POST',
      url: 'https://meeshy.me/feeds/post/inconnue',
      preview: { kind: 'publication' },
    });
  });

  test('un texte de blancs n’est pas un aperçu', () => {
    expect(previewOfFirst(opened(postOf({ content: '   \n ' })))).toEqual({ kind: 'publication' });
  });
});

describe('openPublicationShare — le partage est compté une fois parti', () => {
  test('`onShared` compte le partage de CETTE publication, et rien n’est compté à l’ouverture', () => {
    const recorded: string[] = [];
    const requests: SendSheetRequest[] = [];
    openPublicationShare({ postId: 'p9', lookup: () => undefined, open: (request) => void requests.push(request), record: (id) => void recorded.push(id) });
    expect(recorded).toEqual([]);
    requests[0]?.onShared?.();
    expect(recorded).toEqual(['p9']);
  });
});
