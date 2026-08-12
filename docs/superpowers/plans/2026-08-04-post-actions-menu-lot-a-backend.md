# Menu d'actions des postes — Lot A (backend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter le gateway des deux capacités manquantes au menu « … » des postes — tracer les téléchargements de médias avec des lectures analytiques en O(1), et autoriser un modérateur à supprimer le poste d'autrui avec audit.

**Architecture :** Une table d'événements `PostMediaDownload` indexée pour l'analyse fine, doublée de deux compteurs dénormalisés (`Post.downloadCount`, `PostMedia.downloadCount`) qui répondent en O(1) sans jamais agréger. La logique d'enregistrement vit dans `PostService` (la seule place d'où le filtre de visibilité privé est accessible) ; la route reste mince. `deletePost` reçoit le rôle de l'acteur et écrit une ligne `AdminAuditLog` quand ce n'est pas l'auteur.

**Tech Stack :** Fastify 5, Prisma 6 + MongoDB, Zod, Jest sous **bun**, mongosh pour les index de production.

**Spec de référence :** `docs/superpowers/specs/2026-08-04-post-actions-menu-lot-a-backend-design.md`

## Global Constraints

- **Le gestionnaire de paquets est `bun`**, pas node/npm — c'est ce que fait la CI. Un run node rapporte une couverture plus haute et non représentative.
- **Avant tout run de tests** : `cd packages/shared && npx prisma generate --generator client` puis `bun run build`, sinon une vingtaine de suites gateway échouent pour une raison sans rapport avec ce lot.
- **TDD non négociable** : aucun code de production sans un test rouge écrit d'abord. RED → GREEN → REFACTOR.
- **Pas de `any`**, mode strict. `unknown` + validation si le type est réellement inconnu.
- **Pas de paire booléen + timestamp redondante.** Les compteurs entiers dénormalisés, eux, sont la convention maison (`Post` en porte déjà huit).
- **Format de réponse** : toujours `sendSuccess` / `sendError` de `utils/response.ts`. Erreurs sous `error: { code, message }`.
- **Aucun `$transaction`** : le gateway n'en utilise nulle part, ce lot n'en introduit pas.
- **Messages de commit sans trailer `Co-Authored-By`.**
- Les commandes `git` s'exécutent depuis la racine du dépôt : `/Users/smpceo/Documents/v2_meeshy`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `packages/shared/prisma/schema.prisma` (modifier) | Modèle `PostMediaDownload`, deux champs `downloadCount`, deux relations inverses |
| `packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js` (créer) | Pose les quatre index en production, idempotent |
| `services/gateway/src/services/PostService.ts` (modifier) | `recordMediaDownloads` (nouveau) · `deletePost` (signature + rôle + audit) |
| `services/gateway/src/routes/posts/types.ts` (modifier) | `RecordDownloadsSchema` (Zod) |
| `services/gateway/src/routes/posts/interactions.ts` (modifier) | Route `POST /posts/:postId/downloads` |
| `services/gateway/src/routes/posts/core.ts` (modifier) | `DELETE /posts/:postId` transmet le rôle |
| `services/gateway/src/__tests__/posts-media-download-service.test.ts` (créer) | Tests du service : ACL, dédup, filtrage, compteurs |
| `services/gateway/src/__tests__/posts-media-download-route.test.ts` (créer) | Tests de la route : codes HTTP, validation |
| `services/gateway/src/__tests__/posts-delete-moderator.test.ts` (créer) | Tests du droit modérateur + audit |

---

## Task 1 : Schéma Prisma — table d'événements et compteurs

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: le modèle `PostMediaDownload` avec les champs `id, postId, mediaId, userId, surface, createdAt` ; les champs `Post.downloadCount: Int` et `PostMedia.downloadCount: Int` (défaut `0`). Le client Prisma généré expose `prisma.postMediaDownload.createMany` et `prisma.postMediaDownload.count`.

- [ ] **Step 1: Ajouter le modèle `PostMediaDownload`**

Placer ce bloc dans `packages/shared/prisma/schema.prisma`, juste après le modèle `PostBookmark` (repéré autour de la ligne 3333) pour regrouper les modèles d'interaction de poste :

```prisma
/// Téléchargement d'un média de poste par un utilisateur.
///
/// Historique COMPLET : un même utilisateur re-téléchargeant le même média
/// produit une nouvelle ligne (jamais d'upsert). Le dédupliqué reste calculable
/// par distinct(userId). Les totaux, eux, se lisent en O(1) sur
/// `Post.downloadCount` / `PostMedia.downloadCount` — cette table n'est JAMAIS
/// agrégée pour répondre à un « combien ».
model PostMediaDownload {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  postId    String   @db.ObjectId
  /// Pas de relation Prisma vers PostMedia, délibérément : une cascade
  /// effacerait la trace analytique en même temps que le média détaché ou
  /// supprimé, alors qu'on veut précisément la conserver. Même raisonnement
  /// que `PostMedia.uploaderId`, qui se passe de relation pour la même raison.
  mediaId   String   @db.ObjectId
  userId    String   @db.ObjectId
  /// Surface d'origine de l'action : feed | detail | reel
  surface   String   @default("detail")
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation("UserPostMediaDownloads", fields: [userId], references: [id])

  /// Téléchargeurs uniques d'un poste · « cet utilisateur a-t-il téléchargé ? »
  @@index([postId, userId])
  /// Grain média sur une fenêtre temporelle.
  @@index([mediaId, createdAt])
  /// Historique de téléchargement d'un utilisateur.
  @@index([userId, createdAt])
  /// Balayage par période, rollups futurs, TTL éventuel.
  @@index([createdAt])
}
```

