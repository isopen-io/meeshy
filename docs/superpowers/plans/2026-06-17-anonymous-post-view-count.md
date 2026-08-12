# Comptage des vues anonymes (`postOpenCount`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un viewer sans compte (web) ou anonyme (iOS) qui ouvre un reel/post incrémente `postOpenCount` une fois par session, sans passer par le parcours engagement inscrit.

**Architecture:** Endpoint gateway public `POST /posts/:id/anonymous-view` qui lit une clé de dédup opaque dans le header `X-Session-Token`, vérifie post public + non supprimé, déduplique via un nouveau modèle `AnonymousPostOpen (postId, sessionKey)` unique, et incrémente `Post.postOpenCount` au 1ᵉʳ insert. Le web tire le ping au montage des pages post quand l'utilisateur n'est pas authentifié. Compteur volontairement faible — failles documentées dans la spec.

**Tech Stack:** Prisma + MongoDB (gateway), Fastify 5 + Zod, Jest (gateway), Next.js 15 + Jest (web), Swift/SwiftUI (iOS — surface optionnelle).

**Spec:** `docs/superpowers/specs/2026-06-17-anonymous-post-view-count-design.md`

---

## File Structure

- **Create** `packages/shared/prisma/schema.prisma` → modèle `AnonymousPostOpen` (+ relation inverse sur `Post`).
- **Create** `services/gateway/src/__tests__/posts-anonymous-view.test.ts` → tests jest de `PostService.recordAnonymousOpen`.
- **Modify** `services/gateway/src/services/PostService.ts` → méthode `recordAnonymousOpen`.
- **Modify** `services/gateway/src/routes/posts/interactions.ts` → route `POST /posts/:postId/anonymous-view`.
- **Create** `apps/web/lib/anonymous-session.ts` → `getOrCreateWebSessionKey()`.
- **Create** `apps/web/lib/__tests__/anonymous-session.test.ts` → tests du helper.
- **Modify** `apps/web/services/posts.service.ts` → `recordAnonymousView(postId, sessionKey)` (fetch dédié, sans JWT).
- **Modify** `apps/web/app/feeds/post/[postId]/page.tsx` → ping au montage si non authentifié.
- **(Optionnel) Modify** `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift` → ping anonyme iOS.

---

## Task 1: Schéma Prisma — modèle `AnonymousPostOpen`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (modèle `Post` relations ~ligne 2882 + nouveau modèle après `Post`)

- [ ] **Step 1: Ajouter la relation inverse sur `Post`**

Dans le bloc `model Post { ... }`, section RELATIONS (à côté de `views PostView[]`), ajouter :

```prisma
  views          PostView[]
  anonymousOpens AnonymousPostOpen[]
```

