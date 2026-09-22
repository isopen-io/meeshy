/**
 * Ce qui part À CÔTÉ d'une publication servie à quelqu'un d'autre que son auteur.
 *
 * #7407 — `visibilityUserIds` est la liste d'AUDIENCE : pour `ONLY`, les
 * personnes visées ; pour `EXCEPT`, les personnes EXCLUES. Un ami non exclu qui
 * la reçoit apprend qui l'auteur a écarté ; un visé apprend qui d'autre est
 * dans la confidence. Seul l'AUTEUR la reçoit — sur les listes, la fiche, et
 * jamais par une republication, dont la liste est HÉRITÉE de la source.
 *
 * #7406 — `reactions` est le Json legacy `[{ userId, emoji, createdAt }]` : il
 * donnait l'identifiant de chaque personne ayant réagi, sans borne, dans chaque
 * carte de chaque liste. Il ne part plus sur aucune lecture.
 *
 * Les témoins lisent la RÉPONSE SÉRIALISÉE (`app.inject().json()` et le corps
 * brut) : c'est ce qui part sur le fil, pas l'objet d'un service.
 *
 * Le double Prisma HONORE le `where` (audience comprise : un ami non exclu voit
 * la publication `EXCEPT`, l'exclu ne la voit pas) ET le `select` — il ne rend
 * que les champs demandés, `include` rendant tous les scalaires comme Prisma.
 * Un double qui ignorerait le `select` laisserait passer `reactions` quel que
 * soit le correctif, et ne pourrait jamais verdir ; un double qui approuverait
 * tout `where` servirait des publications que le lecteur n'a pas le droit de
 * voir, et ne pourrait jamais rougir pour la bonne raison.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// Un cache VIDE et indisponible : chaque lecture repasse par le double Prisma.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    isAvailable: () => false,
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    getNativeClient: () => null,
  }),
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { registerFeedRoutes } from '../../../../routes/posts/feed';
import { registerHashtagRoutes } from '../../../../routes/posts/hashtag';
import { registerCoreRoutes } from '../../../../routes/posts/core';

const AUTEUR = '507f1f77bcf86cd799439001';
const AMI = '507f1f77bcf86cd799439002';
const EXCLU = '507f1f77bcf86cd799439003';
const CONFIDENT = '507f1f77bcf86cd799439004';
const REACTEUR = '507f1f77bcf86cd799439005';
const NOW = new Date('2026-09-22T08:00:00.000Z');

const idDe = (n: number) => `bbbbbbbbbbbbbbbbbbbb${String(n).padStart(4, '0')}`;
const EXCEPT_POST = idDe(1);
const ONLY_POST = idDe(2);
const PUBLIC_POST = idDe(3);
const EXCEPT_STORY = idDe(4);
const EXCEPT_STATUS = idDe(5);
const REPUBLICATION = idDe(6);

const RELATIONS = new Set(['author', 'media', 'comments', 'repostOf', 'postMentions']);

type Ligne = Record<string, unknown> & { readonly id: string };

function publication(id: string, extra: Record<string, unknown> = {}): Ligne {
  return {
    id,
    authorId: AUTEUR,
    type: 'POST',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    content: `Publication ${id} #confidence`,
    originalLanguage: 'fr',
    translations: null,
    metadata: null,
    storyEffects: null,
    isQuote: false,
    repostOfId: null,
    originalRepostOfId: null,
    communityId: null,
    expiresAt: null,
    deletedAt: null,
    reactionSummary: { '❤️': 1 },
    reactionCount: 1,
    reactions: [{ userId: REACTEUR, emoji: '❤️', createdAt: NOW.toISOString() }],
    likeCount: 1,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: NOW,
    updatedAt: NOW,
    author: { id: AUTEUR, username: 'auteur', displayName: 'Auteur', avatar: null },
    media: [],
    comments: [],
    repostOf: null,
    postMentions: [],
    ...extra,
  };
}

function scenario(): Ligne[] {
  return [
    publication(EXCEPT_POST, { visibility: 'EXCEPT', visibilityUserIds: [EXCLU] }),
    publication(ONLY_POST, { visibility: 'ONLY', visibilityUserIds: [AMI, CONFIDENT] }),
    // Passée d'EXCEPT à PUBLIC par un client qui n'a pas vidé la liste : la
    // colonne n'est pas remise à zéro par `updatePost`, et rien ne dit qu'elle
    // l'a été partout.
    publication(PUBLIC_POST, { visibilityUserIds: [EXCLU] }),
    publication(EXCEPT_STORY, { type: 'STORY', visibility: 'EXCEPT', visibilityUserIds: [EXCLU], expiresAt: new Date(NOW.getTime() + 3_600_000) }),
    publication(EXCEPT_STATUS, { type: 'STATUS', visibility: 'EXCEPT', visibilityUserIds: [EXCLU], moodEmoji: '🙂' }),
    // Republication d'AMI : `EXCEPT` HÉRITE la liste de la source
    // (`repostVisibilityInheritsAudienceList`) — AMI en est l'auteur, pas celui
    // qui l'a écrite.
    publication(REPUBLICATION, {
      authorId: AMI,
      author: { id: AMI, username: 'ami', displayName: 'Ami', avatar: null },
      visibility: 'EXCEPT',
      visibilityUserIds: [EXCLU],
      repostOfId: EXCEPT_POST,
      originalRepostOfId: EXCEPT_POST,
      repostOf: { id: EXCEPT_POST, type: 'POST' },
    }),
  ];
}

function valeurCorrespond(valeur: unknown, champ: unknown): boolean {
  if (valeur === null) return champ === null || champ === undefined;
  if (valeur instanceof Date) return champ instanceof Date && champ.getTime() === valeur.getTime();
  if (typeof valeur !== 'object') return champ === valeur;
  const op = valeur as Record<string, unknown>;
  return Object.entries(op).every(([nom, attendu]) => {
    switch (nom) {
      case 'in': return (attendu as unknown[]).includes(champ);
      case 'notIn': return !(attendu as unknown[]).includes(champ);
      case 'not': return attendu === null ? champ !== null && champ !== undefined : champ !== attendu;
      case 'has': return Array.isArray(champ) && champ.includes(attendu);
      case 'isSet': return attendu === (champ !== null && champ !== undefined);
      case 'equals': return attendu === null ? champ === null || champ === undefined : champ === attendu;
      case 'gt': return champ instanceof Date && champ.getTime() > (attendu as Date).getTime();
      case 'lt': return champ instanceof Date && champ.getTime() < (attendu as Date).getTime();
      default: throw new Error(`double Prisma : opérateur non interprété « ${nom} »`);
    }
  });
}

function correspond(ligne: Ligne, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([cle, valeur]) => {
    switch (cle) {
      case 'AND': return (valeur as Array<Record<string, unknown>>).every((sous) => correspond(ligne, sous));
      case 'OR': return (valeur as Array<Record<string, unknown>>).some((sous) => correspond(ligne, sous));
      case 'NOT': return !correspond(ligne, valeur as Record<string, unknown>);
      case 'id': case 'authorId': case 'type': case 'visibility': case 'visibilityUserIds':
      case 'deletedAt': case 'expiresAt': case 'repostOfId': case 'communityId': case 'createdAt':
        return valeurCorrespond(valeur, ligne[cle]);
      default: throw new Error(`double Prisma : clé de where non interprétée « ${cle} »`);
    }
  });
}

/** Ce que Prisma rend : les clés du `select`, ou tous les scalaires + les relations d'`include`. */
function projeter(ligne: Ligne, args: { select?: Record<string, unknown>; include?: Record<string, unknown> }): Ligne {
  if (args.select) {
    return Object.fromEntries(Object.entries(ligne).filter(([cle]) => Boolean(args.select![cle]))) as Ligne;
  }
  const include = args.include ?? {};
  return Object.fromEntries(Object.entries(ligne).filter(([cle]) => !RELATIONS.has(cle) || Boolean(include[cle]))) as Ligne;
}

