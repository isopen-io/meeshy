import { describe, it, expect, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@meeshy/shared/prisma/client/index.js';
import { PRISMA_SERVED_RESULTS } from '../prismaServedResults';
import { commentMediaInclude, mediaInclude, mediaSelect } from '../../services/posts/postIncludes';

/**
 * Le VRAI moteur Prisma (pas le double des suites) : ce sont ses extensions de
 * résultat qui projettent ce que le serveur sert, relations imbriquées
 * comprises. Seule la requête est court-circuitée — aucune base n'est jointe.
 */
const storedTrack = {
  type: 'audio',
  transcription: 'Bonjour à tous',
  url: '/api/v1/attachments/file/translated/media-1_fr.mp3',
  path: '/app/uploads/translated/media-1_fr.mp3',
  durationMs: 4200,
  format: 'audio/mp3',
};

const storedMedia = () => ({
  id: 'media-1',
  fileUrl: '2026/11/u/voice.m4a',
  transcription: { text: 'Hello everyone', language: 'en' },
  captionTranslations: { fr: { text: 'Légende', translationModel: 'nllb' } },
  translations: { fr: storedTrack },
});

const stored = {
  id: 'post-1',
  media: [storedMedia()],
  comments: [{ id: 'comment-1', media: [storedMedia()] }],
  author: { id: 'u1', avatar: 'data:image/png;base64,AAAA', banner: '2026/11/u/banner.webp' },
};

const served = new PrismaClient({ datasourceUrl: 'mongodb://127.0.0.1:1/unreachable' })
  .$extends({
    query: {
      $allModels: {
        async $allOperations({ model }) {
          if (model === 'PostMedia') return [storedMedia()];
          if (model === 'PostComment') return stored.comments[0];
          return stored;
        },
      },
    },
  })
  .$extends({ result: PRISMA_SERVED_RESULTS });

afterAll(() => served.$disconnect());

describe('PRISMA_SERVED_RESULTS — ce que la passerelle sert d’un média de post (#19750)', () => {
  it('test_postMedia_servedThroughThePostInclude_dropsTheDiskPath_keepsTheTrack', async () => {
    const post = await served.post.findFirst({ select: { id: true, media: mediaInclude } });

    const track = (post?.media[0]?.translations as Record<string, Record<string, unknown>>)['fr'];
    expect(track).not.toHaveProperty('path');
    const { path: _diskPath, ...expected } = storedTrack;
    expect(track).toEqual(expected);
  });

  it('test_postMedia_servedThroughACommentInclude_dropsTheDiskPath', async () => {
    const comment = await served.postComment.findFirst({ select: { id: true, media: commentMediaInclude } });

    expect(JSON.stringify(comment)).not.toContain('/app/uploads');
    expect(JSON.stringify(comment)).toContain('/api/v1/attachments/file/translated/media-1_fr.mp3');
  });

  it('test_postMedia_readDirectly_keepsEverythingButThePath', async () => {
    const [media] = await served.postMedia.findMany({ select: mediaSelect });

    expect(media?.transcription).toEqual({ text: 'Hello everyone', language: 'en' });
    expect(media?.captionTranslations).toEqual({ fr: { text: 'Légende', translationModel: 'nllb' } });
    expect(JSON.stringify(media)).not.toContain('/app/uploads');
  });

  it('test_postMedia_legacyRowWithoutTranslations_staysNull', async () => {
    const legacy = new PrismaClient({ datasourceUrl: 'mongodb://127.0.0.1:1/unreachable' })
      .$extends({ query: { $allModels: { async $allOperations() { return [{ id: 'm', translations: null }]; } } } })
      .$extends({ result: PRISMA_SERVED_RESULTS });

    const [media] = await legacy.postMedia.findMany({ select: { id: true, translations: true } });

    expect(media?.translations).toBeNull();
    await legacy.$disconnect();
  });

  it('test_user_dataUriAvatar_isStillNotServed', async () => {
    const post = await served.post.findFirst({
      select: { id: true, author: { select: { id: true, avatar: true, banner: true } } },
    });

    expect(post?.author.avatar).toBeNull();
    expect(post?.author.banner).toBe('2026/11/u/banner.webp');
  });

  it('test_server_readsThroughTheseServedResults', () => {
    const server = readFileSync(path.join(__dirname, '../../server.ts'), 'utf8');

    expect(server).toContain('.$extends({ result: PRISMA_SERVED_RESULTS })');
  });
});
