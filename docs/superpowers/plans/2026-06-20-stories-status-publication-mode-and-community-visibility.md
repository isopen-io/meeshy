# Stories/Status — modes de publication + visibilité COMMUNITY (Incrément 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la visibilité `COMMUNITY` fonctionnelle de bout en bout côté gateway, exposer le choix du mode de publication dans le header du composer story (verre adaptatif iOS 26), et aligner le composer status sur une enum partagée.

**Architecture:** Un helper gateway unique (`posts/communityVisibility.ts`) résout les co-membres de communauté ; il est branché dans les 5 points d'application de visibilité + le fix ACL `getCommunityFeed`. Côté iOS, une enum `PostVisibility` dans MeeshyUI (atteignable par les deux composers) pilote un menu header (story) et le picker horizontal (status).

**Tech Stack:** Gateway = Fastify + Prisma/MongoDB, tests Jest + ts-jest (mocks `jest.fn()` manuels). iOS = SwiftUI, SDK MeeshySDK/MeeshyUI, tests XCTest.

## Global Constraints

- Surfacing gateway = source de vérité, bénéficie iOS **et** web. Défaut de publication **PUBLIC inchangé**.
- `COMMUNITY` = visible par tout membre **actif** (`isActive: true`) d'une communauté commune à l'auteur. `Post.communityId` reste `null` pour ce mode.
- Modes exposés dans les composers (incrément 1) : **PUBLIC, COMMUNITY, FRIENDS, PRIVATE**. `EXCEPT`/`ONLY` restent définis dans l'enum mais **masqués** des composers (picker d'utilisateurs = incrément 2).
- Libellé `FRIENDS` harmonisé sur **« Contacts »** partout.
- Pas de boolean+timestamp redondant ; helpers dégradent en `[]`/`false` sur erreur (comme les helpers amis voisins).
- iOS : `Bundle.module` est MainActor-isolé sous MeeshyUI `defaultIsolation(MainActor)` → labels via `String(localized:defaultValue:)` **sans** `bundle:`, membres purs `nonisolated` ; tests XCTest **non** `@MainActor`.
- Worktree partagé avec un agent parallèle : commits **sélectifs avec pathspec explicite** (jamais `git add -A`, jamais `--amend`).
- Commandes : tests gateway `npx jest --config=jest.config.json <path>` (depuis `services/gateway/`) ; type-check gateway `npm run type-check` (depuis `services/gateway/`) ; build iOS `./apps/ios/meeshy.sh build` (depuis la racine).
- Messages de commit en français conventionnel, **sans** trailer Co-Authored-By.

---

### Task 1: Helper co-membres communauté

**Files:**
- Create: `services/gateway/src/services/posts/communityVisibility.ts`
- Create: `services/gateway/src/services/posts/__tests__/communityVisibility.test.ts`
- Verify/Modify (si besoin): `services/gateway/src/__tests__/__stubs__/prisma-client.ts`

**Interfaces:**
- Produces:
  - `getCommunityCoMemberIds(prisma: PrismaClient, userId: string, cache?: CacheStore): Promise<string[]>`
  - `doUsersShareCommunity(prisma: PrismaClient, a: string, b: string): Promise<boolean>`
  - `isActiveCommunityMember(prisma: PrismaClient, userId: string, communityId: string): Promise<boolean>`

- [ ] **Step 1: Vérifier que le stub de test expose `PostVisibility.COMMUNITY`**

Run: `grep -n "COMMUNITY" services/gateway/src/__tests__/__stubs__/prisma-client.ts`
Expected: une ligne contenant `COMMUNITY`. Si **absent**, ajouter `COMMUNITY: 'COMMUNITY',` dans l'objet `PostVisibility` du stub (à côté de `PUBLIC`, `FRIENDS`, etc.).

- [ ] **Step 2: Écrire le test (qui échoue)**

Create `services/gateway/src/services/posts/__tests__/communityVisibility.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getCommunityCoMemberIds,
  doUsersShareCommunity,
  isActiveCommunityMember,
} from '../communityVisibility';

const makePrisma = () => ({
  communityMember: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
});

describe('getCommunityCoMemberIds', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('returns [] when the user belongs to no community', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([]);
    expect(await getCommunityCoMemberIds(prisma as any, 'u1')).toEqual([]);
  });

  it('returns deduplicated active co-members excluding self', async () => {
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }, { communityId: 'c2' }])
      .mockResolvedValueOnce([{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]);
    const result = await getCommunityCoMemberIds(prisma as any, 'u1');
    expect([...result].sort()).toEqual(['a', 'b']);
    expect(prisma.communityMember.findMany).toHaveBeenLastCalledWith({
      where: { communityId: { in: ['c1', 'c2'] }, userId: { not: 'u1' }, isActive: true },
      select: { userId: true },
    });
  });

  it('degrades to [] on prisma error', async () => {
    prisma.communityMember.findMany.mockRejectedValueOnce(new Error('db down'));
    expect(await getCommunityCoMemberIds(prisma as any, 'u1')).toEqual([]);
  });
});

describe('doUsersShareCommunity', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('false when a has no community', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([]);
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(false);
  });

  it('true when b is in one of a\'s communities', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'c1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(true);
  });

  it('false when b shares no community with a', async () => {
    prisma.communityMember.findMany.mockResolvedValueOnce([{ communityId: 'c1' }]);
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    expect(await doUsersShareCommunity(prisma as any, 'a', 'b')).toBe(false);
  });
});

describe('isActiveCommunityMember', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => { prisma = makePrisma(); });

  it('true when an active membership exists', async () => {
    prisma.communityMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    expect(await isActiveCommunityMember(prisma as any, 'u1', 'c1')).toBe(true);
  });

  it('false when no membership', async () => {
    prisma.communityMember.findFirst.mockResolvedValueOnce(null);
    expect(await isActiveCommunityMember(prisma as any, 'u1', 'c1')).toBe(false);
  });
});
```

