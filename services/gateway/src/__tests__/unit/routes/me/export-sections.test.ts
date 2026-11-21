/**
 * Unit tests for routes/me/export-sections.ts (#3633).
 *
 * Covers the pure query functions added to widen GET /me/export beyond
 * profile/messages/contacts: posts, stories, comments, reactions, media,
 * voiceProfile, sessions — each bounded (take/skip), each reporting
 * { total, hasMore } derived from a companion `count`.
 *
 * ─── CES TROIS TÉMOINS ATTESTAIENT LE DÉFAUT (#19909) ──────────────────────
 *
 * Les trois assertions de clause ci-dessous RECOPIAIENT `deletedAt: null`,
 * c'est-à-dire l'égalité nue qui n'appariait aucune ligne — l'une sous le titre
 * « excludes soft-deleted », alors que la clause qu'elle épinglait excluait
 * TOUT. Un témoin qui recopie la clause ne vérifie que sa propre copie.
 *
 * Elles attendent désormais `NOT_DELETED`, importé de la PRODUCTION : l'attendu
 * ne peut plus dériver du site. Leur rôle reste la BORNE (`take`/`skip`) et la
 * projection ; la couverture de COMPORTEMENT — « l'export rend-il la ligne
 * nominale, et la compte-t-il ? » — vit dans
 * `src/__tests__/unit/export-rgpd-publications-nominal-form.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  resolveExportPage,
  exportPosts,
  exportStories,
  exportComments,
  exportReactions,
  exportMedia,
  exportVoiceProfile,
} from '../../../../routes/me/export-sections';
import { exportSessions } from '../../../../routes/me/export-security';
import { findManyIn, matchesMongoWhere } from '../../../helpers/mongo-where';
import { NOT_DELETED } from '../../../../services/posts/softDelete';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const NOW = new Date('2026-10-08T12:00:00.000Z');
const daysBeforeNow = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const liveSession = (userId: string) => ({
  userId,
  isValid: true,
  lastActivityAt: daysBeforeNow(1),
  expiresAt: daysBeforeNow(-30),
});

function fakePrisma(overrides: Record<string, any> = {}) {
  return {
    post: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postComment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    commentReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postMedia: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    userVoiceModel: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    ...overrides,
  } as any;
}

describe('resolveExportPage', () => {
  it('defaults to limit=500, offset=0 with no query', () => {
    expect(resolveExportPage({})).toEqual({ limit: 500, offset: 0 });
  });

  it('caps limit at 2000 even if the client asks for more', () => {
    expect(resolveExportPage({ limit: '999999' })).toEqual({ limit: 2000, offset: 0 });
  });

  it('parses valid limit/offset', () => {
    expect(resolveExportPage({ limit: '100', offset: '50' })).toEqual({ limit: 100, offset: 50 });
  });

  it('clamps a negative offset to 0 and a negative limit to the floor of 1 (validatePagination semantics)', () => {
    expect(resolveExportPage({ limit: '-5', offset: '-1' })).toEqual({ limit: 1, offset: 0 });
  });

  it('falls back to defaults on unparsable (garbage) values', () => {
    expect(resolveExportPage({ limit: 'not-a-number', offset: 'nope' })).toEqual({ limit: 500, offset: 0 });
  });
});

describe('exportPosts', () => {
  it('filters by authorId, type in [POST, REEL], deletedAt NOT_DELETED — bounded by take/skip', async () => {
    const prisma = fakePrisma();
    await exportPosts(prisma, USER_ID, { limit: 10, offset: 5 });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: USER_ID, type: { in: ['POST', 'REEL'] }, deletedAt: NOT_DELETED },
        take: 10,
        skip: 5,
      })
    );
    expect(prisma.post.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, type: { in: ['POST', 'REEL'] }, deletedAt: NOT_DELETED } })
    );
  });

  it('reports hasMore=true when total exceeds offset+returned', async () => {
    const prisma = fakePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: '1' }]), count: jest.fn<any>().mockResolvedValue(5) },
    });
    const section = await exportPosts(prisma, USER_ID, { limit: 1, offset: 0 });
    expect(section).toEqual({ items: [{ id: '1' }], total: 5, hasMore: true });
  });

  it('reports hasMore=false on the last page', async () => {
    const prisma = fakePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: '5' }]), count: jest.fn<any>().mockResolvedValue(5) },
    });
    const section = await exportPosts(prisma, USER_ID, { limit: 1, offset: 4 });
    expect(section.hasMore).toBe(false);
  });
});

describe('exportStories', () => {
  it('filters by type in [STORY, STATUS] — distinct from exportPosts', async () => {
    const prisma = fakePrisma();
    await exportStories(prisma, USER_ID, { limit: 500, offset: 0 });
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, type: { in: ['STORY', 'STATUS'] }, deletedAt: NOT_DELETED } })
    );
  });
});

describe('exportComments', () => {
  it('filters by authorId, excludes soft-deleted', async () => {
    const prisma = fakePrisma();
    await exportComments(prisma, USER_ID, { limit: 500, offset: 0 });
    expect(prisma.postComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: USER_ID, deletedAt: NOT_DELETED } })
    );
  });
});

describe('exportReactions', () => {
  it('queries message reactions by participantId, post/comment reactions by userId — three independent bounded queries', async () => {
    const prisma = fakePrisma();
    const pIds = ['part-1', 'part-2'];
    await exportReactions(prisma, pIds, USER_ID, { limit: 20, offset: 0 });

    expect(prisma.reaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participantId: { in: pIds } }, take: 20, skip: 0 })
    );
    expect(prisma.postReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 20, skip: 0 })
    );
    expect(prisma.commentReaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 20, skip: 0 })
    );
  });

  it('returns three independently-paginated sections', async () => {
    const prisma = fakePrisma({
      reaction: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1' }]), count: jest.fn<any>().mockResolvedValue(1) },
      postReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
      commentReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    });
    const sections = await exportReactions(prisma, ['part-1'], USER_ID, { limit: 500, offset: 0 });
    expect(sections.messages).toEqual({ items: [{ id: 'r1' }], total: 1, hasMore: false });
    expect(sections.posts).toEqual({ items: [], total: 0, hasMore: false });
    expect(sections.comments).toEqual({ items: [], total: 0, hasMore: false });
  });
});

describe('exportMedia', () => {
  const PARTICIPANT = '507f1f77bcf86cd7994390aa';
  const AUTRE_PARTICIPANT = '507f1f77bcf86cd7994390bb';

  it('excludes anonymous uploads and queries both attachment tables by owner', async () => {
    const prisma = fakePrisma();
    await exportMedia(prisma, [PARTICIPANT], USER_ID, { limit: 500, offset: 0 });
    expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uploadedBy: { in: [USER_ID, PARTICIPANT] }, isAnonymous: false } })
    );
    expect(prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uploaderId: USER_ID } })
    );
  });

  /**
   * #20129 — l'export sert les lignes des DEUX espaces de clés.
   *
   * `uploadedBy` portait l'identité de compte pour les quatre écrivains de
   * téléversement et le `Participant.id` pour les deux écrivains de copie
   * (unifiés par #20113 ; les lignes déjà écrites gardent l'ancien espace). Un
   * `where: { uploadedBy: userId }` rate donc les médias TRANSFÉRÉS de
   * l'utilisateur — une omission dans un export d'article 15, sans erreur et
   * sans trace.
   *
   * Le `where` est APPLIQUÉ à des lignes, jamais réaffirmé : un double qui
   * répète la condition ne peut pas voir changer l'espace qu'elle suppose
   * (leçon du 2026-11-20).
   */
  describe('#20129 — les deux espaces de clés', () => {
    const ligne = (id: string, uploadedBy: string, isAnonymous = false) => ({
      id, uploadedBy, isAnonymous, fileUrl: `2026/11/${id}.jpg`, messageId: null,
    });
    const LIGNES = [
      ligne('att-compte', USER_ID),
      ligne('att-herite', PARTICIPANT),
      ligne('att-autrui', OTHER_USER_ID),
      ligne('att-participant-autrui', AUTRE_PARTICIPANT),
      ligne('att-anonyme', USER_ID, true),
    ];

    const servedIds = async (participantIds: readonly string[]) => {
      // `findManyIn` rend `{ findMany, calls }` : c'est son `findMany` qu'on
      // installe, et il APPLIQUE le `where` aux lignes.
      const prisma = fakePrisma({
        messageAttachment: {
          findMany: jest.fn(findManyIn(LIGNES).findMany) as any,
          count: jest.fn<any>().mockResolvedValue(0),
        },
      });
      const sections = await exportMedia(prisma, participantIds, USER_ID, { limit: 500, offset: 0 });
      return sections.attachments.items.map((item: { id: string }) => item.id);
    };

    it('sert la ligne HÉRITÉE, écrite sous le `Participant.id` de l’utilisateur', async () => {
      expect(await servedIds([PARTICIPANT])).toContain('att-herite');
    });

    it('sert toujours la ligne écrite sous l’identité de compte', async () => {
      expect(await servedIds([PARTICIPANT])).toContain('att-compte');
    });

    it('ne sert RIEN d’autrui — ni son compte, ni ses participants', async () => {
      const served = await servedIds([PARTICIPANT]);

      expect(served).not.toContain('att-autrui');
      expect(served).not.toContain('att-participant-autrui');
    });

    it('n’élargit pas l’exclusion des téléversements ANONYMES', async () => {
      expect(await servedIds([PARTICIPANT])).not.toContain('att-anonyme');
    });

    it('sans participant à nommer, se comporte comme avant — l’identité de compte seule', async () => {
      const served = await servedIds([]);

      expect(served).toEqual(['att-compte']);
    });
  });
});

