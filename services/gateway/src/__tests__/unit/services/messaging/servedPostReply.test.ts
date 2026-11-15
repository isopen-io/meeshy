/**
 * #7950 — une story RETIRÉE par son auteur ne se sert plus dans les réponses
 * qui la citent.
 *
 * `metadata.postReplyTo` est un instantané FIGÉ : aperçu, vignette, emoji,
 * compteurs. Il survit à l'EXPIRATION (c'est sa raison d'être), pas à la
 * SUPPRESSION : la passerelle servait encore la vignette d'une story supprimée
 * à tous les membres du DM.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  citedPostWithdrawnAt,
  serveNewMessagePostReply,
  servePostReplyCitations,
  type CitedPostPrisma,
} from '../../../../services/messaging/servedPostReply';

const STORY = '507f1f77bcf86cd799439b01';
const AUTRE_STORY = '507f1f77bcf86cd799439b02';
const PUBLIEE = new Date('2026-09-25T08:00:00.000Z');
const EXPIRE = new Date('2026-09-26T05:00:00.000Z');
const SUPPRIMEE = new Date('2026-09-25T09:00:00.000Z');

const instantane = (id = STORY) => ({
  id,
  type: 'STORY',
  moodEmoji: null,
  previewText: 'Coucher de soleil',
  thumbnailUrl: 'https://cdn.meeshy.me/stories/soleil-thumb.jpg',
  reactionCount: 4,
  commentCount: 2,
  shareCount: 1,
  createdAt: PUBLIEE.toISOString(),
  authorId: '507f1f77bcf86cd799439c01',
  authorName: 'Demo',
});

type LignePost = { id: string; type: string; deletedAt: Date | null; expiresAt: Date | null; createdAt: Date };

const post = (over: Partial<LignePost> = {}): LignePost => ({
  id: STORY, type: 'STORY', deletedAt: null, expiresAt: EXPIRE, createdAt: PUBLIEE, ...over,
});

const fauxPrisma = (posts: readonly LignePost[]) => {
  const appels: Array<Record<string, unknown>> = [];
  const prisma = {
    post: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        appels.push(args.where);
        return posts.filter((p) => args.where.id.in.includes(p.id));
      },
    },
  } as unknown as CitedPostPrisma;
  return { prisma, appels };
};

const reponse = (over: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439a11',
  storyReplyToId: STORY,
  metadata: { postReplyTo: instantane(), location: { latitude: 1, longitude: 2 } },
  postReplyTo: instantane(),
  ...over,
});

describe('#7950 — citedPostWithdrawnAt', () => {
  it('une story vivante n’est pas retirée', () => {
    expect(citedPostWithdrawnAt(post())).toBeNull();
  });

  it('une story supprimée AVANT son échéance est retirée, à la date de suppression', () => {
    expect(citedPostWithdrawnAt(post({ deletedAt: SUPPRIMEE }))).toEqual(SUPPRIMEE);
  });

  it('un post permanent supprimé est retiré', () => {
    expect(citedPostWithdrawnAt(post({ type: 'POST', expiresAt: null, deletedAt: SUPPRIMEE }))).toEqual(SUPPRIMEE);
  });

  it('une échéance passée n’est PAS un retrait — l’instantané survit à l’expiration', () => {
    expect(citedPostWithdrawnAt(post({ expiresAt: new Date('2026-09-20T00:00:00.000Z') }))).toBeNull();
  });

  it('un statut MASQUÉ par le balayage après son échéance n’est PAS un retrait', () => {
    const balayage = new Date(EXPIRE.getTime() + 7 * 24 * 3600 * 1000);
    expect(citedPostWithdrawnAt(post({ type: 'STATUS', deletedAt: balayage }))).toBeNull();
  });

  it('une ligne introuvable n’est pas prouvée retirée (l’instantané reste)', () => {
    expect(citedPostWithdrawnAt(undefined)).toBeNull();
  });
});

describe('#7950 — servePostReplyCitations', () => {
  it('retire de l’instantané racine ET de metadata tout ce qui décrit la story supprimée, et pose deletedAt', async () => {
    const { prisma } = fauxPrisma([post({ deletedAt: SUPPRIMEE })]);

    const [servie] = await servePostReplyCitations(prisma, [reponse()]);

    const attendu = {
      id: STORY,
      type: 'STORY',
      moodEmoji: null,
      previewText: '',
      thumbnailUrl: null,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
      createdAt: PUBLIEE.toISOString(),
      authorId: '507f1f77bcf86cd799439c01',
      authorName: 'Demo',
      deletedAt: SUPPRIMEE.toISOString(),
    };
    expect(servie.postReplyTo).toEqual(attendu);
    expect(servie.metadata).toEqual({ postReplyTo: attendu, location: { latitude: 1, longitude: 2 } });
    expect(JSON.stringify(servie)).not.toContain('soleil');
  });

  it('garde l’instantané intact quand la story a seulement expiré', async () => {
    const { prisma } = fauxPrisma([post({ expiresAt: new Date('2026-09-20T00:00:00.000Z') })]);
    const ligne = reponse();

    const [servie] = await servePostReplyCitations(prisma, [ligne]);

    expect(servie).toEqual(ligne);
  });

  it('pose le marqueur même sans instantané (réponse legacy) — la citation dit « indisponible »', async () => {
    const { prisma } = fauxPrisma([post({ deletedAt: SUPPRIMEE })]);

    const [servie] = await servePostReplyCitations(prisma, [reponse({ metadata: null, postReplyTo: undefined })]);

    expect(servie.postReplyTo).toMatchObject({ id: STORY, type: 'STORY', thumbnailUrl: null, previewText: '', deletedAt: SUPPRIMEE.toISOString() });
  });

  it('reconnaît la citation par metadata.postReplyTo quand la surface ne sélectionne pas storyReplyToId', async () => {
    const { prisma } = fauxPrisma([post({ deletedAt: SUPPRIMEE })]);
    const ligne = { id: 'm1', metadata: { postReplyTo: instantane() } };

    const [servie] = await servePostReplyCitations(prisma, [ligne]);

    expect(servie.metadata).toMatchObject({ postReplyTo: { thumbnailUrl: null, deletedAt: SUPPRIMEE.toISOString() } });
    expect('postReplyTo' in servie).toBe(false);
  });

  it('descend dans la citation de message (`replyTo`) et le transfert (`forwardedFrom`)', async () => {
    const { prisma } = fauxPrisma([post({ deletedAt: SUPPRIMEE })]);
    const ligne = {
      id: 'm2',
      replyTo: { id: 'm1', metadata: { postReplyTo: instantane() } },
      forwardedFrom: { id: 'm0', metadata: { postReplyTo: instantane() } },
    };

    const [servie] = await servePostReplyCitations(prisma, [ligne]);

    expect(JSON.stringify(servie)).not.toContain('soleil');
  });

  it('lit TOUTE la page en UNE requête, dédoublonnée', async () => {
    const { prisma, appels } = fauxPrisma([post({ deletedAt: SUPPRIMEE }), post({ id: AUTRE_STORY })]);

    const servies = await servePostReplyCitations(prisma, [
      reponse(),
      reponse({ id: 'b', storyReplyToId: AUTRE_STORY, postReplyTo: instantane(AUTRE_STORY), metadata: { postReplyTo: instantane(AUTRE_STORY) } }),
      reponse({ id: 'c' }),
    ]);

    expect(appels).toHaveLength(1);
    expect((appels[0] as { id: { in: string[] } }).id.in.sort()).toEqual([STORY, AUTRE_STORY].sort());
    expect(servies[0].postReplyTo).toMatchObject({ deletedAt: SUPPRIMEE.toISOString() });
    expect(servies[1].postReplyTo).toEqual(instantane(AUTRE_STORY));
    expect(servies[2].postReplyTo).toMatchObject({ deletedAt: SUPPRIMEE.toISOString() });
  });

  it('ne coûte AUCUNE requête à une page sans citation de story', async () => {
    const { prisma, appels } = fauxPrisma([]);

    const servies = await servePostReplyCitations(prisma, [{ id: 'x', metadata: { location: { latitude: 1 } } }]);

    expect(appels).toHaveLength(0);
    expect(servies).toEqual([{ id: 'x', metadata: { location: { latitude: 1 } } }]);
  });

  it('ignore un identifiant qui n’est pas un ObjectId — Prisma lèverait', async () => {
    const { prisma, appels } = fauxPrisma([]);

    await servePostReplyCitations(prisma, [reponse({ storyReplyToId: 'p-story-1', postReplyTo: undefined, metadata: null })]);

    expect(appels).toHaveLength(0);
  });
});

describe('#7950 — serveNewMessagePostReply (message:new)', () => {
  const ligneComplete = (over: Record<string, unknown> = {}) => ({
    ...post(),
    content: 'Coucher de soleil',
    moodEmoji: null,
    reactionCount: 1,
    commentCount: 0,
    shareCount: 0,
    media: [{ thumbnailUrl: 'https://cdn.meeshy.me/stories/soleil-thumb.jpg' }],
    author: { id: '507f1f77bcf86cd799439c01', username: 'demo', displayName: 'Demo' },
    ...over,
  });

  const unique = (ligne: unknown) => {
    const appels: unknown[] = [];
    const prisma = {
      post: { findUnique: async (args: unknown) => { appels.push(args); return ligne; } },
    } as unknown as CitedPostPrisma;
    return { prisma, appels };
  };

  it('hisse le snapshot d’un message neuf sans relire le post', async () => {
    const { prisma, appels } = unique(ligneComplete());

    const parts = await serveNewMessagePostReply(prisma, { storyReplyToId: STORY, metadata: { postReplyTo: instantane() } });

    expect(parts).toEqual({ postReplyTo: instantane() });
    expect(appels).toHaveLength(0);
  });

  it('une réponse legacy à une story supprimée ne reconstruit pas son contenu', async () => {
    const { prisma } = unique(ligneComplete({ deletedAt: SUPPRIMEE }));

    const parts = await serveNewMessagePostReply(prisma, { storyReplyToId: STORY, metadata: null });

    expect(parts.postReplyTo).toMatchObject({ id: STORY, previewText: '', thumbnailUrl: null, deletedAt: SUPPRIMEE.toISOString() });
  });

  it('une réponse legacy à une story vivante se reconstruit', async () => {
    const { prisma } = unique(ligneComplete());

    const parts = await serveNewMessagePostReply(prisma, { storyReplyToId: STORY, metadata: null });

    expect(parts.postReplyTo).toMatchObject({ previewText: 'Coucher de soleil' });
    expect(parts.postReplyTo).not.toHaveProperty('deletedAt');
  });
});
