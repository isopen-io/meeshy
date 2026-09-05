/**
 * `GET /sync` — `?fields=` PAR COLLECTION, et ce qu'il économise en amont (#4173).
 *
 * ## Pourquoi la grammaire est PORTÉE ici, et plate ailleurs
 *
 * `/sync` sert QUATRE collections dans une seule réponse. Un `?fields=` plat ne
 * dirait pas de laquelle il parle — et l'appliquer à toutes serait arbitrer une
 * demande que personne n'a formulée. D'où `collection.champ`
 * (`parseScopedFieldList`, `utils/sparse-fieldset.ts`), qui n'ajoute AUCUNE
 * profondeur : à droite du point, c'est la même liste à un niveau que sur
 * `/conversations/{id}`.
 *
 * ## Ce que ces témoins gardent
 *
 * Le critère 5 (a) de #4173 : « un test qui n'asserte que la forme de la sortie
 * reste vert si le serveur charge tout puis filtre à la sérialisation ». Les
 * témoins décisifs lisent donc le `select` passé au double Prisma.
 *
 * Le critère 6 : le motif était déjà là — « `collections` fait entrer le JEU de
 * collections demandé dans le hash ». La PROJECTION est le second axe du même
 * risque, et il a un cas que `collections` n'avait pas : deux projections
 * différentes sur une page VIDE rendent le même `collectionsResult`, donc le
 * même hash. C'est pourquoi la projection entre EXPLICITEMENT dans la clé,
 * plutôt que d'être déduite du contenu servi.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_MINE = '507f1f77bcf86cd799439a01';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as any).authContext = { userId: USER_ID, type: 'user' };
    },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';
import { SYNC_MESSAGE_RENDERABLE_KEYS } from '../../../routes/sync';

function defaultParticipantFindMany() {
  return jest.fn<any>().mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve([]);
    return Promise.resolve([{ id: 'p-mine', conversationId: CONV_MINE }]);
  });
}

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    participant: { findMany: defaultParticipantFindMany() },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

/** Le `select` du flux `changed` — la PREMIÈRE requête de la collection. */
const changedSelect = (fn: any): Record<string, unknown> =>
  fn.mock.calls[0][0].select as Record<string, unknown>;

describe('#4173 c.5(a) — `fields` réduit la REQUÊTE de chaque collection', () => {
  it('`messages` sans projection garde le contrat RENDABLE de #4171', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const select = changedSelect(prisma.message.findMany);
    for (const cle of SYNC_MESSAGE_RENDERABLE_KEYS) expect(select[cle]).toBeDefined();
    await app.close();
  });

  it('`fields=messages.id,messages.content` RÉTRÉCIT le `select` des messages', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id,messages.content`,
    });

    const select = changedSelect(prisma.message.findMany);
    expect(select.content).toBeDefined();
    // Les colonnes ÉPINGLÉES restent : le keyset `(updatedAt, id)` et le
    // partage added/modified les exigent, une page les perdrait sa position.
    expect(Object.keys(select).sort()).toEqual(['content', 'conversationId', 'createdAt', 'id', 'updatedAt']);
    await app.close();
  });

  it('`fields=conversations.id,conversations.title` RÉTRÉCIT le `select` des conversations', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations&fields=conversations.id,conversations.title`,
    });

    const select = changedSelect(prisma.conversation.findMany);
    expect(Object.keys(select).sort()).toEqual(['createdAt', 'id', 'title', 'updatedAt']);
    await app.close();
  });

  it('une projection ne touche QUE la collection qu’elle nomme', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages,conversations&fields=messages.id`,
    });

    // `conversations` n'est pas nommée : elle garde son profil par défaut ENTIER.
    expect(Object.keys(changedSelect(prisma.conversation.findMany)).length).toBeGreaterThan(10);
    expect(Object.keys(changedSelect(prisma.message.findMany)).sort())
      .toEqual(['conversationId', 'createdAt', 'id', 'updatedAt']);
    await app.close();
  });
});

describe('#4173 c.5(c) — une relation non citée n’est PAS chargée', () => {
  it('`fields=messages.id` n’ouvre NI `attachments` NI `sender`', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id`,
    });

    const select = changedSelect(prisma.message.findMany);
    expect(select.attachments).toBeUndefined();
    expect(select.sender).toBeUndefined();
    await app.close();
  });

  it('`fields=messages.id,messages.attachments` la rouvre — et elle reste BORNÉE par son propre select', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id,messages.attachments`,
    });

    const select = changedSelect(prisma.message.findMany);
    expect(select.attachments).toBeDefined();
    expect((select.attachments as { select: unknown }).select).toBeDefined();
    expect(select.sender).toBeUndefined();
    await app.close();
  });

  it('`fields=participants.id` n’ouvre PAS la jointure `user`', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=participants&fields=participants.id`,
    });

    // Le roster est la SECONDE requête `participant.findMany` d'appartenance :
    // [0] appartenance RLS, [1] départs, [2] roster.
    const roster = prisma.participant.findMany.mock.calls.at(-1)![0].select as Record<string, unknown>;
    expect(roster.user).toBeUndefined();
    await app.close();
  });
});