describe('exportVoiceProfile', () => {
  it('never selects the binary embedding/chatterboxConditionals columns', async () => {
    const prisma = fakePrisma();
    await exportVoiceProfile(prisma, USER_ID);
    const call = prisma.userVoiceModel.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ userId: USER_ID });
    expect(call.select).not.toHaveProperty('embedding');
    expect(call.select).not.toHaveProperty('chatterboxConditionals');
    expect(call.select).not.toHaveProperty('embeddingPath');
  });

  it('returns null when the user has no voice profile', async () => {
    const prisma = fakePrisma();
    await expect(exportVoiceProfile(prisma, USER_ID)).resolves.toBeNull();
  });
});

/**
 * Les adresses de média SERVIES par l'archive (#7022, étape 3).
 *
 * `MessageAttachment.fileUrl` / `PostMedia.fileUrl` portent TROIS formes en
 * production (mesuré le 2026-09-18) : une adresse absolue (1600 lignes), une
 * route RELATIVE sans hôte (574), et une CLÉ NUE de l'arborescence datée (738).
 * Les deux dernières n'ouvrent rien chez le destinataire de l'archive — un
 * humain, un outil — qui n'a aucun résolveur : ce n'est pas un défaut à venir,
 * c'en est un ACTIF, pour un quart des lignes.
 *
 * La composition ne se réécrit pas ici : le site unique est
 * `publicMediaUrlFromEnv` (`services/attachments/publicMediaUrl.ts`), qui
 * connaît déjà les trois formes et qui est IDEMPOTENT — une adresse déjà
 * absolue le traverse inchangée. Les témoins ci-dessous exercent donc la
 * composition RÉELLE, jamais une seconde rédigée dans le test, et le socle est
 * posé par l'environnement pour que l'assertion prouve la base CONFIGURÉE et
 * non un hôte codé en dur.
 */