- [ ] **Step 2: Ajouter le modèle `AnonymousPostOpen`** (juste après l'accolade fermante de `model Post`)

```prisma
/// Déduplication des ouvertures ANONYMES d'un post (v1 "comptage bête").
/// `sessionKey` = chaîne opaque issue du header X-Session-Token (token de
/// session iOS anonyme OU token persisté par le navigateur). Identifiant
/// FAIBLE — voir la section Sécurité de la spec 2026-06-17. INSERT-only :
/// le 1ᵉʳ insert d'un (postId, sessionKey) incrémente Post.postOpenCount.
model AnonymousPostOpen {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  postId     String   @db.ObjectId
  sessionKey String
  createdAt  DateTime @default(now())
  post       Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, sessionKey])
  @@index([postId])
}
```

- [ ] **Step 3: Régénérer le client Prisma**

Run: `cd packages/shared && pnpm generate`
Expected: `Generated Prisma Client` sans erreur ; le type `AnonymousPostOpen` et `prisma.anonymousPostOpen` deviennent disponibles.

- [ ] **Step 4: Synchroniser l'index unique dans MongoDB (runtime/dev — pas requis pour les tests jest qui mockent Prisma)**

Run (avec `DATABASE_URL` pointant la MongoDB dev en marche) : `cd packages/shared && npx prisma db push --schema=./prisma/schema.prisma`
Expected: `Your database is now in sync with your Prisma schema` ; la collection `AnonymousPostOpen` et l'index unique `(postId, sessionKey)` sont créés (l'unicité est ce qui fait lever P2002 sur doublon).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(shared): modèle AnonymousPostOpen pour dédup des vues anonymes"
```

---

## Task 2: `PostService.recordAnonymousOpen` (TDD)

**Files:**
- Test: `services/gateway/src/__tests__/posts-anonymous-view.test.ts` (créer)
- Modify: `services/gateway/src/services/PostService.ts` (nouvelle méthode publique, à côté de `recordView`)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `services/gateway/src/__tests__/posts-anonymous-view.test.ts` :

```typescript
/**
 * Tests — PostService.recordAnonymousOpen
 * v1 "comptage bête" : 1ᵉʳ (postId, sessionKey) → +1 postOpenCount ; doublon
 * (P2002) → no-op ; post non public / introuvable → no-op.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const POST_A = '507f1f77bcf86cd799439011';

const buildPrisma = (over: Partial<Record<string, unknown>> = {}) => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>()
      .mockResolvedValue({ id: POST_A }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const anonymousPostOpen = {
    create: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'x' }),
  };
  const prisma = { post, anonymousPostOpen, ...over };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post; anonymousPostOpen: typeof anonymousPostOpen;
  };
};

const makeService = (prisma: ReturnType<typeof buildPrisma>) =>
  new PostService(prisma as unknown as ConstructorParameters<typeof PostService>[0]);

describe('PostService.recordAnonymousOpen', () => {
  it('compte la 1ʳᵉ ouverture (insert) et incrémente postOpenCount', async () => {
    const prisma = buildPrisma();
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(true);
    expect(prisma.anonymousPostOpen.create).toHaveBeenCalledTimes(1);
    expect(prisma.post.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { postOpenCount: { increment: 1 } } }),
    );
  });

  it('ne recompte pas un doublon (P2002) — no-op', async () => {
    const prisma = buildPrisma({
      anonymousPostOpen: {
        create: jest.fn<(arg?: unknown) => Promise<unknown>>()
          .mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' })),
      },
    });
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(false);
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('ne compte pas un post non public / introuvable', async () => {
    const prisma = buildPrisma({
      post: {
        findFirst: jest.fn<(arg?: unknown) => Promise<null>>().mockResolvedValue(null),
        update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
      },
    });
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(false);
    expect(prisma.anonymousPostOpen.create).not.toHaveBeenCalled();
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-anonymous-view.test.ts`
Expected: FAIL — `recordAnonymousOpen is not a function` (méthode pas encore définie).

- [ ] **Step 3: Implémenter la méthode minimale**

Dans `services/gateway/src/services/PostService.ts`, ajouter juste après la méthode `recordView` (≈ ligne 815) :

```typescript
  /**
   * Compte une ouverture ANONYME (sans compte) d'un post. v1 "comptage bête" :
   * dédup faible par `sessionKey` (chaîne opaque du header X-Session-Token).
   * Retourne `true` UNIQUEMENT au 1ᵉʳ insert d'un (postId, sessionKey) — ce qui
   * incrémente `postOpenCount`. Doublon (P2002) ou post non public → `false`.
   * Failles connues : voir la section Sécurité de la spec 2026-06-17.
   */
  async recordAnonymousOpen(postId: string, sessionKey: string): Promise<boolean> {
    try {
      // Un anonyme ne voit que du PUBLIC — réutilise la source de vérité de visibilité.
      const visibilityFilter = await this.buildVisibilityFilter(undefined);
      const post = await this.prisma.post.findFirst({
        where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: { id: true },
      });
      if (!post) return false;

      // Dédup INSERT-only : l'unicité (postId, sessionKey) fait lever P2002 sur doublon.
      try {
        await this.prisma.anonymousPostOpen.create({ data: { postId, sessionKey } });
      } catch {
        return false; // déjà compté pour cette session (ou insert en échec) → no-op
      }

      await this.prisma.post.update({
        where: { id: postId },
        data: { postOpenCount: { increment: 1 } },
      });
      return true;
    } catch {
      return false; // fire-and-forget : un compteur ne doit jamais casser une requête
    }
  }