describe('#4173 c.5(b) — 400 explicite, et les TROIS façons de rater une demande', () => {
  it('champ inconnu dans une collection connue', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.contnet`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNKNOWN_FIELD');
    expect(res.json().error.message).toContain('messages.contnet');
    await app.close();
  });

  it('collection inconnue en portée', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=posts.id`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_COLLECTION');
    expect(res.json().error.message).toContain('posts');
    await app.close();
  });

  it('jeton SANS portée — il ne dit pas à quelle collection il s’applique', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=id`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSCOPED_FIELD');
    await app.close();
  });

  it('une projection qui nomme une collection ABSENTE de `collections=` est refusée, jamais arbitrée', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=conversations.id`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('FIELD_OUTSIDE_COLLECTIONS');
    await app.close();
  });

  it('refuse AVANT toute lecture — un refus de projection ne coûte pas une requête', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.contnet`,
    });
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('#4173 c.2 — la liste blanche est FERMÉE, même sur une ligne servie', () => {
  const MSG = {
    id: 'm1', conversationId: CONV_MINE, senderId: 's1', content: 'Bonjour',
    clientMessageId: null, originalLanguage: 'fr', translations: null,
    messageType: 'text', messageSource: 'user', metadata: null, isEdited: false,
    editedAt: null, replyToId: null, reactionSummary: null, reactionCount: 0,
    validatedMentions: [], attachments: [], sender: null,
    createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z'),
  };

  it('la ligne SERVIE ne porte que les champs demandés (plus les épinglés)', async () => {
    const prisma = makePrisma({
      message: {
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([{ id: MSG.id, conversationId: MSG.conversationId, content: MSG.content, createdAt: MSG.createdAt, updatedAt: MSG.updatedAt }])
          .mockResolvedValueOnce([]),
      },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.content`,
    });

    const added = res.json().data.collections.messages.added[0];
    expect(added.content).toBe('Bonjour');
    expect(added).not.toHaveProperty('messageType');
    expect(added).not.toHaveProperty('reactionCount');
    // `id` et `conversationId` survivent : sans eux, le client ne sait ni quelle
    // bulle il écrit ni dans quel fil.
    expect(added.id).toBe('m1');
    expect(added.conversationId).toBe(CONV_MINE);
    await app.close();
  });

  it('sans projection, la ligne servie reste RENDABLE — le défaut n’a pas bougé', async () => {
    const prisma = makePrisma({
      message: { findMany: jest.fn<any>().mockResolvedValueOnce([MSG]).mockResolvedValueOnce([]) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });

    const added = res.json().data.collections.messages.added[0];
    expect(added.messageType).toBe('text');
    expect(added.originalLanguage).toBe('fr');
    expect(added.translations).toEqual([]);
    expect(added.attachments).toEqual([]);
    await app.close();
  });
});

describe('#4173 c.6 — l’ETag distingue DEUX projections', () => {
  it('un `If-None-Match` pris sous une projection ÉTROITE ne rend PAS 304 sous une projection LARGE', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const etroit = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id`,
    });
    expect(etroit.statusCode).toBe(200);

    const large = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id,messages.content`,
      headers: { 'if-none-match': etroit.headers.etag as string },
    });

    expect(large.statusCode).toBe(200);
    await app.close();
  });

  it('deux projections différentes ne partagent pas d’ETag MÊME sur une page VIDE des deux côtés', async () => {
    // Le cas que `collections` ne couvrait pas : sur une page vide, le contenu
    // servi est identique mot pour mot ; seule la projection DÉCLARÉE dans la
    // clé les sépare.
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const a = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&fields=messages.id` });
    const b = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&fields=messages.content` });

    expect(a.json().data.collections.messages).toEqual(b.json().data.collections.messages);
    expect(a.headers.etag).not.toBe(b.headers.etag);
    await app.close();
  });

  it('la MÊME projection rend bien 304 — le validateur reste utile', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const premier = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id`,
    });
    const second = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id`,
      headers: { 'if-none-match': premier.headers.etag as string },
    });

    expect(second.statusCode).toBe(304);
    await app.close();
  });

  it('l’ordre des jetons ne change pas l’ETag — la projection est un ENSEMBLE, pas une liste', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const a = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.id,messages.content`,
    });
    const b = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages&fields=messages.content,messages.id`,
    });

    expect(a.headers.etag).toBe(b.headers.etag);
    await app.close();
  });
});