describe("adresses de média servies par l'export", () => {
  const BASE = 'https://gate.exemple.test';
  const CLE_NUE = '2026/09/507f1f77bcf86cd799439011/photo.jpeg';
  const ROUTE_RELATIVE = '/api/attachments/file/2026%2F09%2F507f1f77bcf86cd799439011%2Fvoix.m4a';
  const DEJA_ABSOLUE = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fu%2Fdeja.jpeg';

  let baseInitiale: string | undefined;

  beforeEach(() => {
    baseInitiale = process.env.API_PUBLIC_URL;
    process.env.API_PUBLIC_URL = BASE;
  });

  afterEach(() => {
    if (baseInitiale === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = baseInitiale;
  });

  it('sert une CLÉ NUE de pièce jointe en adresse de flux absolue', async () => {
    const prisma = fakePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'a1', fileUrl: CLE_NUE }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 500, offset: 0 });
    expect(sections.attachments.items[0]).toMatchObject({
      fileUrl: `${BASE}/api/v1/attachments/file/2026%2F09%2F507f1f77bcf86cd799439011%2Fphoto.jpeg`,
    });
  });

  it('sert une CLÉ NUE de média de publication en adresse de flux absolue', async () => {
    const prisma = fakePrisma({
      postMedia: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'm1', fileUrl: CLE_NUE }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 500, offset: 0 });
    expect(sections.postMedia.items[0]).toMatchObject({
      fileUrl: `${BASE}/api/v1/attachments/file/2026%2F09%2F507f1f77bcf86cd799439011%2Fphoto.jpeg`,
    });
  });

  it("pose l'hôte configuré sur une route RELATIVE, qui ne mène nulle part sans lui", async () => {
    const prisma = fakePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'a2', fileUrl: ROUTE_RELATIVE }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 500, offset: 0 });
    expect(sections.attachments.items[0]).toMatchObject({ fileUrl: `${BASE}${ROUTE_RELATIVE}` });
  });

  it('laisse une adresse DÉJÀ ABSOLUE traverser inchangée (idempotence)', async () => {
    const prisma = fakePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'a3', fileUrl: DEJA_ABSOLUE }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
      postMedia: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'm3', fileUrl: DEJA_ABSOLUE }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 500, offset: 0 });
    expect(sections.attachments.items[0]).toMatchObject({ fileUrl: DEJA_ABSOLUE });
    expect(sections.postMedia.items[0]).toMatchObject({ fileUrl: DEJA_ABSOLUE });
  });

  it("ne perd aucune autre colonne de la ligne en composant l'adresse", async () => {
    const ligne = {
      id: 'a4',
      messageId: 'msg-1',
      originalName: 'photo.jpeg',
      mimeType: 'image/jpeg',
      fileSize: 1234,
      fileUrl: CLE_NUE,
      duration: null,
      width: 800,
      height: 600,
      createdAt: new Date('2026-09-18T10:00:00.000Z'),
    };
    const prisma = fakePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([ligne]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 500, offset: 0 });
    expect(sections.attachments.items[0]).toEqual({
      ...ligne,
      fileUrl: `${BASE}/api/v1/attachments/file/2026%2F09%2F507f1f77bcf86cd799439011%2Fphoto.jpeg`,
    });
  });

  it("n'altère ni le total ni hasMore de la section", async () => {
    const prisma = fakePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'a5', fileUrl: CLE_NUE }]),
        count: jest.fn<any>().mockResolvedValue(9),
      },
    });
    const sections = await exportMedia(prisma, [], USER_ID, { limit: 1, offset: 0 });
    expect(sections.attachments.total).toBe(9);
    expect(sections.attachments.hasMore).toBe(true);
  });

  it('sert `referenceAudioUrl` du profil vocal sous la même règle', async () => {
    const prisma = fakePrisma({
      userVoiceModel: {
        findFirst: jest.fn<any>().mockResolvedValue({ profileId: 'vfp_1', referenceAudioUrl: ROUTE_RELATIVE }),
      },
    });
    const profile = await exportVoiceProfile(prisma, USER_ID);
    expect(profile).toEqual({ profileId: 'vfp_1', referenceAudioUrl: `${BASE}${ROUTE_RELATIVE}` });
  });

  it('laisse `referenceAudioUrl` à null quand le profil vocal n’en porte pas', async () => {
    const prisma = fakePrisma({
      userVoiceModel: {
        findFirst: jest.fn<any>().mockResolvedValue({ profileId: 'vfp_2', referenceAudioUrl: null }),
      },
    });
    const profile = await exportVoiceProfile(prisma, USER_ID);
    expect(profile).toEqual({ profileId: 'vfp_2', referenceAudioUrl: null });
  });
});