function doublePrisma(posts: readonly Ligne[]) {
  const amities = [
    { senderId: AUTEUR, receiverId: AMI, status: 'accepted' },
    { senderId: EXCLU, receiverId: AUTEUR, status: 'accepted' },
  ];
  const lire = (args: any) => posts.filter((p) => correspond(p, args.where)).map((p) => projeter(p, args));
  return {
    friendRequest: {
      findMany: jest.fn(async ({ where }: any) => {
        const moi = where.OR[0].senderId as string;
        return amities.filter((a) => a.senderId === moi || a.receiverId === moi);
      }),
    },
    participant: { findMany: jest.fn(async () => []) },
    communityMember: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => ({ blockedUserIds: [] })) },
    hashtag: { findUnique: jest.fn(async () => ({ id: 'h1' })) },
    postHashtag: { findMany: jest.fn(async () => posts.map((p) => ({ postId: p.id }))) },
    post: {
      findMany: jest.fn(async (args: any) => lire(args)),
      findFirst: jest.fn(async (args: any) => lire(args)[0] ?? null),
      count: jest.fn(async () => 0),
    },
    postReaction: { findMany: jest.fn(async () => []) },
    postBookmark: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    postImpression: { groupBy: jest.fn(async () => []) },
    postView: { findMany: jest.fn(async () => []) },
    postMention: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
  };
}