- [ ] **Step 3: Lancer le test → échec attendu**

Run (depuis `services/gateway/`): `npx jest --config=jest.config.json src/services/posts/__tests__/communityVisibility.test.ts`
Expected: FAIL — `Cannot find module '../communityVisibility'`.

- [ ] **Step 4: Implémenter le helper**

Create `services/gateway/src/services/posts/communityVisibility.ts`:

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CacheStore } from '../CacheStore';

const COMMUNITY_COMEMBERS_CACHE_TTL = 300; // 5 min — miroir des listes amis/contacts

/**
 * Tous les membres actifs des communautés auxquelles `userId` appartient activement,
 * self exclu. Miroir de PostFeedService.getDirectConversationContactIds : résolution
 * d'appartenance en deux temps, cache Redis optionnel, dégradation sûre en [].
 */
export async function getCommunityCoMemberIds(
  prisma: PrismaClient,
  userId: string,
  cache?: CacheStore,
): Promise<string[]> {
  const cacheKey = `feed:comembers:${userId}`;
  if (cache) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
  }
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId, isActive: true },
      select: { communityId: true },
    });
    const communityIds = memberships.map((m) => m.communityId);
    if (communityIds.length === 0) {
      if (cache) await cache.set(cacheKey, '[]', COMMUNITY_COMEMBERS_CACHE_TTL).catch(() => undefined);
      return [];
    }
    const coMembers = await prisma.communityMember.findMany({
      where: { communityId: { in: communityIds }, userId: { not: userId }, isActive: true },
      select: { userId: true },
    });
    const result = [...new Set(coMembers.map((m) => m.userId))];
    if (cache) await cache.set(cacheKey, JSON.stringify(result), COMMUNITY_COMEMBERS_CACHE_TTL).catch(() => undefined);
    return result;
  } catch {
    return [];
  }
}

/**
 * Vrai ssi `a` et `b` partagent au moins une appartenance active à une communauté.
 * Pour le check ACL d'un post unitaire (canUserViewPost) — évite de matérialiser
 * toute la liste de co-membres.
 */
export async function doUsersShareCommunity(
  prisma: PrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  try {
    const aMemberships = await prisma.communityMember.findMany({
      where: { userId: a, isActive: true },
      select: { communityId: true },
    });
    if (aMemberships.length === 0) return false;
    const shared = await prisma.communityMember.findFirst({
      where: { userId: b, isActive: true, communityId: { in: aMemberships.map((m) => m.communityId) } },
      select: { id: true },
    });
    return shared !== null;
  } catch {
    return false;
  }
}

/**
 * Vrai ssi `userId` est membre actif de `communityId`. Utilisé par le gate ACL
 * du feed de communauté.
 */