describe('exportSessions', () => {
  it('never selects sessionToken, refreshToken, or deviceFingerprint', async () => {
    const prisma = fakePrisma();
    await exportSessions(prisma, USER_ID, { limit: 500, offset: 0 }, 'fr');
    const call = prisma.userSession.findMany.mock.calls[0][0];
    expect(call.select).not.toHaveProperty('sessionToken');
    expect(call.select).not.toHaveProperty('refreshToken');
    expect(call.select).not.toHaveProperty('deviceFingerprint');
  });

  it('is bounded and filtered by userId', async () => {
    const prisma = fakePrisma();
    await exportSessions(prisma, USER_ID, { limit: 50, offset: 10 }, 'fr', NOW);
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 10 }));
    const { where } = prisma.userSession.findMany.mock.calls[0][0];
    expect(prisma.userSession.count).toHaveBeenCalledWith({ where });
    expect(matchesMongoWhere(liveSession(USER_ID), where)).toBe(true);
    expect(matchesMongoWhere(liveSession(OTHER_USER_ID), where)).toBe(false);
  });

  // La borne de la purge s'applique à l'export, armée ou non (décision
  // 2026-10-08 « une session … ne se garde pas sans fin », § Lecteurs bornés,
  // #9614) : le where est évalué contre des DOCUMENTS — une session vivante n'a
  // aucune clé `invalidatedAt`, et une négation l'écarterait.
  it('serves the live and recently closed sessions, never one closed beyond the 90-day bound', async () => {
    const prisma = fakePrisma();
    await exportSessions(prisma, USER_ID, { limit: 50, offset: 0 }, 'fr', NOW);
    const { where } = prisma.userSession.findMany.mock.calls[0][0];
    const closed = (daysAgo: number) => ({
      userId: USER_ID,
      isValid: false,
      invalidatedAt: daysBeforeNow(daysAgo),
      lastActivityAt: daysBeforeNow(daysAgo),
      expiresAt: daysBeforeNow(daysAgo - 30),
    });
    expect(matchesMongoWhere(closed(10), where)).toBe(true);
    expect(matchesMongoWhere(closed(120), where)).toBe(false);
  });
});
