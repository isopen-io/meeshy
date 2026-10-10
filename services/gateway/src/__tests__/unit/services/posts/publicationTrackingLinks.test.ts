/**
 * #9073 — une publication suit CHAQUE adresse qu'elle affiche : son corps, les
 * textes de sa scène, la légende de chacun de ses médias ; un commentaire, son
 * corps et la légende de son média. La carte se recalcule à l'édition.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  publicationTrackableTexts,
  reconcileTrackingLinks,
  sceneTrackableTexts,
  syncCommentTrackingLinks,
  syncPostTrackingLinks,
} from '../../../../services/posts/publicationTrackingLinks';
import type { ContentTrackingLink } from '../../../../services/TrackingLinkService';

const POST_ID = '507f1f77bcf86cd799439011';
const COMMENT_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439099';

const v3Scene = (...objects: Array<Record<string, unknown>>) => ({ v: 3, scenes: [{ id: 's1', objects }] });

const urlsIn = (content: string): string[] => content.match(/https?:\/\/\S+/g) ?? [];

const fakeCollector = (tokenFor: (url: string) => string = (url) => `tok:${url}`) => {
  const collect = jest.fn(async (params: { content: string }): Promise<ContentTrackingLink[]> =>
    [...new Set(urlsIn(params.content))].map((url) => ({ url, token: tokenFor(url) })));
  return { linkService: { collectContentTrackingLinks: collect }, collect };
};

const failingCollector = () => ({
  linkService: { collectContentTrackingLinks: jest.fn(async (): Promise<ContentTrackingLink[]> => []) },
});

const fakePostPrisma = () => {
  const update = jest.fn(async (_arg: unknown) => ({}));
  return { prisma: { post: { update } }, update };
};

const fakeCommentPrisma = () => {
  const update = jest.fn(async (_arg: unknown) => ({}));
  return { prisma: { postComment: { update } }, update };
};

describe('sceneTrackableTexts', () => {
  it('lit le texte de chaque objet texte d’une scène v3, et ignore les autres kinds', () => {
    const blob = v3Scene(
      { id: 'a', kind: 'text', payload: { text: 'voir https://a.example/x' } },
      { id: 'b', kind: 'image', payload: { mediaId: 'm1' } },
    );
    expect(sceneTrackableTexts(blob)).toEqual(['voir https://a.example/x']);
  });

  it('lit les textObjects v1, y compris l’alias legacy `content`', () => {
    const blob = { textObjects: [{ text: 'https://v1.example' }, { content: 'legacy https://old.example' }] };
    expect(sceneTrackableTexts(blob)).toEqual(['https://v1.example', 'legacy https://old.example']);
  });

  it('rend [] sur un blob illisible', () => {
    expect(sceneTrackableTexts(null)).toEqual([]);
    expect(sceneTrackableTexts('x')).toEqual([]);
    expect(sceneTrackableTexts({ v: 3, scenes: 'nope' })).toEqual([]);
  });
});

describe('publicationTrackableTexts', () => {
  it('joint corps, textes de scène et légendes de média, trimés et dédoublonnés', () => {
    const texts = publicationTrackableTexts({
      content: ' légende https://body.example ',
      storyEffects: v3Scene({ id: 'a', kind: 'text', payload: { text: 'calque https://layer.example' } }),
      mediaCaptions: ['photo https://caption.example', null, '  ', 'photo https://caption.example'],
    });
    expect(texts).toEqual([
      'légende https://body.example',
      'calque https://layer.example',
      'photo https://caption.example',
    ]);
  });
});

describe('reconcileTrackingLinks', () => {
  const stored: ContentTrackingLink[] = [
    { url: 'https://kept.example', token: 'OLD1' },
    { url: 'https://removed.example', token: 'OLD2' },
  ];

  it('garde le jeton stocké d’une URL encore présente, ajoute les nouvelles, retire les disparues', () => {
    const result = reconcileTrackingLinks({
      stored,
      collected: [{ url: 'https://kept.example', token: 'NEW1' }, { url: 'https://new.example', token: 'NEW2' }],
      texts: ['https://kept.example et https://new.example'],
    });
    expect(result).toEqual([
      { url: 'https://kept.example', token: 'OLD1' },
      { url: 'https://new.example', token: 'NEW2' },
    ]);
  });

  it('une collecte en échec (vide) ne supprime jamais un jeton dont l’URL est encore affichée', () => {
    const result = reconcileTrackingLinks({ stored, collected: [], texts: ['toujours https://kept.example'] });
    expect(result).toEqual([{ url: 'https://kept.example', token: 'OLD1' }]);
  });
});

describe('syncPostTrackingLinks', () => {
  it('story légendée + URL dans un calque de texte ⇒ les deux URL reçoivent un jeton', async () => {
    const { linkService, collect } = fakeCollector();
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: {
        id: POST_ID,
        content: 'ma légende https://body.example',
        storyEffects: v3Scene({ id: 'a', kind: 'text', payload: { text: 'https://layer.example' } }),
        metadata: { location: { name: 'Paris' } },
        media: [],
      },
    });

    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(expect.objectContaining({ createdBy: USER_ID, postId: POST_ID }));
    expect(metadata).toEqual({
      location: { name: 'Paris' },
      trackingLinks: [
        { url: 'https://body.example', token: 'tok:https://body.example' },
        { url: 'https://layer.example', token: 'tok:https://layer.example' },
      ],
    });
    expect(update).toHaveBeenCalledWith({ where: { id: POST_ID }, data: { metadata } });
  });

  it('URL dans la légende d’un média ⇒ jeton', async () => {
    const { linkService } = fakeCollector();
    const { prisma } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: { id: POST_ID, content: null, storyEffects: null, metadata: null, media: [{ caption: 'vu sur https://cap.example' }] },
    });

    expect(metadata).toEqual({ trackingLinks: [{ url: 'https://cap.example', token: 'tok:https://cap.example' }] });
  });

  it('édition ⇒ carte recalculée : l’URL retirée sort, la nouvelle entre, le jeton gardé reste', async () => {
    const { linkService } = fakeCollector(() => 'FRESH');
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: {
        id: POST_ID,
        content: 'https://kept.example puis https://added.example',
        metadata: { trackingLinks: [{ url: 'https://kept.example', token: 'OLD1' }, { url: 'https://gone.example', token: 'OLD2' }] },
        media: [],
      },
    });

    expect(metadata).toEqual({
      trackingLinks: [{ url: 'https://kept.example', token: 'OLD1' }, { url: 'https://added.example', token: 'FRESH' }],
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('la dernière URL retirée vide la carte (metadata null si elle ne portait qu’elle)', async () => {
    const { linkService, collect } = fakeCollector();
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: { id: POST_ID, content: 'plus de lien', metadata: { trackingLinks: [{ url: 'https://gone.example', token: 'T' }] }, media: [] },
    });

    expect(metadata).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('carte inchangée ⇒ aucune écriture, rend undefined', async () => {
    const { linkService } = fakeCollector(() => 'T');
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: { id: POST_ID, content: 'https://same.example', metadata: { trackingLinks: [{ url: 'https://same.example', token: 'T' }] }, media: [] },
    });

    expect(metadata).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('aucun texte ni carte ⇒ ni collecte ni écriture', async () => {
    const { linkService, collect } = fakeCollector();
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma, linkService, createdBy: USER_ID, post: { id: POST_ID, content: '', metadata: null, media: [] },
    });

    expect(metadata).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('collecte en échec ⇒ le jeton vivant est conservé, aucune écriture', async () => {
    const { linkService } = failingCollector();
    const { prisma, update } = fakePostPrisma();

    const metadata = await syncPostTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      post: { id: POST_ID, content: 'https://kept.example', metadata: { trackingLinks: [{ url: 'https://kept.example', token: 'OLD' }] }, media: [] },
    });

    expect(metadata).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('ne jette jamais : une écriture en panne rend undefined', async () => {
    const { linkService } = fakeCollector();
    const prisma = { post: { update: jest.fn(async () => { throw new Error('db down'); }) } };

    await expect(syncPostTrackingLinks({
      prisma, linkService, createdBy: USER_ID, post: { id: POST_ID, content: 'https://x.example', metadata: null, media: [] },
    })).resolves.toBeUndefined();
  });
});

describe('syncCommentTrackingLinks', () => {
  it('commentaire : corps + légende de son média ⇒ jetons', async () => {
    const { linkService, collect } = fakeCollector();
    const { prisma, update } = fakeCommentPrisma();

    const metadata = await syncCommentTrackingLinks({
      prisma,
      linkService,
      createdBy: USER_ID,
      comment: {
        id: COMMENT_ID,
        content: 'regarde https://body.example',
        metadata: null,
        media: [{ caption: 'source https://cap.example' }],
      },
    });

    expect(collect).toHaveBeenCalledWith(expect.objectContaining({ createdBy: USER_ID }));
    expect(metadata).toEqual({
      trackingLinks: [
        { url: 'https://body.example', token: 'tok:https://body.example' },
        { url: 'https://cap.example', token: 'tok:https://cap.example' },
      ],
    });
    expect(update).toHaveBeenCalledWith({ where: { id: COMMENT_ID }, data: { metadata } });
  });
});