- [ ] **Step 2: Ajouter le compteur et la relation inverse sur `Post`**

Dans `model Post`, à la suite des compteurs existants (`playCount Int @default(0)`) :

```prisma
  /// Nombre d'actions « Enregistrer » sur ce poste : +1 par action, quel que
  /// soit le nombre de médias téléchargés. NE VAUT PAS la somme des
  /// `PostMedia.downloadCount` de ce poste — l'un compte des actions, l'autre
  /// des médias. Ne pas « réconcilier » les deux, l'écart porte l'information.
  downloadCount Int @default(0)
```

Et à la suite des relations existantes (`bookmarks PostBookmark[]`) :

```prisma
  mediaDownloads PostMediaDownload[]
```

- [ ] **Step 3: Ajouter le compteur sur `PostMedia`**

Dans `model PostMedia`, avant `createdAt` :

```prisma
  /// Nombre de fois que CE média précis a été téléchargé : +1 par média
  /// effectivement enregistré. Voir la note sur `Post.downloadCount`.
  downloadCount Int @default(0)
```

Ne rien ajouter d'autre à `PostMedia` : il n'a pas de relation entrante depuis `PostMediaDownload` (cf. le commentaire de `mediaId`).

- [ ] **Step 4: Ajouter la relation inverse sur `User`**

Dans `model User`, à la suite de `postBookmarks PostBookmark[] @relation("UserPostBookmarks")` (autour de la ligne 211) :

```prisma
  postMediaDownloads PostMediaDownload[] @relation("UserPostMediaDownloads")
```

- [ ] **Step 5: Régénérer le client Prisma et vérifier que le schéma est valide**

```bash
cd packages/shared && npx prisma generate --generator client
```

Attendu : `Generated Prisma Client` sans erreur. Une erreur `Error validating field` signale une relation inverse manquante — relire les steps 2 et 4.

- [ ] **Step 6: Vérifier que le client expose bien le nouveau modèle**

```bash
grep -c "postMediaDownload" packages/shared/prisma/client/index.d.ts
```

Attendu : un nombre supérieur à `0`. Si `0`, la génération n'a pas pris le modèle en compte.

- [ ] **Step 7: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): PostMediaDownload + compteurs downloadCount

Table d'evenements indexee pour l'analyse fine (4 index cibles) et deux
compteurs denormalises pour les lectures O(1) : Post.downloadCount compte
les actions, PostMedia.downloadCount compte les medias. L'ecart entre les
deux est voulu et documente.

Pas de relation Prisma vers PostMedia : une cascade effacerait la trace
analytique avec le media, meme raisonnement que PostMedia.uploaderId."
```

---

## Task 2 : `PostService.recordMediaDownloads`

**Files:**
- Modify: `services/gateway/src/services/PostService.ts`
- Test: `services/gateway/src/__tests__/posts-media-download-service.test.ts` (créer)

**Interfaces:**
- Consumes: `prisma.postMediaDownload.createMany`, `prisma.postMedia.findMany`, `prisma.postMedia.updateMany`, `prisma.post.update` (Task 1) ; la méthode privée existante `this.buildVisibilityFilter(viewerUserId)` (`PostService.ts:634`).
- Produces:
  ```ts
  async recordMediaDownloads(
    postId: string,
    userId: string,
    input: { mediaIds: string[]; surface: string },
  ): Promise<{ recorded: number } | null>
  ```
  Retourne `null` quand le poste est introuvable, supprimé, ou invisible pour `userId` — la route en fait un `404`.

- [ ] **Step 1: Écrire les tests rouges**

Créer `services/gateway/src/__tests__/posts-media-download-service.test.ts` :

```ts
/**
 * Service tests — PostService.recordMediaDownloads
 *
 * Deux invariants critiques y sont verrouillés :
 *  1. Les mediaIds sont DÉDUPLIQUÉS avant écriture. `updateMany` avec un filtre
 *     `in` ne matche qu'une fois un id répété : sans dédup en amont, deux
 *     lignes d'historique seraient écrites pour un seul incrément de compteur,
 *     et les deux divergeraient silencieusement et définitivement.
 *  2. `Post.downloadCount` compte des ACTIONS (+1 par appel), pendant que
 *     `PostMedia.downloadCount` compte des MÉDIAS (+1 chacun). Leur écart est
 *     l'information, pas un bug à corriger.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const MEDIA_A = '507f1f77bcf86cd799439021';
const MEDIA_B = '507f1f77bcf86cd799439022';
const FOREIGN_MEDIA = '507f1f77bcf86cd799439099';
const USER_ID = '507f1f77bcf86cd799439031';

const postFindFirst = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mediaFindMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const downloadCreateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mediaUpdateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const postUpdate = jest.fn<(...a: unknown[]) => Promise<unknown>>();

/**
 * Même pattern que `posts-view-idempotence.test.ts` : le service est instancié
 * avec un prisma stub à UN seul argument, et `buildVisibilityFilter` — privé,
 * qui interroge amis / contacts DM / communautés — est court-circuité pour
 * isoler le chemin testé. Le marqueur `__acl` permet de vérifier que le filtre
 * est bien injecté dans le `where` du findFirst.
 */
