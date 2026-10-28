import { describe, it, expect, jest } from '@jest/globals';
import {
  backgroundMediaIdsMissingUrl,
  fillBackgroundMediaUrls,
  withBackgroundMediaUrls,
} from '../storyBackgroundMediaUrl';
import { claimableMediaWhere } from '../mediaOwnership';

const OWN = '507f1f77bcf86cd799439011';
const FOREIGN = '507f1f77bcf86cd799439022';
const OWN_URL = 'https://cdn.example/own.jpg';

describe('backgroundMediaIdsMissingUrl', () => {
  it('ne désigne que les fonds sans adresse, une fois chacun', () => {
    const effects = { mediaObjects: [
      { isBackground: true, postMediaId: OWN },
      { isBackground: true, postMediaId: OWN },
      { isBackground: true, postMediaId: FOREIGN, mediaURL: 'https://x/y.jpg' },
      { isBackground: false, postMediaId: FOREIGN },
      { isBackground: true },
    ] };
    expect(backgroundMediaIdsMissingUrl(effects)).toEqual([OWN]);
  });

  it('ignore un blob sans mediaObjects ou non objet', () => {
    expect(backgroundMediaIdsMissingUrl(undefined)).toEqual([]);
    expect(backgroundMediaIdsMissingUrl({ v: 3, scenes: [] })).toEqual([]);
  });
});

describe('fillBackgroundMediaUrls', () => {
  it('complète mediaURL du fond avec l\'adresse de la pièce désignée', () => {
    const effects = { filter: 'x', mediaObjects: [{ isBackground: true, postMediaId: OWN, scale: 1 }] };
    const filled = fillBackgroundMediaUrls(effects, new Map([[OWN, OWN_URL]]));
    expect(filled).toEqual({ filter: 'x', mediaObjects: [{ isBackground: true, postMediaId: OWN, scale: 1, mediaURL: OWN_URL }] });
    expect(effects.mediaObjects[0]).not.toHaveProperty('mediaURL');
  });

  it('ne touche pas un fond qui porte déjà son adresse', () => {
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: OWN, mediaURL: 'https://kept/a.jpg' }] };
    expect(fillBackgroundMediaUrls(effects, new Map([[OWN, OWN_URL]]))).toBe(effects);
  });

  it('laisse intact un fond dont la pièce n\'appartient pas à la story', () => {
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: FOREIGN }] };
    expect(fillBackgroundMediaUrls(effects, new Map([[OWN, OWN_URL]]))).toBe(effects);
  });
});

describe('withBackgroundMediaUrls', () => {
  const makePrisma = (rows: Array<{ id: string; fileUrl: string | null }>) => {
    const findMany = jest.fn<any>().mockResolvedValue(rows);
    return { prisma: { postMedia: { findMany } } as any, findMany };
  };

  it('ne lit que les pièces possédées par la story (déjà liées ou réclamables par l\'auteur)', async () => {
    const { prisma, findMany } = makePrisma([{ id: OWN, fileUrl: OWN_URL }]);
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: OWN }] };
    const out = await withBackgroundMediaUrls(prisma, effects, { ownerId: OWN, postId: '507f1f77bcf86cd7994390aa', within: [OWN] });
    expect(out).toEqual({ mediaObjects: [{ isBackground: true, postMediaId: OWN, mediaURL: OWN_URL }] });
    const where = findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: [OWN] });
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ postId: '507f1f77bcf86cd7994390aa' });
    expect(where.OR[1]).toEqual(claimableMediaWhere(OWN));
  });

  it('ne lit pas une pièce que la story ne réclame ni ne porte', async () => {
    const { prisma, findMany } = makePrisma([{ id: OWN, fileUrl: OWN_URL }]);
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: OWN }] };
    expect(await withBackgroundMediaUrls(prisma, effects, { ownerId: OWN, within: [] })).toBe(effects);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('ne fait aucune requête quand rien ne manque', async () => {
    const { prisma, findMany } = makePrisma([]);
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: OWN, mediaURL: 'https://a/b.jpg' }] };
    expect(await withBackgroundMediaUrls(prisma, effects, { ownerId: OWN, within: [OWN, FOREIGN] })).toBe(effects);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('une pièce étrangère (absente de la réponse) laisse le fond intact', async () => {
    const { prisma } = makePrisma([]);
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: FOREIGN }] };
    expect(await withBackgroundMediaUrls(prisma, effects, { ownerId: OWN, within: [OWN, FOREIGN] })).toBe(effects);
  });

  it('un échec de lecture ne bloque pas la publication', async () => {
    const prisma = { postMedia: { findMany: jest.fn<any>().mockRejectedValue(new Error('db')) } } as any;
    const effects = { mediaObjects: [{ isBackground: true, postMediaId: OWN }] };
    expect(await withBackgroundMediaUrls(prisma, effects, { ownerId: OWN, within: [OWN, FOREIGN] })).toBe(effects);
  });
});
