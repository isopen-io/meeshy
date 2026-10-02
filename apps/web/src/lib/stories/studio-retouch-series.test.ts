import { describe, expect, test } from 'bun:test';

import { pendingAttachmentOf } from '@/lib/send/attachments';

import { RETOUCH_SCENE_CAP, retouchSeriesOf, retouchSeriesWindow } from './studio-retouch-series';
import { STUDIO_PAGE_MAX } from './studio';
import { studioRetouchSeriesReturn } from './studio-retouch-finish';
import { emptyStudioPage, type StudioPage, type StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

/**
 * « ÉDITER » UNE PIÈCE EN ATTENTE OUVRE TOUTES LES PIÈCES DU MESSAGE (#9126,
 * miroir `ComposerRetouchSeries.swift`) — une scène par image ou vidéo, dans
 * l'ordre du plateau, ouvertes sur la pièce touchée ; « Terminé » ne rend que
 * les scènes retouchées.
 */
const file = (name: string, type: string): File => new File([new Uint8Array([1])], name, { type });

describe('les pièces qui s’ouvrent en scènes', () => {
  test('images et vidéos, dans l’ordre du plateau ; ouvertes sur la touchée', () => {
    const pending = [file('a.png', 'image/png'), file('note.webm', 'audio/webm'), file('b.mp4', 'video/mp4'), file('doc.pdf', 'application/pdf'), file('c.jpg', 'image/jpeg')].map((f) => pendingAttachmentOf(f));
    const serie = retouchSeriesOf(pending, pending[2]!.localId);
    expect(serie?.pieces.map((piece) => piece.name)).toEqual(['a.png', 'b.mp4', 'c.jpg']);
    expect(serie?.focus).toBe(1);
  });

  test('une pièce qui n’a pas de scène (un son) n’ouvre rien', () => {
    const pending = [pendingAttachmentOf(file('note.webm', 'audio/webm'))];
    expect(retouchSeriesOf(pending, pending[0]!.localId)).toBeNull();
  });

  test('plus de pièces que de scènes : la fenêtre garde TOUJOURS la touchée', () => {
    const pending = Array.from({ length: 14 }, (_, index) => pendingAttachmentOf(file(`p${index}.png`, 'image/png')));
    for (const [index, touched] of pending.entries()) {
      const serie = retouchSeriesOf(pending, touched.localId);
      expect(serie?.pieces).toHaveLength(10);
      expect(serie?.pieces[serie.focus]?.localId).toBe(touched.localId);
      expect(serie?.pieces.map((piece) => piece.name)).toContain(`p${index}.png`);
    }
    expect(retouchSeriesWindow(3, 1)).toEqual({ start: 0, end: 3 });
    expect(RETOUCH_SCENE_CAP).toBe(STUDIO_PAGE_MAX);
  });
});

const asset = (original: File, overrides: Partial<StudioVisualAsset> = {}): StudioVisualAsset => ({
  file: original,
  previewUrl: `blob:${original.name}`,
  mediaType: original.type.startsWith('video/') ? 'video' : 'image',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  aspectRatio: 1.5,
  ...overrides,
});

const pageOf = (id: string, original: File, change: (page: StudioPage) => StudioPage = (page) => page): StudioPage =>
  change({ ...emptyStudioPage(id, `t-${id}`, 'fr'), background: asset(original) });

describe('ce que « Terminé » rend', () => {
  const [a, b, c] = [file('a.png', 'image/png'), file('b.mp4', 'video/mp4'), file('c.jpg', 'image/jpeg')];
  const seeded = [
    { index: 0, pageId: 'p1', original: a },
    { index: 1, pageId: 'p2', original: b },
    { index: 2, pageId: 'p3', original: c },
  ];

  test('seules les scènes retouchées repartent, chacune vers SA pièce, image ou vidéo', () => {
    const pages = [
      pageOf('p1', a, (page) => ({ ...page, texts: page.texts.map((layer) => ({ ...layer, text: 'UN' })) })),
      pageOf('p2', b, (page) => ({ ...page, background: page.background && { ...page.background, filter: 'mono' as never } })),
      pageOf('p3', c),
    ];
    expect(studioRetouchSeriesReturn(pages, seeded).map(({ index, render }) => ({ index, render }))).toEqual([
      { index: 0, render: 'render-image' },
      { index: 1, render: 'render-video' },
    ]);
  });

  test('rien de touché ⇒ rien ne repart — aucune vidéo ré-encodée (#9131)', () => {
    expect(studioRetouchSeriesReturn([pageOf('p1', a), pageOf('p2', b), pageOf('p3', c)], seeded)).toEqual([]);
  });

  test('un Cadre, un calque, un son, une transition, une coupe, un muet ou un recadrage comptent comme une retouche (#9136)', () => {
    const touched: readonly ((page: StudioPage) => StudioPage)[] = [
      (page) => ({ ...page, background: page.background && { ...page.background, frame: { fit: 'fill' } as never } }),
      (page) => ({ ...page, overlay: asset(file('o.png', 'image/png')) }),
      (page) => ({ ...page, sound: { previewUrl: 'blob:s', upload: { phase: 'uploading', progress: 0 }, plane: 'background' } as never }),
      (page) => ({ ...page, opening: 'fade' as never }),
      (page) => ({ ...page, background: page.background && { ...page.background, trim: { start: 1, end: 3 } } }),
      (page) => ({ ...page, background: page.background && { ...page.background, muted: true } }),
      (page) => ({ ...page, background: page.background && { ...page.background, crop: { x: 0.1, y: 0, width: 0.8, height: 1 } } }),
    ];
    for (const change of touched) {
      expect(studioRetouchSeriesReturn([pageOf('p1', a, change)], [seeded[0]!])).toHaveLength(1);
    }
  });
});