function makeSUT() {
  const prisma = {
    post: { findFirst: postFindFirst, update: postUpdate },
    postMedia: { findMany: mediaFindMany, updateMany: mediaUpdateMany },
    postMediaDownload: { createMany: downloadCreateMany },
  };

  const svc = new PostService(prisma as never);
  (svc as unknown as { buildVisibilityFilter: () => Promise<object> }).buildVisibilityFilter =
    async () => ({ __acl: true });
  return svc;
}

describe('PostService.recordMediaDownloads', () => {
  beforeEach(() => {
    postFindFirst.mockReset().mockResolvedValue({ id: POST_ID, authorId: USER_ID });
    mediaFindMany.mockReset().mockResolvedValue([{ id: MEDIA_A }, { id: MEDIA_B }]);
    downloadCreateMany.mockReset().mockResolvedValue({ count: 2 });
    mediaUpdateMany.mockReset().mockResolvedValue({ count: 2 });
    postUpdate.mockReset().mockResolvedValue({});
  });

  it('écrit une ligne par média et renvoie le compte écrit', async () => {
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 2 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [
        { postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'detail' },
        { postId: POST_ID, mediaId: MEDIA_B, userId: USER_ID, surface: 'detail' },
      ],
    });
  });

  it('DÉDUPLIQUE un mediaId répété dans le même batch', async () => {
    mediaFindMany.mockResolvedValue([{ id: MEDIA_A }]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_A, MEDIA_A],
      surface: 'feed',
    });

    expect(result).toEqual({ recorded: 1 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'feed' }],
    });
    expect(mediaUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [MEDIA_A] } },
      data: { downloadCount: { increment: 1 } },
    });
  });

  it('filtre un média appartenant à un autre poste sans échouer', async () => {
    mediaFindMany.mockResolvedValue([{ id: MEDIA_A }]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, FOREIGN_MEDIA],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 1 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'detail' }],
    });
  });

  it('incrémente Post.downloadCount de 1 pour un batch de 2 médias', async () => {
    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { downloadCount: { increment: 1 } },
    });
    expect(mediaUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [MEDIA_A, MEDIA_B] } },
      data: { downloadCount: { increment: 1 } },
    });
  });

  it('écrit les événements AVANT les compteurs (ordre réparable)', async () => {
    const order: string[] = [];
    downloadCreateMany.mockImplementation(async () => { order.push('events'); return { count: 2 }; });
    mediaUpdateMany.mockImplementation(async () => { order.push('media'); return { count: 2 }; });
    postUpdate.mockImplementation(async () => { order.push('post'); return {}; });

    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(order[0]).toBe('events');
  });

  it('renvoie null quand le poste est introuvable ou invisible', async () => {
    postFindFirst.mockResolvedValue(null);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });

    expect(result).toBeNull();
    expect(downloadCreateMany).not.toHaveBeenCalled();
    expect(postUpdate).not.toHaveBeenCalled();
  });

  it('applique le filtre de VISIBILITÉ au chargement du poste', async () => {
    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });

    // Le marqueur injecté par le stub de buildVisibilityFilter doit se
    // retrouver dans le `where` : sans lui, n'importe qui pourrait enregistrer
    // les médias d'un poste privé en connaissant son identifiant.
    const where = (postFindFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.__acl).toBe(true);
    expect(where.id).toBe(POST_ID);
  });

  it("n'écrit rien quand aucun média ne survit au filtrage", async () => {
    mediaFindMany.mockResolvedValue([]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [FOREIGN_MEDIA],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 0 });
    expect(downloadCreateMany).not.toHaveBeenCalled();
    expect(postUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd services/gateway && bun run test -- posts-media-download-service
```

Attendu : ÉCHEC avec `sut.recordMediaDownloads is not a function`.

- [ ] **Step 3: Implémenter la méthode**

Dans `services/gateway/src/services/PostService.ts`, ajouter la méthode juste après `getPostById` (autour de la ligne 630, avant `buildVisibilityFilter`) :

```ts
  /**
   * Enregistre le téléchargement des médias d'un poste par un utilisateur.
   *
   * ACL — c'est le filtre de VISIBILITÉ qui s'applique, pas celui
   * d'interaction : enregistrer un média est un acte de consommation, donc si
   * l'utilisateur a pu afficher le média il doit pouvoir l'enregistrer.
   * `canUserViewPost` (amis stricts) refuserait le téléchargement d'un média
   * affiché à l'écran d'un contact DM — l'asymétrie voir ⊇ interagir est
   * documentée dans `services/posts/postVisibility.ts`.
   *
   * Retourne `null` si le poste est introuvable, supprimé OU invisible : les
   * trois cas sont indiscernables par construction (le filtre fait partie du
   * `where`), et c'est voulu — distinguer révélerait l'existence du poste.
   *
   * ORDRE D'ÉCRITURE : événements d'abord, compteurs ensuite. Le gateway
   * n'utilise pas de transaction ; une panne entre les deux laisse le compteur
   * en retard sur l'historique, ce qui se recalcule. L'ordre inverse
   * produirait un compteur en avance, irréparable.
   */
  async recordMediaDownloads(
    postId: string,
    userId: string,
    input: { mediaIds: string[]; surface: string },
  ): Promise<{ recorded: number } | null> {
    const visibilityFilter = await this.buildVisibilityFilter(userId);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      select: { id: true },
    });
    if (!post) return null;

    // Déduplication AVANT toute écriture : `updateMany` + `in` ne matche
    // qu'une fois un id répété, donc un batch non dédupliqué écrirait N lignes
    // d'historique pour un seul incrément de compteur — divergence silencieuse
    // et définitive entre les deux.
    const requestedIds = Array.from(new Set(input.mediaIds));

    // Seuls les médias réellement attachés à CE poste sont retenus. Un client
    // dont le cache est en retard sur une édition ne doit pas voir tout son
    // batch rejeté pour un média détaché entre-temps.
    const ownedMedia = await this.prisma.postMedia.findMany({
      where: { id: { in: requestedIds }, postId },
      select: { id: true },
    });
    const mediaIds = ownedMedia.map((m) => m.id);
    if (mediaIds.length === 0) return { recorded: 0 };

    await this.prisma.postMediaDownload.createMany({
      data: mediaIds.map((mediaId) => ({
        postId,
        mediaId,
        userId,
        surface: input.surface,
      })),
    });

    await this.prisma.postMedia.updateMany({
      where: { id: { in: mediaIds } },
      data: { downloadCount: { increment: 1 } },
    });

    // +1 par ACTION, jamais par média : ce compteur répond à « combien de fois
    // ce poste a-t-il été enregistré ».
    await this.prisma.post.update({
      where: { id: postId },
      data: { downloadCount: { increment: 1 } },
    });

    return { recorded: mediaIds.length };
  }
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
cd services/gateway && bun run test -- posts-media-download-service
```

Attendu : les 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/posts-media-download-service.test.ts
git commit -m "feat(posts): PostService.recordMediaDownloads

ACL de VISIBILITE (pas d'interaction) : enregistrer un media est un acte de
consommation, un contact DM qui voit le media doit pouvoir l'enregistrer.
Poste introuvable / invisible renvoient tous deux null — distinguer
revelerait l'existence du poste.

mediaIds dedupliques avant ecriture : updateMany + in ne matche qu'une fois
un id repete, l'historique divergerait du compteur sans erreur.
Evenements ecrits AVANT les compteurs : seul ordre reparable."
```

