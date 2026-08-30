/**
 * `routes/friends.ts` ne diverge plus SILENCIEUSEMENT de
 * `routes/directory/friend-requests.ts` (#4283).
 *
 * Fichier SÉPARÉ de `friends-routes.test.ts` (déjà à 1141 lignes, hors budget
 * — § CLAUDE.md « Budget de taille : 800–1100 lignes »). La règle interdit
 * d'AJOUTER à un fichier déjà hors budget ; ces témoins vivent donc ici,
 * avec leur propre harnais minimal plutôt que de faire grossir l'existant.
 *
 * ## Ce que ce fichier prouve, et pourquoi c'était nécessaire
 *
 * #4162 avait unifié les GARDES D'AUTORISATION (qui peut envoyer/accepter/
 * annuler) des deux surfaces en les faisant passer par le même cœur
 * (`friend-requests-core.ts`). Trois choses restaient silencieusement
 * DIVERGENTES malgré ce cœur commun :
 *
 *   1. La FORME DE RÉPONSE — l'alias déclarait `data: friendRequestSchema`
 *      (le schéma NU) sur ses trois routes qui rendent une ligne, quand
 *      `directory` sert `demandeAvecConversationSchema` /
 *      `demandeAvecPresenceSchema`. Deux champs CALCULÉS par le cœur commun
 *      étaient donc supprimés à la sérialisation sur l'alias SEUL :
 *      `conversation` sur l'acceptation (Android l'appelle encore via
 *      `FriendApi.respond`), et `lastActiveAt` sur les deux GET — dont un
 *      était en plus jamais CHARGÉ, la requête locale ayant son propre
 *      `select` sans `isOnline`/`lastActiveAt` (iOS l'appelle encore via
 *      `FriendService.receivedRequests`/`.sentRequests`, et
 *      `FriendListAggregator` trie sa liste de contacts sur ce champ).
 *   2. LE CONTRÔLE D'ACCÈS PAR DÉBIT — l'alias n'appliquait NI le limiteur
 *      par minute NI le budget quotidien anti-spam que `directory` applique.
 *      Un appelant plafonné sur une adresse pouvait continuer sur l'autre.
 *   3. LE SURSIS — aucune des cinq routes n'annonçait qu'elle est en
 *      remplacement (#4274), alors que huit issues du dépôt en dépendent
 *      pour savoir QUAND migrer.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';

// ─── Mocks — identiques à ceux de friends-routes.test.ts ─────────────────────

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../middleware/auth', () => ({ UnifiedAuthRequest: {} }));

const mockWithMutationLog = jest.fn(({ op }: { op: () => Promise<unknown> }) => op());
jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: (args: Record<string, unknown>) => mockWithMutationLog(args),
}));

// Schéma RÉEL de `@meeshy/shared/types/api-schemas` — délibérément NON mocké
// ici, à la différence de `friends-routes.test.ts` : la forme exacte du
// schéma (quelles clés `demandeAvecPresenceSchema` / `demandeAvecConversationSchema`
// déclarent réellement) est ce que ce fichier vérifie. Un double simplifié la
// rendrait invisible — c'est le même choix que `directory/friend-requests.test.ts`.

// ─── Constantes ────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const RECEIVER_ID = '507f1f77bcf86cd799439012';
const FR_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

const DB_USER = {
  id: RECEIVER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice S.',
  avatar: null,
  isOnline: false,
  lastActiveAt: new Date('2024-01-10'),
};

const DB_FRIEND_REQUEST = {
  id: FR_ID,
  senderId: USER_ID,
  receiverId: RECEIVER_ID,
  status: 'pending',
  message: null,
  createdAt: new Date('2024-01-01'),
  sender: DB_USER,
  receiver: DB_USER,
};

const DB_CONVERSATION = {
  id: 'convid000000000000000001',
  identifier: `direct_${USER_ID}_${RECEIVER_ID}`,
  type: 'direct',
};

// ─── Prisma minimal ────────────────────────────────────────────────────────

function makePrisma() {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(DB_USER) },
    friendRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      // Même distinction qu'ailleurs dans le dépôt (#4162) : `select` → lecture
      // d'autorisation (`acteurAutorise` décide) ; `include` → relecture après
      // écriture (`onDuplicate`, mise à jour).
      findUnique: jest.fn(async (args: { select?: unknown }) =>
        args?.select
          ? { id: FR_ID, senderId: USER_ID, receiverId: RECEIVER_ID, status: 'pending' }
          : DB_FRIEND_REQUEST
      ),
      create: jest.fn().mockResolvedValue(DB_FRIEND_REQUEST),
      findMany: jest.fn().mockResolvedValue([DB_FRIEND_REQUEST]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue({ ...DB_FRIEND_REQUEST, status: 'accepted' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    notification: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    conversation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(DB_CONVERSATION),
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', makePrisma() as unknown);
  app.decorate('notificationService', null);
  app.decorate('socialEvents', null);
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers['authorization'];
    if (!token) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).user = {
      userId: RECEIVER_ID, // = destinataire de DB_FRIEND_REQUEST : peut accepter
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER',
    };
  });

  const { friendRequestRoutes } = await import('../../../routes/friends');
  await app.register(friendRequestRoutes, { prefix: '' });
  await app.ready();
  return app;
}

beforeEach(() => {
  mockWithMutationLog.mockImplementation(({ op }: { op: () => Promise<unknown> }) => op());
});

// ═════════════════════════════════════════════════════════════════════════
// 1. La forme de réponse ne diverge plus
// ═════════════════════════════════════════════════════════════════════════

describe('#4283 — la forme de réponse ne diverge plus de /directory/friend-requests', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  // Les deux témoins de GET lisent `findMany.mock.calls[0]` : sans ce
  // nettoyage, le second lirait encore l'appel du premier sur l'`app`
  // PARTAGÉE de ce bloc.
  beforeEach(() => jest.clearAllMocks());

  // Avant #4283, cette route déclarait `data: friendRequestSchema` — le
  // schéma NU, qui ne connaît pas `conversation`. Le handler la greffait déjà
  // sur l'objet rendu (`repondreDemande`), et fast-json-stringify la
  // supprimait à la sérialisation : c'est l'Android qui appelle ENCORE cette
  // adresse pour accepter (`FriendApi.respond`) qui en payait le prix — il
  // n'apprenait jamais où parler à son nouvel ami sans une seconde requête.
  it('PATCH accept sert `conversation` — le schéma NU de l\'alias la supprimait avant #4283', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/friend-requests/${FR_ID}`,
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as { conversation?: { id: string } };
    expect(data.conversation).toBeDefined();
    expect(data.conversation?.id).toBe(DB_CONVERSATION.id);
  });

  // Avant #4283, ces deux GET portaient leur PROPRE `select` — cinq colonnes,
  // sans `isOnline` ni `lastActiveAt` — au lieu de la projection PARTAGÉE
  // (`INCLUDE_PARTIES`) que `/directory/friend-requests` utilise via le même
  // cœur. Un correctif de présence appliqué côté `directory` (charger + gater
  // `lastActiveAt`) laissait donc ces deux routes INTACTES — pas seulement le
  // schéma, la REQUÊTE elle-même. C'est l'app iOS qui appelle ENCORE ces deux
  // adresses (`FriendService.receivedRequests`/`.sentRequests`) et trie sa
  // liste de contacts sur ce champ (`FriendListAggregator`).
  //
  // Assertion sur la REQUÊTE, pas sur le rendu (§ CLAUDE.md « Un témoin de
  // projection assert sur la REQUÊTE ») : le schéma DÉCLARE `lastActiveAt` en
  // `nullable`, et fast-json-stringify sert `null` pour un nullable dont la
  // valeur SOURCE est `undefined` — un témoin qui ne lirait que le corps HTTP
  // ne pourrait PAS distinguer « colonne chargée puis masquée par la loi » de
  // « colonne jamais demandée » : les deux rendent `null`. Seul le `select`
  // envoyé à Prisma le prouve.
  it('GET /received DEMANDE `isOnline`/`lastActiveAt` sur `sender` — la MÊME projection que /directory (INCLUDE_PARTIES)', async () => {
    const res = await app.inject({ method: 'GET', url: '/friend-requests/received', headers: AUTH });
    expect(res.statusCode).toBe(200);

    const appele = (app.prisma.friendRequest.findMany as jest.Mock).mock.calls[0][0] as {
      include: { sender: { select: Record<string, unknown> } };
    };
    expect(appele.include.sender.select).toMatchObject({ isOnline: true, lastActiveAt: true });

    // Complément : la clé SURVIT à la sérialisation (avant #4283, absente).
    const sender = res.json().data[0].sender as Record<string, unknown>;
    expect(sender).toHaveProperty('lastActiveAt');
  });

  it('GET /sent DEMANDE `isOnline`/`lastActiveAt` sur `receiver` — même correctif, même raison', async () => {
    const res = await app.inject({ method: 'GET', url: '/friend-requests/sent', headers: AUTH });
    expect(res.statusCode).toBe(200);

    const appele = (app.prisma.friendRequest.findMany as jest.Mock).mock.calls[0][0] as {
      include: { receiver: { select: Record<string, unknown> } };
    };
    expect(appele.include.receiver.select).toMatchObject({ isOnline: true, lastActiveAt: true });

    const receiver = res.json().data[0].receiver as Record<string, unknown>;
    expect(receiver).toHaveProperty('lastActiveAt');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Le contrôle d'accès par débit ne diverge plus
// ═════════════════════════════════════════════════════════════════════════

describe('#4283 — les cinq routes partagent les gardes d\'abus de /directory/friend-requests', () => {
  // Preuve STRUCTURELLE, dans le même esprit que
  // `friend-request-single-path-guard.test.ts` (#4162) : l'alias ne
  // réimplémente PAS son propre limiteur — il appelle la MÊME usine que la
  // route canonique, ce qui unifie le compteur Redis par acteur quelle que
  // soit l'adresse empruntée (cf. doc-comment de `creerGardesFriendRequests`).
  it('appelle `creerGardesFriendRequests` — pas de `createCustomRateLimiter` réimplanté ici', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../routes/friends.ts'), 'utf8');

    expect(source).toContain('creerGardesFriendRequests(fastify)');
    expect(source).not.toMatch(/createCustomRateLimiter\s*\(/);
  });

  // Preuve d'EXÉCUTION : avant #4283, `POST /friend-requests` n'avait AUCUN
  // `preHandler` — un appelant pouvait envoyer sans borne. Vingt-et-un envois
  // consécutifs sur le MÊME acteur doivent désormais heurter le plafond de
  // vingt/minute que `/directory/friend-requests` applique déjà.
  it('POST envoi répond 429 au-delà de vingt requêtes/minute — la garde tourne réellement, pas seulement déclarée', async () => {
    const appLimite = await buildApp();

    const reponses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await appLimite.inject({
        method: 'POST',
        url: '/friend-requests',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ receiverId: USER_ID }),
      });
      reponses.push(res.statusCode);
    }

    expect(reponses.slice(0, 20).every((code) => code === 201)).toBe(true);
    expect(reponses[20]).toBe(429);
    await appLimite.close();
  }, 20_000);
});

// ═════════════════════════════════════════════════════════════════════════
// 3. Le sursis (#4274) s'annonce sur les cinq adresses
// ═════════════════════════════════════════════════════════════════════════

describe('#4283 — les cinq alias annoncent leur sursis (RFC 9745 Deprecation + RFC 5829 Link)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  // Posé en `onRequest`, AVANT `fastify.authenticate` dans le tableau : la
  // dépréciation s'annonce même quand l'appelant échoue l'authentification —
  // c'est justement l'appelant qui a le plus besoin d'apprendre qu'il migre
  // vers une adresse morte. Prouvé ici sur un 401, pas sur un chemin nominal.
  it('POST envoi porte `Deprecation` + `Link` vers /directory/friend-requests, MÊME sur un 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/friend-requests',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receiverId: RECEIVER_ID }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toContain('</api/v1/directory/friend-requests>');
    expect(res.headers['link']).toContain('rel="successor-version"');
    // Gouverné par le compteur d'adoption de #4275, jamais par une date en
    // dur ici (§ CLAUDE.md « la règle de retrait est gouvernée... »).
    expect(res.headers['sunset']).toBeUndefined();
  });

  // Le successeur d'une route PAR ID porte l'id RÉSOLU — `request.params` est
  // peuplé par le routeur AVANT la chaîne `onRequest` (cf. doc-comment de
  // `depreciee`). Vérifié ici sur DELETE, dont le corps historique ne porte
  // aucun successeur explicite dans son propre code.
  it('DELETE par id porte un `Link` vers PATCH /directory/friend-requests/:id, gabarit RÉSOLU', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/friend-requests/${FR_ID}` });

    expect(res.statusCode).toBe(401);
    expect(res.headers['link']).toContain(`</api/v1/directory/friend-requests/${FR_ID}>`);
  });

  it('GET /received et /sent annoncent chacun leur `direction` dans le successeur', async () => {
    const recu = await app.inject({ method: 'GET', url: '/friend-requests/received' });
    const envoye = await app.inject({ method: 'GET', url: '/friend-requests/sent' });

    expect(recu.headers['link']).toContain('direction=received');
    expect(envoye.headers['link']).toContain('direction=sent');
  });
});
