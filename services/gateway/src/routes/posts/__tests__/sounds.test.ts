import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerSoundRoutes } from '../sounds';

// ⚠ v1 : les fixtures utilisaient 'sound-1', rejeté par la garde ObjectId de
// la route elle-même — 4 tests sur 6 recevaient 400, dont celui censé prouver
// que `contentHash` ne fuit pas : il passait sur un corps d'erreur.
const ID = '507f1f77bcf86cd799439011';

function auth(userId = 'user-abc') {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester' },
      userId, hasFullAccess: true,
    };
  };
}

async function buildApp(prisma: unknown, userId = 'user-abc') {
  const app = Fastify();
  registerSoundRoutes(app, prisma as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId));
  await app.ready();
  return app;
}

const base = { id: ID, title: 'S', fileUrl: '/f.m4a', durationMs: 1000, waveform: [], usageCount: 0 };

describe('routes /sounds', () => {
  it('test_getSound_privateSoundOfOtherUser_returns403', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'autrui', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SOUND_FORBIDDEN');
  });

  it('test_getSound_ownPrivateSound_returns200', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, title: 'Mon son', uploaderId: 'user-abc', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Mon son');
  });

  it('test_getSound_mutedSound_returns410', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: new Date() }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe('SOUND_MUTED');
  });

  it('test_getSound_response_neverLeaksContentHashNorUploaderId', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, contentHash: 'secret-hash' }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('uploaderId');
  });

  it('test_getSound_malformedId_returns400', async () => {
    const prisma = { sound: { findUnique: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/pas-un-id' });
    expect(res.statusCode).toBe(400);
    expect(prisma.sound.findUnique).not.toHaveBeenCalled();
  });

  it('test_patchSound_notOwner_returns403', async () => {
    const prisma = { sound: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: ID, uploaderId: 'autrui' }),
      update: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { isPublic: false } });
    expect(res.statusCode).toBe(403);
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_getMine_returnsRootLevelPagination', async () => {
    const prisma = { sound: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, createdAt: new Date() }]) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?limit=1' });
    expect(res.statusCode).toBe(200);
    // `sendSuccess` place la pagination À LA RACINE, pas sous `meta`.
    expect(res.json().pagination).toBeDefined();
  });

  it('test_getMine_invalidCursor_returns400', async () => {
    const prisma = { sound: { findMany: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?cursor=pas-une-date' });
    expect(res.statusCode).toBe(400);
  });

  /**
   * Le `where` n'était jamais asserté : retirer `uploaderId` aurait fait lister
   * les sons de TOUT LE MONDE — y compris les privés — au vert, puisque le seul
   * test existant se contente de vérifier la forme de la pagination.
   */
  it('test_getMine_isScopedToTheCallerAndHidesMutedSounds', async () => {
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    const res = await (await buildApp({ sound: { findMany } }, 'user-abc'))
      .inject({ method: 'GET', url: '/sounds/mine' });
    expect(res.statusCode).toBe(200);
    // Forme isSet-safe : `mutedAt: null` seul ne matche PAS un champ ABSENT
    // en Prisma-Mongo, et aucun chemin de création ne pose `mutedAt` — le
    // filtre nu rendait « Mes sons » vide dès le premier upload (prod
    // 2026-08-02). Cf. NOT_MUTED_WHERE dans soundFormats.ts.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        uploaderId: 'user-abc',
        AND: [{ OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }] }],
      }),
    }));
  });

  it('test_getMine_cursor_filtersOnCreatedAt', async () => {
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    const cursor = '2026-07-30T12:00:00.000Z';
    await (await buildApp({ sound: { findMany } })).inject({
      method: 'GET', url: `/sounds/mine?cursor=${encodeURIComponent(cursor)}`,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { lt: new Date(cursor) } }),
    }));
  });

  /**
   * Le crédit était PROMIS par le schéma et rendu par AUCUNE surface : la liste
   * publique aurait affiché N entrées identiques sans auteur. Il se résout à la
   * lecture via la relation — figer un pseudo dans la ligne le publierait à vie,
   * y compris après renommage ou suppression du compte.
   */
  it('test_getSound_exposesTheProjectedUploader', async () => {
    const findUnique = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, isAutoGenerated: true,
      uploader: { id: 'user-abc', username: 'alice', displayName: 'Alice', avatar: '/a.png' },
    });
    const res = await (await buildApp({ sound: { findUnique } })).inject({ method: 'GET', url: `/sounds/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.uploader).toEqual({
      id: 'user-abc', username: 'alice', displayName: 'Alice', avatar: '/a.png',
    });
    // La requête doit RÉELLEMENT demander la relation, sinon le DTO renvoie null.
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ uploader: expect.anything() }),
    }));
  });

  it('test_toDTO_uploaderProjection_neverLeaksTheWholeUser', async () => {
    // La relation entière contient e-mail, téléphone, rôle… : seule la
    // projection `authorSelect` doit sortir.
    const findUnique = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null,
      uploader: {
        id: 'user-abc', username: 'alice', displayName: 'Alice', avatar: null,
        email: 'alice@example.com', phoneNumber: '+33600000000', role: 'ADMIN',
      },
    });
    const res = await (await buildApp({ sound: { findUnique } })).inject({ method: 'GET', url: `/sounds/${ID}` });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('alice@example.com');
    expect(body).not.toContain('+33600000000');
    expect(body).not.toContain('ADMIN');
  });

  it('test_getSound_withoutUploaderIncluded_returnsNullNotACrash', async () => {
    const findUnique = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null,
    });
    const res = await (await buildApp({ sound: { findUnique } })).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.uploader).toBeNull();
  });

  it('test_patchSound_ownerCanTitleTheirSound', async () => {
    const update = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({
      ...base, title: 'Ma prod', uploaderId: 'user-abc', isPublic: true,
    });
    const prisma = { sound: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: ID, uploaderId: 'user-abc' }),
      update } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { title: 'Ma prod' } });

    expect(res.statusCode).toBe(200);
    // ÉCRITURE CHAMP PAR CHAMP : `isPublic` n'est PAS touché. Un
    // `data: parsed.data` aurait écrit `undefined` dessus, donc renommer un son
    // privé l'aurait repassé public.
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { title: 'Ma prod' } }));
  });

  it('test_patchSound_emptyTitle_isAccepted', async () => {
    // Seul moyen pour un auteur de retirer un titre malheureux sans qu'un admin
    // coupe le son entier.
    const update = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ ...base, title: '' });
    const prisma = { sound: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: ID, uploaderId: 'user-abc' }),
      update } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { title: '' } });
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { title: '' } }));
  });

  it('test_patchSound_overlongTitle_isRejected', async () => {
    const update = jest.fn();
    const prisma = { sound: { findUnique: jest.fn(), update } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { title: 'x'.repeat(101) } });
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('test_patchSound_emptyBody_isRejected', async () => {
    // Sans ce refus, un corps vide serait un succès qui ne modifie rien.
    const update = jest.fn();
    const prisma = { sound: { findUnique: jest.fn(), update } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('test_getMine_neverLeaksContentHashNorUploaderId', async () => {
    const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null,
        createdAt: new Date(), contentHash: 'secret-hash' },
    ]);
    const res = await (await buildApp({ sound: { findMany } })).inject({ method: 'GET', url: '/sounds/mine' });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('uploaderId');
  });
});

/**
 * La « page du son » : les contenus PUBLICS qui l'utilisent.
 *
 * Contre-proposition à une recherche dans le texte des posts, qui aurait été un
 * balayage de la plus grosse collection sur un champ non indexé. Ici la lecture
 * part de `soundId`, déjà indexé.
 */
describe('GET /sounds/:id/posts', () => {
  const usage = (postId: string) => ({ postId, createdAt: new Date('2026-07-30T10:00:00Z') });

  function buildPrisma(posts: unknown[], usages = [usage('post-1')]) {
    return {
      soundUsage: { findMany: jest.fn<(a: unknown) => Promise<unknown[]>>().mockResolvedValue(usages) },
      post: { findMany: jest.fn<(a: unknown) => Promise<unknown[]>>().mockResolvedValue(posts) },
    };
  }

  it('test_soundPosts_readsByIndexedSoundId', async () => {
    const prisma = buildPrisma([]);
    await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    expect(prisma.soundUsage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ soundId: ID }) }),
    );
  });

  /**
   * GARDE D'AUDIENCE : un son est public, les posts qui l'utilisent ne le sont
   * pas forcément. Sans ce filtre, la route laisserait deviner l'existence et le
   * texte de contenus restreints à partir d'un son.
   */
  it('test_soundPosts_isRestrictedToPublicLivePosts', async () => {
    const prisma = buildPrisma([]);
    await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    const where = (prisma.post.findMany.mock.calls[0][0] as any).where;
    expect(where.visibility).toBe('PUBLIC');
    expect(where.deletedAt).toBeDefined();
    // Une story expirée ne doit pas survivre à son expiration par cette porte.
    expect(JSON.stringify(where.OR)).toContain('expiresAt');
  });

  it('test_soundPosts_neverSelectsTheWholePost', async () => {
    const prisma = buildPrisma([]);
    await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    const args = prisma.post.findMany.mock.calls[0][0] as any;
    // Projection explicite : pas de `visibilityUserIds`, pas de `metadata`.
    expect(args.select).toBeDefined();
    expect(args.select.visibilityUserIds).toBeUndefined();
    expect(args.select.author).toBeDefined();
  });

  it('test_soundPosts_noUsage_returnsEmptyWithoutQueryingPosts', async () => {
    const prisma = buildPrisma([], []);
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('test_soundPosts_deduplicatesPostIdsAcrossTracks', async () => {
    // Le même post peut utiliser un son sur plusieurs pistes : une seule
    // recherche de post, pas une par usage.
    const prisma = buildPrisma([], [usage('post-1'), usage('post-1'), usage('post-2')]);
    await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    const where = (prisma.post.findMany.mock.calls[0][0] as any).where;
    expect(where.id.in).toEqual(['post-1', 'post-2']);
  });

  it('test_soundPosts_malformedId_neverReachesTheDatabase', async () => {
    const prisma = buildPrisma([]);
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/pas-un-id/posts' });
    expect(res.statusCode).toBe(400);
    expect(prisma.soundUsage.findMany).not.toHaveBeenCalled();
  });
});

describe('routes /sounds — compteurs affichés', () => {
  /**
   * Prisma minimal portant de VRAIS usages, pour prouver que les compteurs
   * traversent réellement le DTO. Les autres fixtures de ce fichier n'ont pas
   * de `soundUsage` : `loadSoundStats` y dégrade sur 0/0 et un test qui
   * attendrait 0 passerait aussi bien sur du code cassé.
   */
  function prismaWithUsages(sound: Record<string, unknown>, usages: Array<{ soundId: string; postId: string }>,
                            posts: Array<{ id: string; viewCount: number }>) {
    return {
      sound: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(sound),
        findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue([sound]),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...sound, title: 'Nommé' }),
      },
      soundUsage: { findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue(usages) },
      post: { findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue(posts) },
    };
  }

  it('test_getSound_exposePostCountEtPlayCount', async () => {
    const prisma = prismaWithUsages(
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null },
      [{ soundId: ID, postId: 'p1' }, { soundId: ID, postId: 'p2' }],
      [{ id: 'p1', viewCount: 120 }, { id: 'p2', viewCount: 30 }],
    );
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.postCount).toBe(2);
    expect(res.json().data.playCount).toBe(150);
  });

  it('test_getSound_publicationMultiPistes_neCompteQuUneFois', async () => {
    // La régression que le dédoublonnage empêche, vue depuis la route : une
    // story qui pose le son sur trois diapositives ne vaut PAS 3 × 120 vues.
    const prisma = prismaWithUsages(
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null },
      [{ soundId: ID, postId: 'p1' }, { soundId: ID, postId: 'p1' }, { soundId: ID, postId: 'p1' }],
      [{ id: 'p1', viewCount: 120 }],
    );
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });

    expect(res.json().data).toMatchObject({ postCount: 1, playCount: 120 });
  });

  it('test_getMine_chargeLesCompteursEnUneSeuleRequete', async () => {
    const prisma = prismaWithUsages(
      { ...base, createdAt: new Date(), uploaderId: 'user-abc', isPublic: true, mutedAt: null },
      [{ soundId: ID, postId: 'p1' }], [{ id: 'p1', viewCount: 9 }],
    );
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].playCount).toBe(9);
    // Pas de N+1 : une requête d'usages pour toute la page, pas une par son.
    expect(prisma.soundUsage.findMany).toHaveBeenCalledTimes(1);
  });

  it('test_patchSound_renommage_conserveLesCompteurs', async () => {
    // Le client remplace la ligne EN PLACE avec cette réponse : un DTO sans
    // compteurs ferait retomber la ligne à 0/0 juste après le renommage.
    const prisma = prismaWithUsages(
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null },
      [{ soundId: ID, postId: 'p1' }], [{ id: 'p1', viewCount: 77 }],
    );
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { title: 'Nommé' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ title: 'Nommé', postCount: 1, playCount: 77 });
  });

  it('test_getSound_compteursIndisponibles_rendQuandMemeLeSon', async () => {
    const prisma = {
      sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null }) },
      soundUsage: { findMany: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('mongo down')) },
      post: { findMany: jest.fn() },
    };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: ID, postCount: 0, playCount: 0 });
  });
});