---

## Task 3 : Route `POST /posts/:postId/downloads`

**Files:**
- Modify: `services/gateway/src/routes/posts/types.ts`
- Modify: `services/gateway/src/routes/posts/interactions.ts`
- Test: `services/gateway/src/__tests__/posts-media-download-route.test.ts` (créer)

**Interfaces:**
- Consumes: `postService.recordMediaDownloads(postId, userId, { mediaIds, surface })` (Task 2).
- Produces: `RecordDownloadsSchema` exportée depuis `routes/posts/types.ts` ; la route `POST /posts/:postId/downloads` répondant `{ success: true, data: { recorded: number } }`.

- [ ] **Step 1: Écrire les tests rouges**

Créer `services/gateway/src/__tests__/posts-media-download-route.test.ts` :

```ts
/**
 * Route tests — POST /posts/:postId/downloads
 *
 * Contrat HTTP du batch de téléchargement. La logique métier (ACL, dédup,
 * filtrage, compteurs) est testée au niveau service dans
 * posts-media-download-service.test.ts ; ici on ne vérifie que le câblage :
 * validation d'entrée, codes de statut, et la traduction `null` → 404.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const recordMediaDownloads = jest.fn<(...a: unknown[]) => Promise<unknown>>();

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({ recordMediaDownloads })),
}));

jest.mock('../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
  resolveFrontendBaseUrl: jest.fn<() => string>().mockReturnValue('https://meeshy.me'),
}));

jest.mock('../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<() => Record<string, unknown>>().mockReturnValue({}),
}));

jest.mock('../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

const POST_ID = '507f1f77bcf86cd799439011';
const MEDIA_A = '507f1f77bcf86cd799439021';

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = {
        isAuthenticated: true,
        registeredUser: { id: userId, username: 'tester', role: 'USER' },
      };
    }
    done();
  };

async function buildApp(authenticated: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {} as unknown as PrismaClient;
  const requiredAuth = buildAuthMiddleware(authenticated ? 'u1' : undefined);
  const { registerInteractionRoutes } = await import('../routes/posts/interactions');
  app.register(async (instance) => {
    instance.addHook('preValidation', requiredAuth as any);
    registerInteractionRoutes(instance, prisma, requiredAuth);
  });
  await app.ready();
  return app;
}

describe('POST /posts/:postId/downloads', () => {
  let authApp: FastifyInstance;
  let unauthApp: FastifyInstance;

  beforeAll(async () => {
    authApp = await buildApp(true);
    unauthApp = await buildApp(false);
  });

  afterAll(async () => {
    await authApp.close();
    await unauthApp.close();
  });

  beforeEach(() => {
    recordMediaDownloads.mockReset().mockResolvedValue({ recorded: 1 });
  });

  it('enregistre le batch et renvoie le compte écrit', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A], surface: 'detail' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    expect(recordMediaDownloads).toHaveBeenCalledWith(POST_ID, 'u1', {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });
  });

  it("applique la surface 'detail' par défaut", async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(200);
    expect(recordMediaDownloads).toHaveBeenCalledWith(POST_ID, 'u1', {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });
  });

  it('traduit un poste introuvable ou invisible en 404', async () => {
    recordMediaDownloads.mockResolvedValue(null);
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('POST_NOT_FOUND');
  });

  it('rejette un mediaIds vide avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette plus de 50 mediaIds avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: Array.from({ length: 51 }, () => MEDIA_A) },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette une surface inconnue avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A], surface: 'bogus' },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette une requête non authentifiée avec 401', async () => {
    const res = await unauthApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(401);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd services/gateway && bun run test -- posts-media-download-route
```

