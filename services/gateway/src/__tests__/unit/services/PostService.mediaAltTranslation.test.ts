/**
 * `PostService.applyMediaAlt` déclenche
 * `MediaAltTranslationService.triggerMediaAltTranslation` (#6737) pour chaque
 * média dont le texte alternatif a été effectivement ÉCRIT — jamais pour la
 * carte brute de la requête. Jumelle exacte de
 * `PostService.mediaCaptionTranslation.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../../services/PostService';
import { MediaAltTranslationService } from '../../../services/posts/MediaAltTranslationService';

const POST_ID = '507f1f77bcf86cd799439011';

const buildPrisma = () => {
  const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
  const prisma = { postMedia: { updateMany } };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & { postMedia: { updateMany: typeof updateMany } };
};

const makeService = (prisma: ReturnType<typeof buildPrisma>) => new PostService(
  prisma as unknown as ConstructorParameters<typeof PostService>[0],
);

const invoke = (
  service: PostService,
  postId: string,
  requestedMediaIds: string[] | undefined,
  mediaAlt: Record<string, string> | undefined,
) => (service as unknown as {
  applyMediaAlt: (p: string, ids: string[] | undefined, a: Record<string, string> | undefined) => Promise<void>;
}).applyMediaAlt(postId, requestedMediaIds, mediaAlt);

describe('PostService.applyMediaAlt — déclenchement de traduction (#6737)', () => {
  let triggerSpy: jest.Mock;

  beforeEach(() => {
    triggerSpy = jest.fn<any>().mockResolvedValue(undefined);
    // @ts-expect-error accessing private static
    MediaAltTranslationService._shared = { triggerMediaAltTranslation: triggerSpy };
  });

  afterEach(() => {
    // @ts-expect-error accessing private static
    MediaAltTranslationService._shared = null;
  });

  it('déclenche la traduction pour chaque média dont le texte alternatif a été écrit', async () => {
    const prisma = buildPrisma();
    await invoke(makeService(prisma), POST_ID, ['media-1', 'media-2'], {
      'media-1': 'Coucher de soleil',
      'media-2': 'Un chat',
      'media-foreign': 'jamais demandé',
    });

    await Promise.resolve();

    expect(triggerSpy).toHaveBeenCalledWith('media-1', 'Coucher de soleil');
    expect(triggerSpy).toHaveBeenCalledWith('media-2', 'Un chat');
    expect(triggerSpy).not.toHaveBeenCalledWith('media-foreign', expect.anything());
  });

  it('déclenche aussi quand le texte alternatif est retiré (texte null — invalidation)', async () => {
    const prisma = buildPrisma();
    await invoke(makeService(prisma), POST_ID, ['media-1'], { 'media-1': '   ' });

    await Promise.resolve();

    expect(triggerSpy).toHaveBeenCalledWith('media-1', null);
  });

  it('ne déclenche rien quand aucun texte alternatif n\'est fourni', async () => {
    const prisma = buildPrisma();
    await invoke(makeService(prisma), POST_ID, ['media-1'], undefined);

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('ne casse pas la publication quand le service de traduction n\'est pas initialisé', async () => {
    // @ts-expect-error accessing private static
    MediaAltTranslationService._shared = null;
    const prisma = buildPrisma();

    await expect(
      invoke(makeService(prisma), POST_ID, ['media-1'], { 'media-1': 'Coucher de soleil' }),
    ).resolves.toBeUndefined();
  });
});
