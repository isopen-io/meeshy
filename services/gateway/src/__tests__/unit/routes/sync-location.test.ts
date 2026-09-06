/**
 * `GET /sync` — un lieu partagé voyage HISSÉ, et la protection voyage avec la
 * ligne (travail `rich`, spec 2026-09-06).
 *
 * `hoistLocationOnto` (`services/location/sharedPlace.ts:83-95`) se documente
 * comme « source UNIQUE réutilisée par TOUS les payloads REST/socket » —
 * `messages-list.ts`, `core-list.ts`, `messages-pin.ts`, `search.ts`,
 * `threads.ts` l'appliquent tous. `/sync` (`routes/sync/messages.ts`) est la
 * seule surface qui l'a oublié (grep vide sur `routes/sync*` avant ce lot) :
 * un lieu reçu pendant une coupure réseau n'arrivait, une fois rattrapé, que
 * par le repli client `metadata.location` — partiel, et jamais gardé par
 * aucune protection, puisque `/sync` ne servait AUCUN des six champs de
 * `MESSAGE_PROTECTION_SELECT` (`routes/conversations/messages-list-query.ts`)
 * non plus : ni les trois drapeaux, ni les deux compteurs de la vue unique,
 * ni le bitfield `effectFlags`. Ce bloc a une SOURCE UNIQUE depuis #4885 —
 * « toute route qui sert `Message.content` doit ce bloc, ou dire pourquoi
 * non » — et ce fichier garde qu'elle est PRISE, jamais recopiée.
 *
 * Fichier SÉPARÉ de `sync.test.ts` (1616 lignes, hors budget — plafond dur
 * 1200, interdit d'ajout) — même harnais que `sync-collections.test.ts`
 * (mock du middleware d'auth, mock du rate-limiter, magasin qui HONORE le
 * `where`). Tous les témoins traversent `app.inject(...)` — c'est la
 * sérialisation par SCHÉMA (fast-json-stringify) qui est sous test : un
 * champ hissé mais absent du schéma serait strippé en silence, exactement le
 * piège que `syncMessageSchema` documente déjà pour `metadata`.
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
      (req as unknown as { authContext: { userId: string; type: 'user' } }).authContext = {
        userId: USER_ID,
        type: 'user',
      };
    },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';
import { SYNC_MESSAGE_RENDERABLE_KEYS, syncMessageSelect } from '../../../routes/sync/messages';
import { MESSAGE_PROTECTION_SELECT } from '../../../routes/conversations/messages-list-query';

function defaultParticipantFindMany() {
  return jest.fn<any>().mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve([]); // aucun départ
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

/** Une ligne `changed` minimale — les relations sélectionnées reviennent en
 *  tableau vide, jamais `undefined` (voir `CHANGED_ROW_RELATIONS` de
 *  `sync.test.ts`, même raison ici). */
const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: CONV_MINE,
  senderId: 's1',
  content: 'Salut',
  clientMessageId: null,
  originalLanguage: 'fr',
  translations: null,
  messageType: 'text',
  messageSource: 'user',
  metadata: null,
  isEdited: false,
  editedAt: null,
  replyToId: null,
  reactionSummary: null,
  reactionCount: 0,
  validatedMentions: [],
  attachments: [],
  sender: null,
  createdAt: new Date('2026-07-02T10:00:00Z'),
  updatedAt: new Date('2026-07-02T10:00:00Z'),
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  ...extra,
});

async function injectMessages(prisma: any, qs = '') {
  const app = await buildApp(prisma);
  const res = await app.inject({
    method: 'GET',
    url: `/sync?since=${SINCE}&collections=messages${qs}`,
  });
  await app.close();
  return res;
}