Attendu : ÉCHEC — la route renvoie `404` de Fastify (route inconnue) au lieu des codes attendus.

- [ ] **Step 3: Ajouter le schéma Zod**

Dans `services/gateway/src/routes/posts/types.ts`, à la suite de `UpdatePostSchema` (après la ligne 319) :

```ts
/// Surfaces d'où peut partir un « Enregistrer ». Volontairement plus courte que
/// IMPRESSION_SOURCES : seules ces trois surfaces exposent l'action.
export const DOWNLOAD_SURFACES = ['feed', 'detail', 'reel'] as const;

export const RecordDownloadsSchema = z.object({
  /// Bornes alignées sur removeMediaIds : un poste ne porte jamais 50 médias,
  /// la borne est un garde-fou anti-abus, pas une limite produit.
  mediaIds: z.array(z.string()).min(1).max(50),
  surface: z.enum(DOWNLOAD_SURFACES).default('detail'),
});
```

- [ ] **Step 4: Ajouter la route**

Dans `services/gateway/src/routes/posts/interactions.ts`, importer le schéma en modifiant la ligne d'import existante :

```ts
import { LikeSchema, RepostSchema, PostParams, EngagementBatchSchema, RecordDownloadsSchema } from './types';
```

Puis ajouter la route juste après le bloc `GET /posts/:postId/share` (qui se termine autour de la ligne 600) :

```ts
  // POST /posts/:postId/downloads — Trace le téléchargement des médias d'un poste.
  //
  // Batch et non unitaire : « Enregistrer » sur un poste à quatre images
  // télécharge les quatre d'un coup, un seul aller-retour. La validation, l'ACL
  // et la déduplication vivent dans PostService.recordMediaDownloads.
  fastify.post('/posts/:postId/downloads', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = RecordDownloadsSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      const { postId } = request.params;
      const result = await postService.recordMediaDownloads(
        postId,
        authContext.registeredUser.id,
        { mediaIds: parsed.data.mediaIds, surface: parsed.data.surface },
      );

      // null couvre indistinctement « absent », « supprimé » et « invisible » —
      // les distinguer révélerait l'existence du poste.
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, result);
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/downloads] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

```bash
cd services/gateway && bun run test -- posts-media-download-route
```

Attendu : les 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/routes/posts/types.ts services/gateway/src/routes/posts/interactions.ts services/gateway/src/__tests__/posts-media-download-route.test.ts
git commit -m "feat(posts): route POST /posts/:postId/downloads

Batch et non unitaire : Enregistrer sur un poste a quatre images ne fait
qu'un aller-retour. Poste absent, supprime ou invisible renvoient tous 404,
jamais 403 — un 403 revelerait l'existence du poste."
```

---

## Task 4 : `deletePost` — droit modérateur et audit