/** Le lecteur est nommé par `x-test-user-id` ; sans lui, la requête est anonyme. */
async function monter(posts: readonly Ligne[] = scenario()): Promise<FastifyInstance> {
  const auth = async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).authContext = userId
      ? { type: 'user', isAuthenticated: true, userId, registeredUser: { id: userId, role: 'USER' } }
      : null;
  };
  const prisma = doublePrisma(posts);
  const app = Fastify({ logger: false });
  registerFeedRoutes(app, prisma as any, auth, auth);
  registerHashtagRoutes(app, prisma as any, auth);
  registerCoreRoutes(app, prisma as any, auth);
  await app.ready();
  return app;
}

async function lire(app: FastifyInstance, url: string, lecteur?: string) {
  const res = await app.inject({ method: 'GET', url, headers: lecteur ? { 'x-test-user-id': lecteur } : {} });
  expect(res.statusCode).toBe(200);
  const data = res.json().data as Record<string, unknown> | Array<Record<string, unknown>>;
  const items = Array.isArray(data) ? data : [data];
  return { corps: res.body, parId: new Map(items.map((p) => [p.id as string, p])) };
}

describe('#7407 — la liste d’audience ne part qu’à l’AUTEUR', () => {
  it('le fil d’un ami non exclu sert la publication EXCEPT et la publication ONLY, sans leur liste ni aucun identifiant qu’elle porte', async () => {
    const app = await monter();

    const { corps, parId } = await lire(app, '/social/posts?scope=home', AMI);

    expect(parId.has(EXCEPT_POST)).toBe(true);
    expect(parId.has(ONLY_POST)).toBe(true);
    for (const servie of parId.values()) expect(servie).not.toHaveProperty('visibilityUserIds');
    expect(corps).not.toContain(EXCLU);
    expect(corps).not.toContain(CONFIDENT);
    await app.close();
  });

  it('l’exclu ne voit pas la publication EXCEPT — le double honore l’audience, le témoin ci-dessus peut donc rougir pour la bonne raison', async () => {
    const app = await monter();

    const { parId } = await lire(app, '/social/posts?scope=home', EXCLU);

    expect(parId.has(EXCEPT_POST)).toBe(false);
    expect(parId.has(ONLY_POST)).toBe(false);
    await app.close();
  });

  it('l’AUTEUR, lui, reçoit ses listes dans son fil — son formulaire d’édition les relit', async () => {
    const app = await monter();

    const { parId } = await lire(app, '/social/posts?scope=home', AUTEUR);

    expect(parId.get(EXCEPT_POST)).toMatchObject({ visibilityUserIds: [EXCLU] });
    expect(parId.get(ONLY_POST)).toMatchObject({ visibilityUserIds: [AMI, CONFIDENT] });
    await app.close();
  });

  it('la liste d’un auteur lue par un ami, puis sans compte, ne porte aucune liste — même une liste périmée sur une publication PUBLIC', async () => {
    const app = await monter();

    const parAmi = await lire(app, `/social/posts?scope=author&authorId=${AUTEUR}`, AMI);
    const anonyme = await lire(app, `/posts/user/${AUTEUR}`);

    expect(parAmi.parId.has(EXCEPT_POST)).toBe(true);
    expect(anonyme.parId.has(PUBLIC_POST)).toBe(true);
    for (const lecture of [parAmi, anonyme]) {
      for (const servie of lecture.parId.values()) expect(servie).not.toHaveProperty('visibilityUserIds');
      expect(lecture.corps).not.toContain(EXCLU);
    }
    await app.close();
  });

  it('les humeurs et les stories d’un ami ne portent pas la liste ; celles de l’auteur, si', async () => {
    const app = await monter();

    const humeursAmi = await lire(app, '/social/posts?scope=statuses', AMI);
    const storiesAmi = await lire(app, '/social/posts?scope=stories', AMI);
    const humeursAuteur = await lire(app, '/social/posts?scope=statuses', AUTEUR);
    const storiesAuteur = await lire(app, '/social/posts?scope=stories', AUTEUR);

    expect(humeursAmi.parId.has(EXCEPT_STATUS)).toBe(true);
    expect(storiesAmi.parId.has(EXCEPT_STORY)).toBe(true);
    expect(humeursAmi.corps).not.toContain(EXCLU);
    expect(storiesAmi.corps).not.toContain(EXCLU);
    expect(humeursAuteur.parId.get(EXCEPT_STATUS)).toMatchObject({ visibilityUserIds: [EXCLU] });
    expect(storiesAuteur.parId.get(EXCEPT_STORY)).toMatchObject({ visibilityUserIds: [EXCLU] });
    await app.close();
  });

  it('la FICHE d’une publication EXCEPT ou ONLY lue par un tiers ne porte pas la liste ; lue par l’auteur, si', async () => {
    const app = await monter();

    const exceptParAmi = await lire(app, `/posts/${EXCEPT_POST}`, AMI);
    const onlyParAmi = await lire(app, `/posts/${ONLY_POST}`, AMI);
    const exceptParAuteur = await lire(app, `/posts/${EXCEPT_POST}`, AUTEUR);

    expect(exceptParAmi.parId.get(EXCEPT_POST)).not.toHaveProperty('visibilityUserIds');
    expect(onlyParAmi.parId.get(ONLY_POST)).not.toHaveProperty('visibilityUserIds');
    expect(exceptParAmi.corps).not.toContain(EXCLU);
    expect(onlyParAmi.corps).not.toContain(CONFIDENT);
    expect(exceptParAuteur.parId.get(EXCEPT_POST)).toMatchObject({ visibilityUserIds: [EXCLU] });
    await app.close();
  });

  it('une REPUBLICATION ne rend pas à son auteur la liste qu’elle hérite de la source — ni dans sa fiche, ni dans son fil', async () => {
    const app = await monter();

    const fiche = await lire(app, `/posts/${REPUBLICATION}`, AMI);
    const fil = await lire(app, '/social/posts?scope=home', AMI);

    expect(fiche.parId.get(REPUBLICATION)).not.toHaveProperty('visibilityUserIds');
    expect(fil.parId.has(REPUBLICATION)).toBe(true);
    expect(fiche.corps).not.toContain(EXCLU);
    expect(fil.corps).not.toContain(EXCLU);
    await app.close();
  });
});