```

> Note : `buildVisibilityFilter` est `private` mais `recordAnonymousOpen` est une méthode de la même classe → l'appel `this.buildVisibilityFilter(undefined)` est légal et retourne `{ visibility: PostVisibility.PUBLIC }`. `NOT_DELETED` est la constante déjà utilisée par `recordView` dans ce fichier.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd services/gateway && pnpm jest src/__tests__/posts-anonymous-view.test.ts`
Expected: PASS — 3 tests verts.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/posts-anonymous-view.test.ts
git commit -m "feat(gateway): PostService.recordAnonymousOpen + tests (vues anonymes)"
```

---

## Task 3: Route gateway `POST /posts/:postId/anonymous-view`

**Files:**
- Modify: `services/gateway/src/routes/posts/interactions.ts` (ajouter la route après le handler `POST /posts/:postId/view`, ≈ ligne 270)

> Pattern du repo : les routes posts sont du glue fin testé via le service (pas de test HTTP supertest, cf. `/view`). La logique est couverte par Task 2. Cette tâche ajoute la route + une vérification manuelle.

- [ ] **Step 1: Ajouter la route**

Dans `services/gateway/src/routes/posts/interactions.ts`, juste après la fin du handler `POST /posts/:postId/view` :

```typescript
  // POST /posts/:postId/anonymous-view — compte une ouverture ANONYME (sans compte).
  // v1 "comptage bête" : public, dédup faible par X-Session-Token (chaîne opaque).
  // Les clients INSCRITS (JWT présent) sont comptés via le parcours engagement →
  // no-op ici pour éviter le double-comptage. Voir spec 2026-06-17 (§ Sécurité).
  // Pas de preValidation auth : on lit le header directement, sans tenter de
  // résoudre un Participant (un token navigateur n'en est pas un → éviterait un 401).
  fastify.post('/posts/:postId/anonymous-view', {
    config: { rateLimit: createPostRouteRateLimitConfig('view') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      if (request.headers.authorization) {
        return sendSuccess(reply, { counted: false }); // client inscrit → parcours engagement
      }
      const sessionKey = request.headers['x-session-token'] as string | undefined;
      if (!sessionKey || sessionKey.length === 0 || sessionKey.length > 128) {
        return sendBadRequest(reply, 'Missing or invalid session key', { code: 'VALIDATION_ERROR' });
      }
      const { postId } = request.params;
      const counted = await postService.recordAnonymousOpen(postId, sessionKey);
      return sendSuccess(reply, { counted });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/anonymous-view] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
```

> `createPostRouteRateLimitConfig`, `sendSuccess`, `sendBadRequest`, `sendInternalError`, `PostParams`, `FastifyRequest`, `FastifyReply` sont déjà importés en haut de `interactions.ts` (aucun nouvel import). On réutilise la clé de rate-limit `'view'` (max 60/min) — pas de modification du rate-limiter.

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `cd services/gateway && pnpm tsc --noEmit`
Expected: aucune erreur liée à `interactions.ts`.

- [ ] **Step 3: Vérification manuelle (gateway lancé + MongoDB dev avec l'index de Task 1.4)**

```bash
# Post public d'id <PID>. 1ᵉʳ ping → counted:true, 2ᵉ (même clé) → counted:false
curl -s -X POST http://localhost:3000/api/v1/posts/<PID>/anonymous-view -H 'X-Session-Token: test-sess-1' | jq
curl -s -X POST http://localhost:3000/api/v1/posts/<PID>/anonymous-view -H 'X-Session-Token: test-sess-1' | jq
# Sans header → 400
curl -s -X POST http://localhost:3000/api/v1/posts/<PID>/anonymous-view | jq
```
Expected: `{ "success": true, "data": { "counted": true } }` puis `{ ... "counted": false }` puis une erreur 400 `VALIDATION_ERROR`.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/posts/interactions.ts
git commit -m "feat(gateway): route POST /posts/:id/anonymous-view (vues anonymes)"
```

---

## Task 4: Web — helper `getOrCreateWebSessionKey` (TDD)

**Files:**
- Test: `apps/web/lib/__tests__/anonymous-session.test.ts` (créer)
- Create: `apps/web/lib/anonymous-session.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/web/lib/__tests__/anonymous-session.test.ts` :

```typescript
import { getOrCreateWebSessionKey } from '../anonymous-session';

describe('getOrCreateWebSessionKey', () => {
  beforeEach(() => localStorage.clear());

  it('réutilise le session_token anonyme existant', () => {
    localStorage.setItem('session_token', 'real-anon-token');
    expect(getOrCreateWebSessionKey()).toBe('real-anon-token');
    expect(localStorage.getItem('meeshy_session_token')).toBeNull();
  });

  it('génère et persiste un meeshy_session_token stable si aucune session', () => {
    const first = getOrCreateWebSessionKey();
    expect(first).toBeTruthy();
    expect(localStorage.getItem('meeshy_session_token')).toBe(first);
    expect(getOrCreateWebSessionKey()).toBe(first); // stable entre appels
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd apps/web && pnpm jest lib/__tests__/anonymous-session.test.ts`
Expected: FAIL — module `../anonymous-session` introuvable.

- [ ] **Step 3: Implémenter le helper**

Créer `apps/web/lib/anonymous-session.ts` :

```typescript
/**
 * Clé de session anonyme pour le comptage des vues (v1 "comptage bête").
 * Réutilise le `session_token` d'un anonyme ayant déjà rejoint une conversation,
 * sinon génère + persiste un identifiant opaque par navigateur. Identifiant
 * FAIBLE (vidable, spoofable) — voir spec 2026-06-17 (§ Sécurité).
 */
const WEB_SESSION_KEY = 'meeshy_session_token';

export function getOrCreateWebSessionKey(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem('session_token');
  if (existing) return existing;
  const stored = localStorage.getItem(WEB_SESSION_KEY);
  if (stored) return stored;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  localStorage.setItem(WEB_SESSION_KEY, generated);
  return generated;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `cd apps/web && pnpm jest lib/__tests__/anonymous-session.test.ts`
Expected: PASS — 2 tests verts.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/anonymous-session.ts apps/web/lib/__tests__/anonymous-session.test.ts
git commit -m "feat(web): getOrCreateWebSessionKey pour les vues anonymes"
```

---

## Task 5: Web — service `recordAnonymousView` + ping au montage

**Files:**
- Modify: `apps/web/services/posts.service.ts` (ajouter une fonction exportée + import `buildApiUrl`)
- Modify: `apps/web/app/feeds/post/[postId]/page.tsx` (ping au montage si non authentifié)

- [ ] **Step 1: Ajouter `recordAnonymousView` (fetch dédié SANS JWT)**

Dans `apps/web/services/posts.service.ts`, ajouter en haut l'import :

```typescript
import { buildApiUrl } from '@/lib/config';
```

et, à la fin du fichier (hors de l'objet `postsService`), la fonction :

```typescript
/**
 * Ping de vue anonyme (fire-and-forget). N'attache PAS de JWT (parcours anonyme) :
 * seul `x-session-token` part comme clé de dédup opaque. Le gateway no-op si un
 * JWT est présent ou si le post n'est pas public. buildApiUrl préfixe /api/v1.
 */
export async function recordAnonymousView(postId: string, sessionKey: string): Promise<void> {
  try {
    await fetch(buildApiUrl(`/posts/${postId}/anonymous-view`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionKey },
    });
  } catch {
    // fire-and-forget : ne jamais bloquer le rendu
  }
}
```

- [ ] **Step 2: Tirer le ping au montage de la page post, uniquement si NON authentifié**

Dans `apps/web/app/feeds/post/[postId]/page.tsx` :

Ajouter aux imports :
```typescript
import { getOrCreateWebSessionKey } from '@/lib/anonymous-session';
import { recordAnonymousView } from '@/services/posts.service';
```

Dans le composant `PostDetailPage`, récupérer l'état d'auth depuis le store déjà importé (`useAuthStore`) et ajouter un effet :
```typescript
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) return;            // inscrit → compté via engagement, pas ici
    if (!postId) return;
    recordAnonymousView(postId, getOrCreateWebSessionKey());
  }, [postId, isAuthenticated]);
```

> Vérifier le sélecteur du store : si `useAuthStore` n'expose pas `isAuthenticated`, utiliser `const isAuthenticated = useAuthStore((s) => s.user != null);` (le but est : ne PAS tirer le ping pour un utilisateur connecté). `useEffect` est déjà importé (ligne 3 du fichier).

- [ ] **Step 3: Vérifier le build/lint web**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: aucune erreur dans `posts.service.ts` ni `feeds/post/[postId]/page.tsx`.

- [ ] **Step 4: Vérification manuelle**

Naviguer sur `/reel/<PID>` (ou `/feeds/post/<PID>`) en navigation privée (déconnecté). Vérifier dans l'onglet Réseau un `POST /api/v1/posts/<PID>/anonymous-view` avec le header `x-session-token` et **sans** `Authorization`, réponse `{ counted: true }` au 1ᵉʳ chargement, `{ counted: false }` au rechargement (même session). Connecté → aucun ping.

- [ ] **Step 5: Commit**

```bash
git add apps/web/services/posts.service.ts "apps/web/app/feeds/post/[postId]/page.tsx"
git commit -m "feat(web): ping de vue anonyme au montage des pages post"
```

---

## Task 6 (OPTIONNEL — surface marginale) : ping anonyme iOS

> **À implémenter seulement si le parcours existe réellement.** Un utilisateur iOS **anonyme** (Participant ayant rejoint une conversation) atteint rarement le feed reels — celui-ci suppose en général un compte inscrit. Le gateway no-op déjà pour les inscrits, donc l'absence de ce ping ne casse rien. YAGNI : ne pas implémenter sans cas d'usage confirmé.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift` (au site `EngagementTracker.shared.begin(... surface: .reels)`, ≈ ligne 116)

- [ ] **Step 1: Tirer le ping seulement pour un utilisateur anonyme, à l'ouverture du reel**

À côté de l'appel `EngagementTracker.shared.begin(postId: newId, contentType: .reel, surface: .reels)` :

```swift
if AuthManager.shared.currentUser?.isAnonymous == true {
    Task {
        struct AnonViewBody: Encodable {}
        struct AnonViewAck: Decodable {}
        let _: APIResponse<AnonViewAck>? = try? await APIClient.shared.post(
            endpoint: "/posts/\(newId)/anonymous-view",
            body: AnonViewBody()
        )
    }
}
```

> L'`APIClient` attache automatiquement `X-Session-Token` pour un utilisateur anonyme (et aucun `Authorization`) → le gateway lit la clé et compte. Pour un inscrit, la condition est fausse → aucun appel (et le gateway no-op de toute façon). `APIResponse`/`APIClient.post(endpoint:body:)` existent déjà (cf. `TrackedLinkService.recordClick`).

- [ ] **Step 2: Build iOS**

Run: `./apps/ios/meeshy.sh build` (⚠️ fermer Xcode.app d'abord — sinon deadlock IDEContainer, cf. lessons). Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift"
git commit -m "feat(ios): ping de vue anonyme reels pour utilisateurs anonymes"
```

---

## Notes de clôture

- **Backlog** : à la fin, cocher D1 dans `tasks/reels-engagement-followups.md` et pointer ce plan + la spec.
- **Sécurité** : la section « Sécurité du compteur » de la spec liste les failles assumées en v1 (identité non vérifiée, spoofing du header, rate-limit IP grossier, signal mixte, pas de TTL). Chemin de durcissement = compte invité réel (`User` anonyme) ou `sessionKey` signée côté serveur.
- **Hors scope** : capture web pour viewers inscrits (engagement iOS-only), vue « qualifiée » anonyme, listing seen-by anonyme.