**Files:**
- Modify: `services/gateway/src/services/PostService.ts:950`
- Test: `services/gateway/src/__tests__/posts-delete-moderator.test.ts` (créer)

**Interfaces:**
- Consumes: `prisma.adminAuditLog.create` (modèle `AdminAuditLog` existant, `schema.prisma:1632`).
- Produces: `deletePost(postId: string, actorId: string, options: { actorRole: string })` — la signature à trois arguments que Task 5 appellera.

- [ ] **Step 1: Écrire les tests rouges**

Créer `services/gateway/src/__tests__/posts-delete-moderator.test.ts` :

```ts
/**
 * Service tests — PostService.deletePost, droit de modération
 *
 * Un modérateur peut RETIRER le poste d'autrui, jamais le modifier (décision
 * produit : réécrire le texte de quelqu'un sous sa signature casse l'intégrité
 * du contenu). Chaque suppression non-auteur laisse une ligne AdminAuditLog.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockLog = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => mockLog) },
}));

import { PostService } from '../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const MODERATOR_ID = '507f1f77bcf86cd799439032';

const postFindFirst = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const postUpdate = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const trackingLinkUpdateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const auditCreate = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const releasePost = jest.fn<(...a: unknown[]) => Promise<unknown>>();

/**
 * `deletePost` termine par `this.soundCaptureService.releasePost(postId)` — un
 * service interne, PAS une table Prisma. On le court-circuite sur l'instance,
 * comme `posts-view-idempotence.test.ts` court-circuite `buildVisibilityFilter`.
 */
function makeSUT() {
  const prisma = {
    post: { findFirst: postFindFirst, update: postUpdate },
    trackingLink: { updateMany: trackingLinkUpdateMany },
    adminAuditLog: { create: auditCreate },
  };

  const svc = new PostService(prisma as never);
  (svc as unknown as { soundCaptureService: { releasePost: typeof releasePost } })
    .soundCaptureService = { releasePost };
  return svc;
}

describe('PostService.deletePost — droits', () => {
  beforeEach(() => {
    postFindFirst.mockReset().mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      type: 'POST',
      visibility: 'PUBLIC',
    });
    postUpdate.mockReset().mockResolvedValue({ id: POST_ID, type: 'POST', visibility: 'PUBLIC' });
    trackingLinkUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    auditCreate.mockReset().mockResolvedValue({});
    releasePost.mockReset().mockResolvedValue(undefined);
  });

  it("l'auteur supprime son poste sans ligne d'audit", async () => {
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, AUTHOR_ID, { actorRole: 'USER' });

    expect(result).not.toBeNull();
    expect(postUpdate).toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('un USER non auteur est refusé', async () => {
    const sut = makeSUT();
    await expect(
      sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'USER' }),
    ).rejects.toThrow('FORBIDDEN');
    expect(postUpdate).not.toHaveBeenCalled();
  });

  it("un MODERATOR non auteur supprime ET laisse une ligne d'audit", async () => {
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'MODERATOR' });

    expect(result).not.toBeNull();
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: AUTHOR_ID,
        adminId: MODERATOR_ID,
        action: 'DELETE_POST',
        entity: 'Post',
        entityId: POST_ID,
        metadata: JSON.stringify({ type: 'POST' }),
      },
    });
  });

  it('ADMIN et BIGBOSS non auteurs sont autorisés', async () => {
    for (const actorRole of ['ADMIN', 'BIGBOSS']) {
      auditCreate.mockClear();
      const sut = makeSUT();
      const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole });
      expect(result).not.toBeNull();
      expect(auditCreate).toHaveBeenCalledTimes(1);
    }
  });

  it("un échec d'écriture d'audit n'annule pas la suppression", async () => {
    auditCreate.mockRejectedValue(new Error('mongo down'));
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'MODERATOR' });

    expect(result).not.toBeNull();
    expect(postUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
cd services/gateway && bun run test -- posts-delete-moderator
```

Attendu : ÉCHEC — le test `MODERATOR` lève `FORBIDDEN` parce que la signature actuelle ignore le rôle.

- [ ] **Step 3: Modifier `deletePost`**

Dans `services/gateway/src/services/PostService.ts`, remplacer l'en-tête et le contrôle d'autorisation de la méthode (lignes 950-958) par :

```ts
  /**
   * Soft-delete d'un poste.
   *
   * Auteur : toujours autorisé. Modérateur et plus : autorisé sur le poste
   * d'autrui, avec une ligne AdminAuditLog. Un modérateur ne peut PAS modifier
   * un poste — réécrire le texte de quelqu'un sous sa signature casserait
   * l'intégrité du contenu ; `updatePost` reste réservé à l'auteur.
   */
  async deletePost(postId: string, actorId: string, options: { actorRole: string }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });

    if (!post) return null;

    const isAuthor = post.authorId === actorId;
    const canModerate = ['BIGBOSS', 'ADMIN', 'MODERATOR'].includes(options.actorRole);
    if (!isAuthor && !canModerate) {
      throw new Error('FORBIDDEN');
    }
```