describe('#7406 — le Json legacy des réactions ne part sur aucune lecture', () => {
  const lectures: ReadonlyArray<readonly [string, string]> = [
    ['le fil', '/social/posts?scope=home'],
    ['la page d’un hashtag', '/social/posts?scope=hashtag&tag=confidence'],
    ['la liste d’un auteur', `/social/posts?scope=author&authorId=${AUTEUR}`],
    ['les humeurs', '/social/posts?scope=statuses'],
    ['les stories', '/social/posts?scope=stories'],
    ['la fiche', `/posts/${PUBLIC_POST}`],
  ];

  it.each(lectures)('%s ne porte ni champ `reactions` ni l’identifiant d’un réacteur', async (_surface, url) => {
    const app = await monter();

    const { corps, parId } = await lire(app, url, AMI);

    expect(parId.size).toBeGreaterThan(0);
    for (const servie of parId.values()) expect(servie).not.toHaveProperty('reactions');
    expect(corps).not.toContain(REACTEUR);
    await app.close();
  });

  it('l’agrégat, lui, reste servi : `reactionSummary` et `reactionCount` disent combien, sans dire qui', async () => {
    const app = await monter();

    const { parId } = await lire(app, '/social/posts?scope=home', AMI);

    expect(parId.get(PUBLIC_POST)).toMatchObject({ reactionSummary: { '❤️': 1 }, reactionCount: 1 });
    await app.close();
  });
});