describe('GET /sync — un lieu partagé voyage hissé, et la protection voyage avec la ligne', () => {
  it('hisse metadata.location en location de premier niveau — la forme que messages-list sert déjà', async () => {
    const place = {
      latitude: 48.8566,
      longitude: 2.3522,
      name: 'Café de Flore',
      address: '172 bd Saint-Germain',
      category: null,
    };
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([base('m1', { metadata: { location: place } })])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma);
    expect(res.statusCode).toBe(200);
    const added = res.json().data.collections.messages.added[0];

    expect(added.location).toEqual(place);
    // Le hoist AJOUTE, ne déplace pas — même contrat que `hoistLocationOnto`.
    expect(added.metadata).toEqual({ location: place });
  });

  it('ne fabrique aucun `location` sur un message qui n’en porte pas', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([base('m1', { metadata: null })])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma);
    const added = res.json().data.collections.messages.added[0];
    expect('location' in added).toBe(false);
  });

  it('un `metadata.location` malformé ne sert rien — parseSharedPlace est la loi', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([base('m1', { metadata: { location: { latitude: 'nord' } } })])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma);
    const added = res.json().data.collections.messages.added[0];
    expect('location' in added).toBe(false);
  });

  it('sert le bloc de protection ENTIER — la protection annoncée voyage avec ce qu’elle protège', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([
        base('m1', {
          isViewOnce: true,
          maxViewOnceCount: 3,
          viewOnceCount: 1,
          isBlurred: true,
          effectFlags: 5,
          expiresAt: new Date('2026-07-03T00:00:00Z'),
        }),
      ])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma);
    const added = res.json().data.collections.messages.added[0];
    expect(added.isViewOnce).toBe(true);
    expect(added.maxViewOnceCount).toBe(3);
    expect(added.viewOnceCount).toBe(1);
    expect(added.isBlurred).toBe(true);
    // `effectFlags` — le BITFIELD. Un client qui le lit plutôt que les trois
    // colonnes rendait une ligne protégée comme une ligne ordinaire tant qu'il
    // n'était pas DÉCLARÉ au schéma (`api-schemas/message.ts:358-364`).
    expect(added.effectFlags).toBe(5);
    expect(added.expiresAt).toBe('2026-07-03T00:00:00.000Z');
  });

  /**
   * LE BLOC EST UN TOUT, ET IL A UNE SOURCE UNIQUE.
   *
   * #4885 a posé `MESSAGE_PROTECTION_SELECT` après avoir mesuré qu'une
   * recopie à la main laissait la recherche servir un message à vue unique
   * comme un message ordinaire. En recopier TROIS champs sur six rejouerait
   * exactement ce défaut, un cran plus loin : ce témoin rougit sur toute
   * recopie partielle, du `select` comme du contrat rendable.
   */
  it('prend le bloc de protection à sa SOURCE UNIQUE — jamais trois champs recopiés sur six', () => {
    const attendus = Object.keys(MESSAGE_PROTECTION_SELECT);
    expect(attendus).toHaveLength(6);

    const select = syncMessageSelect as unknown as Record<string, unknown>;
    attendus.forEach((cle) => expect(select[cle]).toBe(true));
    attendus.forEach((cle) => expect(SYNC_MESSAGE_RENDERABLE_KEYS).toContain(cle));
  });

  it('une projection `?fields=` qui garde `metadata` garde le lieu ; une qui l’omet ne sert ni l’un ni l’autre', async () => {
    const place = { latitude: 1, longitude: 2, name: null, address: null, category: null };

    const withMetadata = makePrisma();
    withMetadata.message.findMany
      .mockResolvedValueOnce([base('m1', { metadata: { location: place } })])
      .mockResolvedValueOnce([]);
    const resWith = await injectMessages(withMetadata, '&fields=messages.metadata,messages.content');
    const addedWith = resWith.json().data.collections.messages.added[0];
    expect(addedWith.location).toEqual(place);
    expect(addedWith.metadata).toEqual({ location: place });

    const withoutMetadata = makePrisma();
    withoutMetadata.message.findMany
      .mockResolvedValueOnce([base('m1', { metadata: { location: place } })])
      .mockResolvedValueOnce([]);
    const resWithout = await injectMessages(withoutMetadata, '&fields=messages.content');
    const addedWithout = resWithout.json().data.collections.messages.added[0];
    expect('location' in addedWithout).toBe(false);
    expect('metadata' in addedWithout).toBe(false);
  });

  /**
   * Défaut de revue §3 (2026-09-06) : `?fields=messages.content` servait
   * `content` SANS le bloc de protection, redevenant atteignable par une
   * chaîne de requête que le témoin ci-dessus ne couvrait pas — celui-là ne
   * teste que le LIEU, pas les six drapeaux. #4885 porte sur ce que la route
   * SERT, pas sur ce qu'un `?fields=` nomme : un appelant qui demande
   * `content` sans savoir que la protection existe ne peut pas la nommer à sa
   * place. `syncMessagePlan.columns.content` (routes/sync/messages.ts) et
   * `servedPinnedFor` accordent le `select` ET la restriction de réponse sur
   * la MÊME condition.
   */
  it('`?fields=…content` sert le bloc de protection même sans le nommer — #4885 porte sur ce qui est SERVI', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([
        base('m1', {
          isViewOnce: true,
          maxViewOnceCount: 1,
          viewOnceCount: 0,
          isBlurred: false,
          effectFlags: 2,
          expiresAt: new Date('2026-07-04T00:00:00Z'),
        }),
      ])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma, '&fields=messages.content');
    const added = res.json().data.collections.messages.added[0];
    expect(added.content).toBe('Salut');
    expect(added.isViewOnce).toBe(true);
    expect(added.maxViewOnceCount).toBe(1);
    expect(added.effectFlags).toBe(2);
    expect(added.expiresAt).toBe('2026-07-04T00:00:00.000Z');
  });

  it('une projection qui NE demande PAS `content` ne charge ni ne sert la protection', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([base('m1', { isViewOnce: true, effectFlags: 7 })])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma, '&fields=messages.id');
    const added = res.json().data.collections.messages.added[0];
    expect('isViewOnce' in added).toBe(false);
    expect('effectFlags' in added).toBe(false);
  });
});