Puis, immédiatement après le `this.prisma.post.update({ ... data: { deletedAt: new Date() } })` existant, insérer :

```ts
    // Retrait par un tiers habilité : trace d'audit. Best-effort comme la
    // désactivation des liens ci-dessous — un log perdu ne doit pas annuler
    // une suppression déjà committée.
    if (!isAuthor) {
      try {
        await this.prisma.adminAuditLog.create({
          data: {
            userId: post.authorId,
            adminId: actorId,
            action: 'DELETE_POST',
            entity: 'Post',
            entityId: postId,
            metadata: JSON.stringify({ type: post.type }),
          },
        });
      } catch (err) {
        log.warn('deletePost: audit log write failed', { postId, actorId, err });
      }
    }
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
cd services/gateway && bun run test -- posts-delete-moderator
```

Attendu : les 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/posts-delete-moderator.test.ts
git commit -m "feat(posts): un moderateur peut retirer le poste d'autrui

MODERATOR/ADMIN/BIGBOSS peuvent supprimer le poste d'un tiers, avec une
ligne AdminAuditLog. Ecriture d'audit best-effort : un log perdu n'annule
pas une suppression deja committee.

updatePost reste STRICTEMENT reserve a l'auteur — reecrire le texte de
quelqu'un sous sa signature casserait l'integrite du contenu."
```

---

## Task 5 : La route DELETE transmet le rôle

**Files:**
- Modify: `services/gateway/src/routes/posts/core.ts:404`

**Interfaces:**
- Consumes: `deletePost(postId, actorId, { actorRole })` (Task 4) ; `authContext.registeredUser.role`.
- Produces: rien de nouveau — la route conserve son contrat HTTP.

- [ ] **Step 1: Vérifier qu'aucun autre appelant n'existe**

```bash
cd /Users/smpceo/Documents/v2_meeshy
grep -rn "deletePost(" services/gateway/src | grep -v dist | grep -v __tests__
```

Attendu : exactement deux lignes — la définition dans `PostService.ts` et l'appel dans `core.ts`. Si une troisième apparaît, la mettre à jour aussi.

- [ ] **Step 2: Transmettre le rôle**

Dans `services/gateway/src/routes/posts/core.ts`, remplacer la ligne 404 :

```ts
      const result = await postService.deletePost(postId, authContext.registeredUser.id);
```

par :

```ts
      const result = await postService.deletePost(postId, authContext.registeredUser.id, {
        actorRole: authContext.registeredUser.role,
      });
```

Le commentaire de la ligne 393 (`// DELETE /posts/:postId — Soft delete (author only)`) devient faux ; le remplacer par :

```ts
  // DELETE /posts/:postId — Soft delete (auteur, ou modérateur et plus avec audit)
```

- [ ] **Step 3: Vérifier la compilation TypeScript**

```bash
cd services/gateway && npx tsc --noEmit
```

Attendu : aucune erreur mentionnant `deletePost`. **Note** : ce projet peut porter des erreurs `tsc` préexistantes sans rapport avec ce lot — ne corriger que celles qui citent `deletePost` ou les fichiers touchés par ce plan.

- [ ] **Step 4: Lancer la suite de tests des routes posts pour vérifier l'absence de régression**

```bash
cd services/gateway && bun run test -- posts-
```

Attendu : toutes les suites `posts-*` PASS. Une suite existante qui appellerait `deletePost` à deux arguments échouerait ici — la corriger en passant `{ actorRole: 'USER' }`.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add services/gateway/src/routes/posts/core.ts
git commit -m "feat(posts): DELETE /posts/:postId transmet le role de l'acteur

core.ts etait le seul appelant de deletePost — le changement de signature
ne se propage nulle part ailleurs."
```

---

## Task 6 : Script de migration des index

**Files:**
- Create: `packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js`

**Interfaces:**
- Consumes: le modèle `PostMediaDownload` (Task 1).
- Produces: un script exécutable par `mongosh "$DATABASE_URL" < <fichier>`.

- [ ] **Step 1: Écrire le script**

Créer `packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js` :

```js
/**
 * Migration MongoDB — index de `PostMediaDownload`.
 *
 * POURQUOI CE SCRIPT EXISTE : l'entrypoint de production ne joue AUCUNE
 * migration. Les `@@index` déclarés dans le schéma Prisma ne sont jamais créés
 * sur la base de production par un déploiement. Sans ce script, la collection
 * écrit parfaitement et toute lecture analytique fait un COLLSCAN — exactement
 * ce que l'architecture à deux étages cherche à éviter.
 *
 * Les quatre index et ce qu'ils servent (ne pas en supprimer un en le croyant
 * inutile — chacun répond à une requête identifiée) :
 *
 *   postId_userId      → téléchargeurs uniques d'un poste ; « cet utilisateur
 *                        a-t-il déjà téléchargé ce poste ? »
 *   mediaId_createdAt  → grain média sur une fenêtre temporelle ; « quel média
 *                        a été le plus repris ces 30 jours ? »
 *   userId_createdAt   → historique de téléchargement d'un utilisateur.
 *   createdAt          → balayage par période, rollups futurs, et support d'un
 *                        index TTL si une rétention est décidée plus tard.
 *
 * `surface` n'est volontairement PAS indexé : trois valeurs possibles, le
 * planner ne choisirait jamais un index aussi peu sélectif. Le filtre par
 * surface s'applique après le filtre temporel.
 *
 * Idempotent : un index déjà présent avec la même spec est un no-op ; présent
 * avec une spec divergente, il est droppé puis recréé.
 *
 * Exécution :
 *   mongosh "$DATABASE_URL" < 2026-08-04-post-media-download-indexes.mongodb.js
 */