export async function isActiveCommunityMember(
  prisma: PrismaClient,
  userId: string,
  communityId: string,
): Promise<boolean> {
  try {
    const membership = await prisma.communityMember.findFirst({
      where: { userId, communityId, isActive: true },
      select: { id: true },
    });
    return membership !== null;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/services/posts/__tests__/communityVisibility.test.ts`
Expected: PASS (tous les `it`).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/posts/communityVisibility.ts \
        services/gateway/src/services/posts/__tests__/communityVisibility.test.ts \
        services/gateway/src/__tests__/__stubs__/prisma-client.ts
git commit -m "feat(gateway): helper de résolution des co-membres de communauté"
```

---

### Task 2: COMMUNITY dans le surfacing feed (stories/status/reels)

**Files:**
- Modify: `services/gateway/src/services/PostFeedService.ts` (import en tête ; `buildVisibilityFilter` ~752 ; `getStories` ~214-221 ; `getStatuses` ~270-275 ; `getReels` ~377-384)
- Test: `services/gateway/src/__tests__/unit/services/PostFeedService.visibility.test.ts` (create)

**Interfaces:**
- Consumes: `getCommunityCoMemberIds` (Task 1).
- Produces: `buildVisibilityFilter(viewerId, friendIds, communityCoMemberIds?)` — 3e param optionnel = co-membres.

- [ ] **Step 1: Écrire le test (qui échoue)**

Create `services/gateway/src/__tests__/unit/services/PostFeedService.visibility.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    post: { findMany: jest.fn().mockResolvedValue([]) },
    postView: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    participant: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn() },
    ...overrides,
  } as any;
}

describe('PostFeedService COMMUNITY visibility', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makeMockPrisma();
    // getCommunityCoMemberIds: 1) communautés du viewer, 2) co-membres
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
  });

  it('getStories filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStories('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });

  it('getStatuses filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStatuses('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/services/PostFeedService.visibility.test.ts`
Expected: FAIL — `orClauses` ne contient pas la clause COMMUNITY (filtre actuel ne l'a pas).

- [ ] **Step 3: Ajouter l'import en tête de `PostFeedService.ts`**

Après la ligne `import type { CacheStore } from './CacheStore';` (ligne 10), ajouter :

```typescript
import { getCommunityCoMemberIds } from './posts/communityVisibility';
```

- [ ] **Step 4: Étendre `buildVisibilityFilter` (~752)**

Remplacer la méthode par :

```typescript
  private buildVisibilityFilter(viewerId: string, friendIds: string[], communityCoMemberIds: string[] = []) {
    return {
      OR: [
        { authorId: viewerId },
        { visibility: PostVisibility.PUBLIC },
        { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
        { visibility: PostVisibility.FRIENDS, authorId: { in: friendIds } },
        { visibility: PostVisibility.EXCEPT, authorId: { in: friendIds }, NOT: { visibilityUserIds: { has: viewerId } } },
        { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerId } },
      ],
    };
  }
```

- [ ] **Step 5: Résoudre les co-membres dans `getStories` (~216-221)**

Remplacer le bloc :

```typescript
    const [friendIds, dmContactIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds);
```

par :

```typescript
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);
```

- [ ] **Step 6: Idem dans `getStatuses` (~270-275)**

Remplacer le bloc :

```typescript
    const [friendIds, dmContactIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds);
```

par :

```typescript
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);
```

- [ ] **Step 7: Idem dans `getReels` (~377-384)**

Remplacer le bloc :

```typescript
    const [friendIds, dmContactIds, viewerLanguages, seed] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      this.getViewerLanguages(userId),
      seedReelId ? this.getReelSeed(seedReelId) : Promise.resolve(null),
    ]);
    const contactIds = new Set([...friendIds, ...dmContactIds]);
    const visibilityFilter = this.buildVisibilityFilter(userId, [...contactIds]);
```

par :

```typescript
    const [friendIds, dmContactIds, viewerLanguages, seed, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      this.getViewerLanguages(userId),
      seedReelId ? this.getReelSeed(seedReelId) : Promise.resolve(null),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const contactIds = new Set([...friendIds, ...dmContactIds]);
    const visibilityFilter = this.buildVisibilityFilter(userId, [...contactIds], communityCoMemberIds);
```

- [ ] **Step 8: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/services/PostFeedService.visibility.test.ts`
Expected: PASS (les deux `it`).

- [ ] **Step 9: Vérifier la non-régression du test feed existant**

Run: `npx jest --config=jest.config.json src/__tests__/unit/services/PostFeedService.test.ts`
Expected: PASS (aucune régression — `getFeed` non touché).

- [ ] **Step 10: Commit**

```bash
git add services/gateway/src/services/PostFeedService.ts \
        services/gateway/src/__tests__/unit/services/PostFeedService.visibility.test.ts
git commit -m "feat(gateway): visibilité COMMUNITY dans le surfacing stories/status/reels"
```

---

### Task 3: COMMUNITY dans `PostService.buildVisibilityFilter` (détail post)

**Files:**
- Modify: `services/gateway/src/services/PostService.ts` (import en tête ; `buildVisibilityFilter` 487-501)
- Test: `services/gateway/src/__tests__/unit/PostService.visibility.test.ts` (create)

**Interfaces:**
- Consumes: `getCommunityCoMemberIds` (Task 1).

- [ ] **Step 1: Écrire le test (qui échoue)**

Create `services/gateway/src/__tests__/unit/PostService.visibility.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostService } from '../../services/PostService';

function makeMockPrisma() {
  return {
    post: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    postBookmark: { findFirst: jest.fn().mockResolvedValue(null) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn() },
  } as any;
}

describe('PostService.getPostById COMMUNITY visibility', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makeMockPrisma();
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
  });

  it('includes a COMMUNITY clause scoped to co-members in the where filter', async () => {
    const service = new PostService(prisma);
    await service.getPostById('post-1', 'viewer-1');
    const whereArg = prisma.post.findFirst.mock.calls[0][0].where;
    expect(whereArg.OR).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/PostService.visibility.test.ts`
Expected: FAIL — `whereArg.OR` ne contient pas la clause COMMUNITY.

- [ ] **Step 3: Ajouter l'import en tête de `PostService.ts`**

Localiser l'import existant `import { ... NOT_DELETED } from './posts/postIncludes';` (ou similaire) et ajouter en dessous :

```typescript
import { getCommunityCoMemberIds } from './posts/communityVisibility';
```

- [ ] **Step 4: Étendre `buildVisibilityFilter` (487-501)**

Remplacer la méthode par :

```typescript
  private async buildVisibilityFilter(viewerUserId?: string) {
    if (!viewerUserId) {
      return { visibility: PostVisibility.PUBLIC };
    }
    const [friendIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIdsForViewer(viewerUserId),
      getCommunityCoMemberIds(this.prisma, viewerUserId),
    ]);
    return {
      OR: [
        { authorId: viewerUserId },
        { visibility: PostVisibility.PUBLIC },
        { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
        { visibility: PostVisibility.FRIENDS, authorId: { in: friendIds } },
        { visibility: PostVisibility.EXCEPT, authorId: { in: friendIds }, NOT: { visibilityUserIds: { has: viewerUserId } } },
        { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerUserId } },
      ],
    };
  }
```

- [ ] **Step 5: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/PostService.visibility.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/PostService.ts \
        services/gateway/src/__tests__/unit/PostService.visibility.test.ts
git commit -m "feat(gateway): visibilité COMMUNITY au détail post (getPostById)"
```

---

### Task 4: COMMUNITY dans `canUserViewPost` (ACL réactions)

**Files:**
- Modify: `services/gateway/src/services/posts/postVisibility.ts` (import + switch 32-62)
- Test: `services/gateway/src/services/posts/__tests__/postVisibility.test.ts` (extend existant)

**Interfaces:**
- Consumes: `doUsersShareCommunity` (Task 1).

- [ ] **Step 1: Ajouter les tests COMMUNITY (qui échouent)**

Append à `services/gateway/src/services/posts/__tests__/postVisibility.test.ts` (dans le `describe('canUserViewPost', ...)` existant) :

```typescript
  it('COMMUNITY: true when viewer shares a community with author', async () => {
    const prisma = {
      friendRequest: { findFirst: jest.fn() },
      communityMember: {
        findMany: jest.fn().mockResolvedValue([{ communityId: 'c1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'm1' }),
      },
    };
    const post = makePost({ visibility: PostVisibility.COMMUNITY });
    expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(true);
  });

  it('COMMUNITY: false when viewer shares no community with author', async () => {
    const prisma = {
      friendRequest: { findFirst: jest.fn() },
      communityMember: {
        findMany: jest.fn().mockResolvedValue([{ communityId: 'c1' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const post = makePost({ visibility: PostVisibility.COMMUNITY });
    expect(await canUserViewPost(prisma as any, post, 'viewer-1')).toBe(false);
  });
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx jest --config=jest.config.json src/services/posts/__tests__/postVisibility.test.ts`
Expected: FAIL — COMMUNITY tombe dans `default → false`, donc le cas « true » échoue.

- [ ] **Step 3: Ajouter l'import en tête de `postVisibility.ts`**

Sous la ligne `import { PrismaClient, PostVisibility } from '@meeshy/shared/prisma/client';` (ligne 8), ajouter :

```typescript
import { doUsersShareCommunity } from './communityVisibility';
```

- [ ] **Step 4: Ajouter le case COMMUNITY dans le switch**

Juste après le `case PostVisibility.ONLY:` (lignes 39-40), insérer :

```typescript
    case PostVisibility.COMMUNITY:
      return doUsersShareCommunity(prisma, post.authorId, userId);
```

- [ ] **Step 5: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/services/posts/__tests__/postVisibility.test.ts`
Expected: PASS (tous, y compris les anciens).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/posts/postVisibility.ts \
        services/gateway/src/services/posts/__tests__/postVisibility.test.ts
git commit -m "feat(gateway): visibilité COMMUNITY dans canUserViewPost"
```

---

### Task 5: COMMUNITY dans le broadcast temps réel (`getVisibilityFilteredRecipients`)

**Files:**
- Modify: `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` (import + méthode 134-154)
- Test: `services/gateway/src/__tests__/unit/SocialEventsHandler.test.ts` (extend existant)

**Interfaces:**
- Consumes: `getCommunityCoMemberIds` (Task 1).

- [ ] **Step 1: Ajouter un test COMMUNITY (qui échoue)**

Dans `SocialEventsHandler.test.ts`, étendre `createMockPrisma()` pour inclure `communityMember`, puis ajouter un test. D'abord, repérer `createMockPrisma()` et le remplacer par :

```typescript
function createMockPrisma() {
  return {
    friendRequest: { findMany: jest.fn() },
    communityMember: { findMany: jest.fn() },
  } as any;
}
```

Puis ajouter (dans le `describe('SocialEventsHandler', ...)`) :

```typescript
  it('broadcasts a COMMUNITY story to community co-members + author', async () => {
    mockPrisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
    const post = createMockPost();
    (post as any).visibility = 'COMMUNITY';
    await handler.broadcastStoryCreated(post as any, AUTHOR_ID);
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed('co-1'));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
  });
```

Note: si `createMockPost()`/`AUTHOR_ID` n'existent pas sous ces noms exacts dans ce fichier, réutiliser les helpers/constantes déjà définis en tête du fichier (les tests existants y broadcastent déjà des posts).

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/SocialEventsHandler.test.ts`
Expected: FAIL — COMMUNITY tombe dans `default → friendIds`, donc `co-1` n'est pas ciblé.

- [ ] **Step 3: Ajouter l'import en tête de `SocialEventsHandler.ts`**

Repérer les imports existants en tête et ajouter :

```typescript
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';
```

(Ajuster le chemin relatif si l'arbre diffère : depuis `src/socketio/handlers/`, la cible est `../../services/posts/communityVisibility`.)

- [ ] **Step 4: Brancher COMMUNITY dans `getVisibilityFilteredRecipients` (134-154)**

Remplacer la méthode par :

```typescript
  private async getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string,
    visibilityUserIds: string[] = []
  ): Promise<string[]> {
    if (visibility === 'COMMUNITY') {
      return getCommunityCoMemberIds(this.prisma, authorId);
    }

    const friendIds = await this.getFriendIds(authorId);

    switch (visibility) {
      case 'PUBLIC':
      case 'FRIENDS':
        return friendIds;
      case 'EXCEPT':
        return friendIds.filter(id => !visibilityUserIds.includes(id));
      case 'ONLY':
        return visibilityUserIds;
      case 'PRIVATE':
        return [];
      default:
        return friendIds;
    }
  }
```

- [ ] **Step 5: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/SocialEventsHandler.test.ts`
Expected: PASS (le nouveau + les anciens).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/socketio/handlers/SocialEventsHandler.ts \
        services/gateway/src/__tests__/unit/SocialEventsHandler.test.ts
git commit -m "feat(gateway): broadcast COMMUNITY vers les co-membres de communauté"
```

---

### Task 6: COMMUNITY dans le broadcast de traduction de story

**Files:**
- Modify: `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts` (import + `resolveBroadcastRecipients` 122-148)

**Interfaces:**
- Consumes: `getCommunityCoMemberIds` (Task 1).

Note: `resolveBroadcastRecipients` est privée et ce service n'a pas de test unitaire dédié (pas de harnais ZMQ léger). C'est un miroir 4-lignes de Task 5 (déjà testée). Gate = `tsc` + revue. Pas de nouveau test (limitation documentée).

- [ ] **Step 1: Ajouter l'import en tête de `StoryTextObjectTranslationService.ts`**

Repérer les imports en tête et ajouter :

```typescript
import { getCommunityCoMemberIds } from './communityVisibility';
```

(Chemin relatif : depuis `src/services/posts/`, la cible est `./communityVisibility`.)

- [ ] **Step 2: Brancher COMMUNITY dans `resolveBroadcastRecipients` (122-148)**

Juste après le bloc `if (visibility === 'ONLY') { ... return [...recipients]; }` (lignes 128-131), insérer :

```typescript
    if (visibility === 'COMMUNITY') {
      for (const id of await getCommunityCoMemberIds(this.prisma, authorId)) recipients.add(id);
      return [...recipients];
    }
```

- [ ] **Step 3: Vérifier la compilation**

Run (depuis `services/gateway/`): `npm run type-check`
Expected: 0 erreur sur les fichiers touchés (`StoryTextObjectTranslationService.ts`, et tous les fichiers des tasks précédentes).

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/posts/StoryTextObjectTranslationService.ts
git commit -m "feat(gateway): broadcast COMMUNITY des traductions de story aux co-membres"
```

---

### Task 7: Fix ACL `getCommunityFeed` (membre/non-membre)

**Files:**
- Modify: `services/gateway/src/services/PostFeedService.ts` (`getCommunityFeed` 637-645 — import déjà ajouté en Task 2)
- Test: `services/gateway/src/__tests__/unit/services/PostFeedService.communityFeed.test.ts` (create)

**Interfaces:**
- Consumes: `isActiveCommunityMember` (Task 1).

- [ ] **Step 1: Écrire le test (qui échoue)**

Create `services/gateway/src/__tests__/unit/services/PostFeedService.communityFeed.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

function makeMockPrisma() {
  return {
    post: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findFirst: jest.fn() },
  } as any;
}

describe('PostFeedService.getCommunityFeed ACL', () => {
  let prisma: any;
  beforeEach(() => { prisma = makeMockPrisma(); });

  it('a member sees PUBLIC + COMMUNITY posts', async () => {
    prisma.communityMember.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', 'viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toEqual({ in: ['PUBLIC', 'COMMUNITY'] });
  });

  it('a non-member sees only PUBLIC posts', async () => {
    prisma.communityMember.findFirst.mockResolvedValue(null);
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', 'viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toBe('PUBLIC');
  });

  it('an anonymous viewer sees only PUBLIC posts', async () => {
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', undefined);
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toBe('PUBLIC');
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/services/PostFeedService.communityFeed.test.ts`
Expected: FAIL — le non-membre voit `{ in: ['PUBLIC','COMMUNITY'] }` (hard-codé).

- [ ] **Step 3: Compléter l'import `isActiveCommunityMember`**

Modifier l'import ajouté en Task 2 (en tête de `PostFeedService.ts`) pour inclure `isActiveCommunityMember` :

```typescript
import { getCommunityCoMemberIds, isActiveCommunityMember } from './posts/communityVisibility';
```

- [ ] **Step 4: Gater la visibilité dans `getCommunityFeed` (637-645)**

Remplacer le début de la méthode :

```typescript
  async getCommunityFeed(communityId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      communityId,
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
      visibility: { in: ['PUBLIC', 'COMMUNITY'] },
    };
```

par :

```typescript
  async getCommunityFeed(communityId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const isMember = viewerUserId
      ? await isActiveCommunityMember(this.prisma, viewerUserId, communityId)
      : false;

    const where: any = {
      communityId,
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
      visibility: isMember ? { in: ['PUBLIC', 'COMMUNITY'] } : 'PUBLIC',
    };
```

- [ ] **Step 5: Lancer le test → succès attendu**

Run: `npx jest --config=jest.config.json src/__tests__/unit/services/PostFeedService.communityFeed.test.ts`
Expected: PASS (les trois `it`).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/PostFeedService.ts \
        services/gateway/src/__tests__/unit/services/PostFeedService.communityFeed.test.ts
git commit -m "fix(gateway): ACL feed communauté — non-membre limité aux posts PUBLIC"
```

---

### Task 8: Enum partagée `PostVisibility` (MeeshyUI)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`
- Test: dans le test target MeeshyUI du package SDK (chemin déterminé au Step 1)

**Interfaces:**
- Produces: `public enum PostVisibility: String, CaseIterable, Sendable, Codable` avec `.public/.community/.friends/.except/.only/.private`, `nonisolated var requiresUserSelection/icon`, `var label`, `nonisolated static var composerSelectableCases`.

- [ ] **Step 1: Localiser le test target MeeshyUI**

Run: `ls packages/MeeshySDK/Tests`
Expected: lister les dossiers de test (ex. `MeeshyUITests`, `MeeshySDKTests`). Noter le dossier qui teste des types MeeshyUI ; le test ira dedans (ci-dessous, `<UITestDir>`). Si aucun dossier ne teste MeeshyUI, placer le test dans le dossier de tests UI existant le plus proche.

- [ ] **Step 2: Écrire le test (qui échoue)**

Create `packages/MeeshySDK/Tests/<UITestDir>/PostVisibilityTests.swift`:

```swift
import XCTest
@testable import MeeshyUI

final class PostVisibilityTests: XCTestCase {
    func test_rawValues_matchBackendStrings() {
        XCTAssertEqual(PostVisibility.public.rawValue, "PUBLIC")
        XCTAssertEqual(PostVisibility.community.rawValue, "COMMUNITY")
        XCTAssertEqual(PostVisibility.friends.rawValue, "FRIENDS")
        XCTAssertEqual(PostVisibility.except.rawValue, "EXCEPT")
        XCTAssertEqual(PostVisibility.only.rawValue, "ONLY")
        XCTAssertEqual(PostVisibility.private.rawValue, "PRIVATE")
    }

    func test_requiresUserSelection_onlyExceptAndOnly() {
        XCTAssertTrue(PostVisibility.except.requiresUserSelection)
        XCTAssertTrue(PostVisibility.only.requiresUserSelection)
        XCTAssertFalse(PostVisibility.public.requiresUserSelection)
        XCTAssertFalse(PostVisibility.community.requiresUserSelection)
        XCTAssertFalse(PostVisibility.friends.requiresUserSelection)
        XCTAssertFalse(PostVisibility.private.requiresUserSelection)
    }

    func test_composerSelectableCases_excludesExceptAndOnly() {
        let cases = PostVisibility.composerSelectableCases
        XCTAssertEqual(cases, [.public, .community, .friends, .private])
        XCTAssertFalse(cases.contains(.except))
        XCTAssertFalse(cases.contains(.only))
    }

    func test_icon_nonEmptyForEveryCase() {
        for v in PostVisibility.allCases {
            XCTAssertFalse(v.icon.isEmpty)
        }
    }
}
```

- [ ] **Step 3: Implémenter l'enum**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`:

```swift
import SwiftUI

/// Mode de publication d'un post (story/status/post). Source unique côté UI ;
/// la valeur transmise au SDK est `rawValue` (String). Aligné sur le backend
/// `PostVisibility` (packages/shared/prisma/schema.prisma).
public enum PostVisibility: String, CaseIterable, Sendable, Codable {
    case `public`  = "PUBLIC"
    case community = "COMMUNITY"
    case friends   = "FRIENDS"
    case except    = "EXCEPT"
    case only      = "ONLY"
    case `private` = "PRIVATE"

    /// EXCEPT/ONLY nécessitent une sélection d'utilisateurs (picker = incrément 2).
    public nonisolated var requiresUserSelection: Bool {
        self == .except || self == .only
    }

    /// SF Symbol — sûr `nonisolated` (pas d'accès Bundle).
    public nonisolated var icon: String {
        switch self {
        case .public:    return "globe"
        case .community: return "person.3.fill"
        case .friends:   return "person.2.fill"
        case .except:    return "person.fill.xmark"
        case .only:      return "person.fill.checkmark"
        case .private:   return "lock.fill"
        }
    }

    /// Libellé localisé. `defaultValue` rend la valeur FR même sans entrée catalogue ;
    /// pas de `bundle:` (Bundle.module est MainActor-isolé sous MeeshyUI) → reste sûr.
    public nonisolated var label: String {
        switch self {
        case .public:    return String(localized: "post.visibility.public", defaultValue: "Public")
        case .community: return String(localized: "post.visibility.community", defaultValue: "Communautés")
        case .friends:   return String(localized: "post.visibility.friends", defaultValue: "Contacts")
        case .except:    return String(localized: "post.visibility.except", defaultValue: "Sauf…")
        case .only:      return String(localized: "post.visibility.only", defaultValue: "Seulement…")
        case .private:   return String(localized: "post.visibility.private", defaultValue: "Privé")
        }
    }

    /// Modes proposés dans les composers (incrément 1) — EXCEPT/ONLY masqués
    /// jusqu'au picker d'utilisateurs (incrément 2).
    public nonisolated static var composerSelectableCases: [PostVisibility] {
        [.public, .community, .friends, .private]
    }
}
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run (depuis la racine): `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:<UITestDir>/PostVisibilityTests 2>&1 | tail -20`
Expected: `** TEST SUCCEEDED **` (ou les 4 tests verts). Si le scheme/destination diffère, utiliser le scheme `MeeshySDK-Package` (cf. conventions SDK) et un simulateur disponible (`xcrun simctl list devices available`).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift \
        packages/MeeshySDK/Tests/<UITestDir>/PostVisibilityTests.swift
git commit -m "feat(ios): enum partagée PostVisibility (modes de publication) dans MeeshyUI"
```

---

### Task 9: Picker header dans le composer story

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (topBar ~694-714 ; overflow visibility submenu 805-817 à supprimer ; ajouter une vue `visibilityMenu`)

**Interfaces:**
- Consumes: `PostVisibility` (Task 8). `@State private var visibility: String` (existant, ligne 213) reste la source — le menu y écrit `mode.rawValue`.

- [ ] **Step 1: Supprimer le sous-menu visibility de l'overflow (805-817)**

Supprimer entièrement le bloc `Menu { Button { visibility = "PUBLIC" } ... } label: { Label(... "Visibilité" ..., systemImage: "eye") }` (lignes 805-817). Le reste de l'overflow (filtres, transitions, save draft, delete) est conservé.

- [ ] **Step 2: Ajouter la vue `visibilityMenu`**

Ajouter cette propriété calculée dans la struct `StoryComposerView` (à côté des autres sous-vues comme `publishButton`) :

```swift
    private var visibilityMenu: some View {
        Menu {
            ForEach(PostVisibility.composerSelectableCases, id: \.rawValue) { mode in
                Button {
                    visibility = mode.rawValue
                } label: {
                    Label(mode.label, systemImage: visibility == mode.rawValue ? "checkmark" : mode.icon)
                }
            }
        } label: {
            let current = PostVisibility(rawValue: visibility) ?? .public
            HStack(spacing: 4) {
                Image(systemName: current.icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(current.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .adaptiveGlass(in: Capsule(), tint: .white.opacity(0.18))
        }
    }
```

- [ ] **Step 3: Insérer `visibilityMenu` dans le `topBar` (694-714)**

Dans le `HStack` de droite du `topBar`, insérer `visibilityMenu` avant `publishButton` :

```swift
        HStack(spacing: 8) {
            visibilityMenu
            previewButton
            publishButton
            overflowMenu
        }
        .padding(.trailing, 16)
```

- [ ] **Step 4: Vérifier le build iOS**

Run (depuis la racine): `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (pas d'erreur de compilation ; `PostVisibility` résolu depuis le même target MeeshyUI).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(ios): picker de mode de publication dans le header du composer story"
```

---

### Task 10: Aligner le composer status sur `PostVisibility`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` (supprimer l'enum local `StatusVisibility` 5-28 ; `@State` 50 ; picker 261-297 ; publish 233-241)

**Interfaces:**
- Consumes: `PostVisibility` (Task 8, via `import MeeshyUI` déjà présent).

- [ ] **Step 1: Vérifier qu'aucun autre fichier ne référence `StatusVisibility`**

Run (depuis la racine): `grep -rn "StatusVisibility" apps/ios/Meeshy`
Expected: uniquement des occurrences dans `StatusComposerView.swift`. Si d'autres fichiers le référencent, les migrer aussi vers `PostVisibility` dans ce task.

- [ ] **Step 2: Supprimer l'enum local `StatusVisibility` (5-28)**

Supprimer entièrement le bloc `enum StatusVisibility: String, CaseIterable { ... }` (lignes 5-28).

- [ ] **Step 3: Migrer le `@State` (ligne 50)**

Remplacer :

```swift
    @State private var selectedVisibility: StatusVisibility = .public
```

par :

```swift
    @State private var selectedVisibility: PostVisibility = .public
```

- [ ] **Step 4: Migrer le picker (261-297)**

Dans `visibilityPicker`, remplacer `ForEach(StatusVisibility.allCases, id: \.rawValue)` par `ForEach(PostVisibility.composerSelectableCases, id: \.rawValue)`, et remplacer le bloc `.onAppear` final par une restauration gardée :

```swift
    .onAppear {
        if let vis = PostVisibility(rawValue: lastVisibility),
           PostVisibility.composerSelectableCases.contains(vis) {
            selectedVisibility = vis
        } else {
            selectedVisibility = .public
        }
    }
```

(Le reste du corps du `ForEach` — `vis.icon`, `vis.label`, `selectedVisibility == vis` — reste identique, l'API de `PostVisibility` est compatible.)

- [ ] **Step 5: Migrer le guard EXCEPT/ONLY au publish (233-241)**

Remplacer la ligne :

```swift
    visibilityUserIds: (selectedVisibility == .except || selectedVisibility == .only) ? selectedUserIds : nil,
```

par :

```swift
    visibilityUserIds: selectedVisibility.requiresUserSelection ? selectedUserIds : nil,
```

- [ ] **Step 6: Vérifier le build iOS**

Run (depuis la racine): `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED. Le picker status affiche désormais Public / Communautés / Contacts / Privé.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift
git commit -m "feat(ios): composer status sur PostVisibility partagée + mode Communautés"
```

---

### Task 11: Vérification finale (gate)

**Files:** aucun (vérification only)

- [ ] **Step 1: Suite de tests gateway visibilité + non-régression**

Run (depuis `services/gateway/`):
```bash
npx jest --config=jest.config.json src/services/posts/__tests__/communityVisibility.test.ts \
  src/__tests__/unit/services/PostFeedService.visibility.test.ts \
  src/__tests__/unit/services/PostFeedService.communityFeed.test.ts \
  src/__tests__/unit/PostService.visibility.test.ts \
  src/services/posts/__tests__/postVisibility.test.ts \
  src/__tests__/unit/SocialEventsHandler.test.ts \
  src/__tests__/unit/services/PostFeedService.test.ts
```
Expected: tous PASS.

- [ ] **Step 2: type-check gateway**

Run (depuis `services/gateway/`): `npm run type-check`
Expected: 0 erreur sur les fichiers touchés (filtrer la sortie sur `posts/communityVisibility`, `PostFeedService`, `PostService`, `postVisibility`, `SocialEventsHandler`, `StoryTextObjectTranslationService`).

- [ ] **Step 3: build iOS**

Run (depuis la racine): `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Revue manuelle de cohérence**

Vérifier : (a) `getStories`/`getStatuses`/`getReels` passent bien `communityCoMemberIds` ; (b) aucune référence résiduelle à `StatusVisibility` ; (c) le composer story n'a plus de double picker (overflow + header).

## Self-Review (du plan vs spec)

- **Couverture spec §5** (5 points + ACL) : Task 1 (helper), Task 2 (PostFeedService feed), Task 3 (PostService détail), Task 4 (canUserViewPost), Task 5 (SocialEventsHandler), Task 6 (StoryTextObjectTranslationService), Task 7 (getCommunityFeed ACL). ✅
- **Couverture spec §6** (enum) : Task 8. **§7** (header story) : Task 9. **§8** (status) : Task 10. ✅
- **Cohérence des signatures** : `buildVisibilityFilter` (PostFeedService) 3 params, tous les appelants (getStories/getStatuses/getReels) mis à jour dans le même task (Task 2). Import `getCommunityCoMemberIds`/`isActiveCommunityMember` ajouté en Task 2/7. `PostVisibility` API (`rawValue`/`icon`/`label`/`requiresUserSelection`/`composerSelectableCases`) définie en Task 8 et consommée en 9/10 — noms identiques. ✅
- **Limitation assumée** : Task 6 (méthode privée mirror, sans test unitaire — couvert par tsc + Task 5 jumelle). Task 9 (vue SwiftUI — gate = build). ✅
- **Hors périmètre** (rappel) : picker EXCEPT/ONLY (incrément 2), composer web, catalogue de localisation (labels via defaultValue).