const COLLECTION = 'PostMediaDownload';

const WANTED = [
  { name: 'postId_userId', key: { postId: 1, userId: 1 } },
  { name: 'mediaId_createdAt', key: { mediaId: 1, createdAt: -1 } },
  { name: 'userId_createdAt', key: { userId: 1, createdAt: -1 } },
  { name: 'createdAt', key: { createdAt: -1 } },
];

function sameKey(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
}

const names = db.getCollectionNames();
if (!names.includes(COLLECTION)) {
  print(`[migration] collection ${COLLECTION} absente — création explicite`);
  db.createCollection(COLLECTION);
}

const coll = db.getCollection(COLLECTION);
const existing = coll.getIndexes();

for (const wanted of WANTED) {
  const found = existing.find((idx) => idx.name === wanted.name);

  if (found && sameKey(found.key, wanted.key)) {
    print(`[migration] ${wanted.name} — déjà conforme, no-op`);
    continue;
  }

  if (found) {
    print(`[migration] ${wanted.name} — spec divergente, drop puis recréation`);
    coll.dropIndex(wanted.name);
  }

  coll.createIndex(wanted.key, { name: wanted.name });
  print(`[migration] ${wanted.name} — créé`);
}

print('[migration] index PostMediaDownload à jour');
```

- [ ] **Step 2: Vérifier la syntaxe du script**

```bash
cd /Users/smpceo/Documents/v2_meeshy
node --check packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js
```

Attendu : aucune sortie (syntaxe valide). `node --check` ne fait que parser — il n'exécute rien et ne se connecte à aucune base.

- [ ] **Step 3: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js
git commit -m "chore(migrations): index PostMediaDownload pour mongosh

L'entrypoint prod ne joue aucune migration : sans ce script les @@index
Prisma n'existent pas en production et chaque lecture analytique ferait un
COLLSCAN. Idempotent, documente la raison de chacun des quatre index."
```

---

## Task 7 : Vérification finale du lot

**Files:** aucun — tâche de validation.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la preuve que le lot est vert.

- [ ] **Step 1: Préparer l'environnement exactement comme la CI**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx prisma generate --generator client && bun run build
```

Attendu : génération et build sans erreur. Sauter cette étape fait échouer une vingtaine de suites pour des raisons sans rapport avec ce lot.

- [ ] **Step 2: Lancer la suite complète du gateway**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && bun run test:coverage
```

Attendu : toutes les suites vertes. La référence avant ce lot est de 249/249 suites, lignes ~62,9 % sous bun. Trois suites s'y ajoutent.

- [ ] **Step 3: Vérifier qu'aucune suite existante n'a régressé**

Si une suite hors de ce lot est rouge, la traiter avant de continuer — ne jamais rapporter le lot comme terminé avec une régression, même sans rapport apparent.

- [ ] **Step 4: Exécuter la migration d'index sur la production**

C'est une étape de la définition de « terminé », pas une option. Depuis un accès au serveur de production :

```bash
mongosh "$DATABASE_URL" < packages/shared/prisma/migrations/2026-08-04-post-media-download-indexes.mongodb.js
```

Attendu : quatre lignes `— créé` au premier passage, quatre `— déjà conforme, no-op` à un second. Si l'accès production n'est pas disponible dans la session, **le signaler explicitement comme reste à faire** plutôt que de considérer le lot clos.

- [ ] **Step 5: Vérifier l'état du dépôt**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git status --short && git log --oneline -6
```

Attendu : arbre de travail propre, six commits correspondant aux tâches 1 à 6.

---

## Ce que ce lot ne fait PAS

À ne pas ajouter par initiative — chacun de ces points est traité ailleurs ou a été explicitement écarté :

- Toute UI. Les lots B (iOS) et C (web) consomment ce contrat.
- Le téléchargement lui-même (écriture dans la photothèque ou sur disque) : code client.
- Toute remontée des compteurs de téléchargement dans une surface. Ils sont écrits, pas affichés.
- Une notification à l'auteur dont le poste est retiré par un modérateur.
- L'extension du droit de **modification** aux modérateurs — explicitement rejetée.
- Une purge ou un index TTL sur `PostMediaDownload`.
