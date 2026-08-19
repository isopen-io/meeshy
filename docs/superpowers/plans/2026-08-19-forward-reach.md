# Portée du sélecteur de transfert — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre atteignable, depuis le sélecteur de transfert d'iOS et du web, n'importe quelle conversation (scroll infini + recherche serveur) et n'importe quel contact de l'utilisateur, y compris sans conversation existante.

**Architecture:** Trois corrections serveur d'abord (pagination des demandes d'amis, participants dans la recherche de conversations, mode « copier ces pièces jointes »), puis la réparation de la liste d'amis sur les deux clients, puis la portée du sélecteur : un modèle de vue paginé côté iOS, un instantané paginé côté web, et une fusion de trois sources en logique pure jumelle sur les deux plateformes.

**Tech Stack:** Fastify 5 + Prisma (gateway), SwiftUI + MeeshySDK (iOS), Next.js 15 + React Query (web).

**Spec :** `docs/superpowers/specs/2026-08-19-forward-reach-and-share-media-design.md` (volets S, C, A).
**Plan jumeau :** `docs/superpowers/plans/2026-08-19-share-media-extension.md` (volet B) — dépend de la Task 5 de CE plan.

## Global Constraints

- TDD strict : test RED avant toute ligne de production, à chaque tâche.
- Commits par **chemins explicites** (`git add <fichiers> && git commit -m "…" -- <fichiers>`) — worktree partagé avec d'autres sessions ; jamais `git add -A` ; pas de backticks dans `-m` ; pas de `Co-Authored-By` ; messages en français `type(scope): sujet`.
- Un schéma de réponse Fastify **supprime en silence** tout champ non déclaré : tout test de champ ajouté à une réponse DOIT traverser `fastify.inject` (précédent : `services/gateway/src/__tests__/unit/routes/message-schema-forward-serialization.test.ts`).
- iOS : modèles/types dans `packages/MeeshySDK/` uniquement ; orchestration produit dans `apps/ios/`.
- iOS : toute chaîne visible neuve = 7 langues dans `apps/ios/Meeshy/Localizable.xcstrings` (éditer par script uniquement après avoir prouvé un dump à blanc identique, séparateurs `(",", ": ")`, clés NON triées).
- iOS : tout fichier `.swift` neuf doit être référencé au projet (`cd apps/ios && xcodegen generate`), sinon la suite est verte par omission.
- Web : ne JAMAIS invalider `queryKeys.conversations.infinite()` (pagination par offset).
- Tests gateway sous **bun** (`cd services/gateway && bun run jest <chemins>`), jamais node.
- Aucun accès à l'annuaire public (`GET /users/search`) depuis le sélecteur.

---

## File Structure

**Gateway / shared**
- `services/gateway/src/routes/users/devices.ts:35-63` — schéma de `GET /users/friend-requests` : déclarer `hasMore`, accepter `status`.
- `services/gateway/src/routes/conversations/search.ts:60-90, :286-316` — émettre `participants`.
- `packages/shared/types/api-schemas.ts:1345+` — `conversationMinimalSchema` gagne `participants`.
- `services/gateway/src/services/messaging/copyAttachments.ts` **(créé)** — copie de pièces jointes d'un message source vers un message neuf, avec contrôle de propriété.
- `services/gateway/src/services/messaging/MessageProcessor.ts:632-660` — brancher le nouveau mode.
- `services/gateway/src/routes/conversations/messages.ts:110-160` — champ `copyAttachmentsFromMessageId` au schéma d'envoi.
- `packages/shared/types/messages.ts:19-31` — même champ au Zod partagé.

**iOS**
- `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift:5-12, :35-51` — `allFriendRequests`.
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift:53-82` — `search(query:)`.
- `apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift:160-181` — bascule.
- `apps/ios/Meeshy/Features/Main/ViewModels/NewConversationViewModel.swift:153-196` — bascule.
- `apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift` **(créé)** — fusion pure des trois sources + déduplication (jumelle web).
- `apps/ios/Meeshy/Features/Main/ViewModels/ForwardPickerViewModel.swift` **(créé)** — pagination, recherche, résolution de cible.
- `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` — consomme le modèle de vue.

**Web**
- `apps/web/hooks/v2/use-friend-requests-v2.ts:55-115` — bascule.
- `apps/web/services/contacts-directory.service.ts` **(créé)** — client de `/users/me/contacts`.
- `apps/web/lib/forward-target-merge.ts` **(créé)** — fusion pure (jumelle iOS).
- `apps/web/components/conversations/forward-message-modal.tsx` — instantané paginé, sentinelle, recherche.

---

## Task 1 : `GET /users/friend-requests` dit s'il reste des pages et sait filtrer par statut

**Files:**
- Modify: `services/gateway/src/routes/users/devices.ts:28-34` (querystring), `:53-63` (schéma pagination), `:76-86` (whereClause)
- Test: `services/gateway/src/__tests__/unit/routes/users/friend-requests-pagination.test.ts` (créé)

**Interfaces:**
- Produces: `GET /api/v1/users/friend-requests?offset&limit&status=accepted` → `{ success, data: FriendRequest[], pagination: { total, offset, limit, hasMore } }`. `status` optionnel, valeurs `pending|accepted|rejected` ; absent = tous statuts (comportement actuel).

- [ ] **Step 1 : Rendre le schéma de pagination testable (préalable au RED)**

Le bloc `pagination` du schéma de réponse est aujourd'hui écrit **inline** dans la route
(`services/gateway/src/routes/users/devices.ts:53-63`) : un test ne peut donc pas l'atteindre, et
recopier le bloc dans le test ne prouverait rien (le test attesterait sa propre copie — défaut
documenté du dépôt : « un témoin qui ne peut pas tomber n'est pas un témoin »).

Extraire le bloc tel quel, **sans le corriger** — le RED du Step 2 doit d'abord échouer. En tête de
`devices.ts`, après les imports :

```ts
/**
 * Bloc `pagination` de la réponse de `GET /users/friend-requests`.
 * Exporté pour qu'un test puisse traverser la sérialisation réelle :
 * fast-json-stringify supprime tout champ non déclaré ici.
 */
export const friendRequestsPaginationSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    offset: { type: 'number' },
    limit: { type: 'number' },
    returned: { type: 'number' }
  }
} as const;
```
et remplacer le bloc inline (`:53-63`) par `pagination: friendRequestsPaginationSchema`.

- [ ] **Step 2 : Écrire le test RED (il consomme le VRAI schéma)**

```ts
/**
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { buildPaginationMeta } from '../../../../utils/pagination';
import { friendRequestsPaginationSchema } from '../../../../routes/users/devices';

// Le schéma déclarait `returned` (jamais émis) au lieu de `hasMore` (seul
// champ réellement produit par buildPaginationMeta) : fast-json-stringify
// supprimait donc la seule information permettant de paginer. Ce test monte le
// VRAI schéma de la route et traverse la sérialisation.
describe('GET /users/friend-requests — sérialisation de la pagination', () => {
  it('conserve hasMore à travers le schéma de réponse', async () => {
    const app = Fastify();
    app.get('/users/friend-requests', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
              pagination: friendRequestsPaginationSchema
            }
          }
        }
      }
    }, async () => ({
      success: true,
      data: [{ id: 'fr-1' }],
      pagination: buildPaginationMeta(120, 0, 20, 20)
    }));

    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    const body = JSON.parse(res.body);

    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.total).toBe(120);
    await app.close();
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `cd services/gateway && bun run jest src/__tests__/unit/routes/users/friend-requests-pagination.test.ts`
Expected: FAIL — `body.pagination.hasMore` vaut `undefined` (le champ est supprimé par le schéma, qui ne déclare que `returned`).

- [ ] **Step 4 : Corriger le schéma et ajouter le filtre de statut**

Dans `friendRequestsPaginationSchema`, remplacer `returned: { type: 'number' }` par
`hasMore: { type: 'boolean' }`.

Puis, dans la même route, querystring (`:28-34`) :

```ts
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' },
          // Le budget `limit` est PARTAGÉ par les deux sens et tous les statuts.
          // Sans ce filtre, une liste d'amis se fait évincer par des demandes
          // en attente ou refusées (spec 2026-08-19, S.2).
          status: { type: 'string', enum: ['pending', 'accepted', 'rejected'], description: 'Filtre de statut' }
        }
      },
```

Handler : lire `status` et l'appliquer au `whereClause` (`:76-86`) :

```ts
      const { offset = '0', limit = '20', status } = request.query as { offset?: string; limit?: string; status?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const whereClause = {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ],
        ...(status ? { status } : {})
      };
```

- [ ] **Step 5 : Vérifier le vert et la non-régression**

Run: `cd services/gateway && bun run jest src/__tests__/unit/routes/users/friend-requests-pagination.test.ts src/__tests__/unit/routes/users-devices.test.ts src/__tests__/unit/routes/users/devices-extra.test.ts src/__tests__/unit/routes/users/devices-extended.test.ts`
Expected: toutes vertes. Puis `cd services/gateway && npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add services/gateway/src/routes/users/devices.ts services/gateway/src/__tests__/unit/routes/users/friend-requests-pagination.test.ts
git commit -m "fix(gateway): les demandes d'amis disent enfin s'il reste des pages, et savent filtrer par statut" -- services/gateway/src/routes/users/devices.ts services/gateway/src/__tests__/unit/routes/users/friend-requests-pagination.test.ts
```

---

## Task 2 : iOS — la liste d'amis contient les relations acceptées dans les deux sens

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift:5-12` (protocole), `:43-51` (après `sentRequests`)
- Modify: `apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift:160-181`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/FriendServiceTests.swift` (étendre ; créer s'il n'existe pas)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ContactsListViewModelTests.swift` (étendre)

**Interfaces:**
- Consumes: Task 1 (`?status=accepted`, `pagination.hasMore`).
- Produces:

```swift
func allFriendRequests(status: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
```
ajouté à `FriendServiceProviding` ; implémentation appelant `/users/friend-requests`.

- [ ] **Step 1 : Test RED du service SDK**

```swift
func test_allFriendRequests_callsUsersEndpoint_withStatusFilter() async throws {
    let mock = MockAPIClient()
    mock.stubResponse(
        endpoint: "/users/friend-requests",
        data: OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [], pagination: OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0), error: nil
        )
    )
    let service = FriendService(api: mock)

    _ = try await service.allFriendRequests(status: "accepted", offset: 0, limit: 100)

    XCTAssertEqual(mock.lastEndpoint, "/users/friend-requests",
                   "les deux sens ne sont rendus que par /users/friend-requests — /friend-requests/received filtre pending en dur")
}
```
(Adapter au double d'API réellement disponible dans `Tests/MeeshySDKTests/Mocks/` : reprendre le motif d'un test voisin de `Services/`.)

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/FriendServiceTests -quiet`
Expected: erreur de compilation (`allFriendRequests` n'existe pas) — RED de compile accepté pour une méthode neuve.

- [ ] **Step 3 : Implémenter dans le SDK**

Protocole (`FriendService.swift:5-12`), après `sentRequests` :

```swift
    /// Les DEUX sens et tous les statuts (ou un seul via `status`).
    /// `/friend-requests/received` filtre `pending` en dur côté serveur : une
    /// relation acceptée dont l'utilisateur est le RECEVEUR n'y apparaît jamais.
    func allFriendRequests(status: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
```

Implémentation, après `sentRequests` (`:51`) :

```swift
    public func allFriendRequests(status: String? = "accepted", offset: Int = 0, limit: Int = 100) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        var queryItems = [
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let status, !status.isEmpty {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        return try await api.request(
            endpoint: "/users/friend-requests",
            method: "GET",
            body: nil,
            queryItems: queryItems
        )
    }
```

> ⚠️ **Ne PAS concaténer `?status=…` dans la chaîne d'endpoint passée à `offsetPaginatedRequest`.**
> `APIClient` fait `components.queryItems = queryItems` — une AFFECTATION, qui **écrase** toute query
> déjà présente dans l'endpoint — et `offsetPaginatedRequest` fournit toujours `[limit, offset]`. Le
> filtre partirait donc à la poubelle **en production**, pendant que `MockAPIClient`, qui n'exerce pas
> ce chemin, laisserait le test au vert. (Défaut du premier jet de ce plan, rattrapé à l'exécution.)

- [ ] **Step 4 : Test RED du ViewModel**

```swift
func test_loadFriends_includesAcceptedRequestsWhereUserIsReceiver() async {
    let (sut, friendService) = makeSUT(currentUserId: "me")
    friendService.allFriendRequestsResult = .success(pageOf([
        makeRequest(id: "r1", senderId: "other", receiverId: "me", status: "accepted")
    ]))

    await sut.loadFriends(forceNetwork: true)

    XCTAssertEqual(sut.friends.map(\.id), ["other"],
                   "une relation acceptée où je suis le receveur DOIT apparaître dans mes contacts")
}
```
Étendre `MockFriendService` d'un `allFriendRequestsResult` + compteur, sur le motif de ses stubs existants.

- [ ] **Step 5 : Basculer le ViewModel**

`ContactsListViewModel.fetchFriendsFromNetwork` (`:160-181`) : remplacer les deux appels par une pagination jusqu'à épuisement.

```swift
    private func fetchFriendsFromNetwork(cacheKey: String) async {
        do {
            var collected: [FriendRequest] = []
            var offset = 0
            let pageSize = 100
            while true {
                let page = try await friendService.allFriendRequests(status: "accepted", offset: offset, limit: pageSize)
                collected.append(contentsOf: page.data)
                // `hasMore` peut manquer sur un gateway antérieur à la Task 1 :
                // le repli sur la taille de page garde le comportement correct.
                let more = page.pagination?.hasMore ?? (page.data.count == pageSize)
                if !more || page.data.isEmpty { break }
                offset += pageSize
            }

            friends = FriendListAggregator.aggregate(
                received: collected,
                sent: [],
                currentUserId: currentUserId
            )

            loadState = .loaded
            lastObservedFriendIds = Set(friends.map(\.id))
            try? await CacheCoordinator.shared.friends.save(friends, for: cacheKey)
        } catch {
            if friends.isEmpty {
                loadState = .error("Erreur lors du chargement")
            }
        }
    }
```
`FriendListAggregator.aggregate` déduplique déjà et ne garde que les `accepted` (`ContactsShared.swift:160-197`) : passer toute la collecte en `received` et un tableau vide en `sent` est correct — vérifier en lisant la fonction que `currentUserId` sert bien à choisir « l'autre » dans chaque paire, quel que soit le sens.

- [ ] **Step 6 : Vérifier le vert**

Run (SDK) : `-only-testing:MeeshySDKTests/FriendServiceTests`
Run (app) : `build-for-testing` puis `test-without-building -only-testing:MeeshyTests/ContactsListViewModelTests`

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/FriendServiceTests.swift apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ContactsListViewModelTests.swift apps/ios/MeeshyTests/Mocks/MockFriendService.swift
git commit -m "fix(ios,sdk): une relation acceptée dont je suis le receveur entre enfin dans mes contacts" -- packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/FriendServiceTests.swift apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ContactsListViewModelTests.swift apps/ios/MeeshyTests/Mocks/MockFriendService.swift
```

---

## Task 3 : Web — même réparation

**Files:**
- Modify: `apps/web/hooks/v2/use-friend-requests-v2.ts:55-115`
- Test: `apps/web/__tests__/hooks/v2/use-friend-requests-v2.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `connected` calculé depuis `/users/friend-requests?status=accepted` ; `received`/`sent` inchangés (les écrans de demandes veulent les `pending`).

- [ ] **Step 1 : Test RED**

```tsx
it('inclut une relation acceptée où l’utilisateur est le receveur', async () => {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/users/friend-requests') {
      return Promise.resolve({ success: true, data: [
        { id: 'r1', senderId: 'other', receiverId: 'me', status: 'accepted',
          sender: { id: 'other', username: 'other' }, receiver: { id: 'me', username: 'me' } }
      ], pagination: { total: 1, offset: 0, limit: 100, hasMore: false } });
    }
    return Promise.resolve({ success: true, data: [], pagination: { total: 0 } });
  });

  const { result } = renderHook(() => useFriendRequestsV2(), { wrapper });

  await waitFor(() => expect(result.current.connected).toHaveLength(1));
  expect(result.current.connected[0].id).toBe('r1');
});
```
(Reprendre le harnais exact du fichier : `wrapper` React Query, mock d'`apiService`.)

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd apps/web && npx jest __tests__/hooks/v2/use-friend-requests-v2.test.tsx --maxWorkers=50%`
Expected: FAIL — `connected` est vide (le hook n'interroge que `/friend-requests/received|sent`).

- [ ] **Step 3 : Implémenter**

Ajouter une troisième requête et faire dériver `connected` d'elle seule :

```tsx
  const acceptedQueryKey = [...queryKeys.friendRequests.all, 'accepted'] as const;

  const { data: acceptedData } = useQuery({
    queryKey: acceptedQueryKey,
    queryFn: async () => {
      const response = await apiService.get<{
        success: boolean;
        data: FriendRequest[];
        pagination: { total: number; hasMore?: boolean };
      }>('/users/friend-requests', { offset: '0', limit: '100', status: 'accepted' });
      return extractRequests(response);
    },
    enabled,
  });
```
puis, dans le `useMemo` de classement, alimenter `connectedArr` depuis `acceptedData ?? []` au lieu de `allRequests`, en laissant `pendingArr`/`refusedArr` sur `allRequests`.

- [ ] **Step 4 : Vérifier le vert**

Run: `cd apps/web && npx jest __tests__/hooks/v2/use-friend-requests-v2.test.tsx __tests__/hooks/v2/use-contacts-v2.test.tsx --maxWorkers=50%`

- [ ] **Step 5 : Commit**

```bash
git add apps/web/hooks/v2/use-friend-requests-v2.ts apps/web/__tests__/hooks/v2/use-friend-requests-v2.test.tsx
git commit -m "fix(web): les relations acceptées dans les deux sens entrent dans les contacts" -- apps/web/hooks/v2/use-friend-requests-v2.ts apps/web/__tests__/hooks/v2/use-friend-requests-v2.test.tsx
```

---

## Task 4 : `GET /conversations/search` émet ses participants

**Files:**
- Modify: `packages/shared/types/api-schemas.ts:1345-1400` (`conversationMinimalSchema`)
- Modify: `services/gateway/src/routes/conversations/search.ts:286-316` (mapping)
- Test: `services/gateway/src/__tests__/unit/routes/conversation-search-participants.test.ts` (créé)

**Interfaces:**
- Produces: chaque élément de `GET /conversations/search` porte
  `participants: [{ id, userId, displayName, user: { id, username, displayName } }]` (au plus 5, déjà chargés par le `include` `search.ts:142-157`).

> ⚠️ La spec affirmait que `conversationMinimalSchema` autorisait déjà `participants` : **c'est faux**, le schéma s'arrête à `bridge` sans jamais déclarer `participants`. Il faut donc l'ajouter, sans quoi fast-json-stringify le supprimera.

- [ ] **Step 1 : Test RED (traverse la sérialisation)**

```ts
/**
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { conversationMinimalSchema } from '@meeshy/shared/types/api-schemas';

describe('conversationMinimalSchema — participants', () => {
  it('laisse passer les participants d’une conversation directe', async () => {
    const app = Fastify();
    app.get('/conversations/search', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: conversationMinimalSchema }
            }
          }
        }
      }
    }, async () => ({
      success: true,
      data: [{
        id: 'c1', identifier: 'mshy_direct-a-b', title: null, type: 'direct',
        memberCount: 2,
        participants: [
          { id: 'p1', userId: 'u1', displayName: 'Alice', user: { id: 'u1', username: 'alice', displayName: 'Alice' } },
          { id: 'p2', userId: 'me', displayName: 'Moi', user: { id: 'me', username: 'me', displayName: 'Moi' } }
        ]
      }]
    }));

    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=ali' });
    const body = JSON.parse(res.body);

    expect(body.data[0].participants).toHaveLength(2);
    expect(body.data[0].participants[0].userId).toBe('u1');
    await app.close();
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd services/gateway && bun run jest src/__tests__/unit/routes/conversation-search-participants.test.ts`
Expected: FAIL — `participants` absent du corps sérialisé (non déclaré au schéma).

- [ ] **Step 3 : Déclarer `participants` au schéma**

Dans `packages/shared/types/api-schemas.ts`, à l'intérieur de `conversationMinimalSchema.properties`, après `memberCount` :

```ts
    // Sans cette déclaration, fast-json-stringify supprime les participants :
    // une conversation DIRECTE trouvée par la recherche arrive alors sans
    // titre (forcé à null pour les directs) ET sans personne, donc illisible
    // et non déduplicable côté client (spec 2026-08-19, S.1).
    participants: {
      type: 'array',
      description: 'Participants actifs (au plus 5) — nécessaire pour nommer une conversation directe',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string', nullable: true },
          displayName: { type: 'string', nullable: true },
          user: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              username: { type: 'string', nullable: true },
              displayName: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
```

- [ ] **Step 4 : Émettre les participants dans le mapping**

Dans `services/gateway/src/routes/conversations/search.ts`, objet retourné (`:286-316`), après `memberCount` :

```ts
          participants: (conversation.participants ?? []).map((p: any) => ({
            id: p.id,
            userId: p.userId,
            displayName: p.displayName,
            user: p.user ? { id: p.user.id, username: p.user.username, displayName: p.user.displayName } : null,
          })),
```

- [ ] **Step 5 : Vérifier le vert**

Run: `cd services/gateway && bun run jest src/__tests__/unit/routes/conversation-search-participants.test.ts src/__tests__/unit/routes/conversations-search.test.ts` (si cette seconde suite existe ; sinon ne lancer que la première), puis `npx tsc --noEmit`.

- [ ] **Step 6 : Commit**

```bash
git add packages/shared/types/api-schemas.ts services/gateway/src/routes/conversations/search.ts services/gateway/src/__tests__/unit/routes/conversation-search-participants.test.ts
git commit -m "fix(gateway,shared): la recherche de conversations nomme enfin ses interlocuteurs" -- packages/shared/types/api-schemas.ts services/gateway/src/routes/conversations/search.ts services/gateway/src/__tests__/unit/routes/conversation-search-participants.test.ts
```

---

## Task 5 : Mode « copier ces pièces jointes » (sans badge de transfert)

**Files:**
- Create: `services/gateway/src/services/messaging/copyAttachments.ts`
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts:632-660` (`handleAttachments`)
- Modify: `services/gateway/src/routes/conversations/messages.ts:110-160` (schéma body)
- Modify: `packages/shared/types/messages.ts:19-31` (Zod partagé)
- Test: `services/gateway/src/services/messaging/__tests__/copyAttachments.test.ts` (créé)

**Interfaces:**
- Produces (consommé par le plan `2026-08-19-share-media-extension.md`) : champ d'envoi
  `copyAttachmentsFromMessageId?: string`. Sémantique : crée de **nouvelles** lignes
  `MessageAttachment` pointant les **mêmes fichiers** (`filePath`/`fileUrl` identiques, aucun octet
  ré-envoyé) et rattachées au message créé.
  Refus si l'appelant n'est pas l'auteur du message source. Un échec de copie fait échouer l'envoi.

> **Invariant produit (exigence user, 2026-08-19) : aucun destinataire ne doit voir la moindre
> marque de transfert.** Le message créé n'a **pas** de `forwardedFromId` (donc pas de badge
> « Transféré depuis … »), et ses pièces jointes n'ont **ni** `forwardedFromAttachmentId` **ni**
> `isForwarded: true`. Diffuser à plusieurs destinataires n'est pas transférer : chacun reçoit un
> message de plein droit. C'est la raison d'être de ce module — réutiliser `forwardedFromId` aurait
> révélé aux uns le nom de la conversation des autres.
>
> Ne pas réutiliser les `attachmentIds` de la source non plus : `associateAttachmentsToMessage`
> (`AttachmentService.ts:161-173`) est un `updateMany` qui **déplace** la pièce jointe — le premier
> destinataire la perdrait.

```ts
export async function copyAttachmentsFromMessage(
  prisma: PrismaLike,
  params: { sourceMessageId: string; targetMessageId: string; requesterParticipantId: string }
): Promise<{ copied: number }>;
```

- [ ] **Step 1 : Tests RED**

```ts
/**
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { copyAttachmentsFromMessage } from '../copyAttachments';

function makePrisma(overrides: any = {}) {
  return {
    message: { findUnique: jest.fn().mockResolvedValue({ id: 'src', senderId: 'me' }) },
    messageAttachment: {
      findMany: jest.fn().mockResolvedValue([{ id: 'a1', mimeType: 'image/jpeg', filePath: '/p/1', fileUrl: 'u/1', fileName: 'f', originalName: 'f', fileSize: 10 }]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'copy-1', ...data })),
    },
    ...overrides,
  } as any;
}

describe('copyAttachmentsFromMessage', () => {
  it('copie les pièces jointes en réutilisant les mêmes octets', async () => {
    const prisma = makePrisma();
    const res = await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    });
    expect(res.copied).toBe(1);
    const written = prisma.messageAttachment.create.mock.calls[0][0].data;
    expect(written.messageId).toBe('dst');
    expect(written.filePath).toBe('/p/1');
    expect(written.forwardedFromAttachmentId ?? null).toBeNull();
  });

  // Exigence user : les destinataires d'une diffusion ne voient AUCUNE marque
  // de transfert — ni sur le message, ni sur ses pièces jointes.
  it('ne laisse aucune marque de transfert sur les pièces jointes copiées', async () => {
    const prisma = makePrisma();
    await copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    });
    const written = prisma.messageAttachment.create.mock.calls[0][0].data;
    expect(written.forwardedFromAttachmentId ?? null).toBeNull();
    expect(written.isForwarded ?? false).toBe(false);
    // Mêmes octets, jamais un ré-envoi : le fichier est partagé, pas dupliqué.
    expect(written.fileUrl).toBe('u/1');
  });

  it('refuse quand l’appelant n’est pas l’auteur du message source', async () => {
    const prisma = makePrisma({ message: { findUnique: jest.fn().mockResolvedValue({ id: 'src', senderId: 'someone-else' }) } });
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    })).rejects.toThrow(/not-owner/);
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
  });

  it('remonte l’échec au lieu de laisser une bulle vide', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.create.mockRejectedValueOnce(new Error('db down'));
    await expect(copyAttachmentsFromMessage(prisma, {
      sourceMessageId: 'src', targetMessageId: 'dst', requesterParticipantId: 'me',
    })).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `cd services/gateway && bun run jest src/services/messaging/__tests__/copyAttachments.test.ts`
Expected: FAIL — module inexistant.

- [ ] **Step 3 : Implémenter le module**

`services/gateway/src/services/messaging/copyAttachments.ts` : reprendre le **corps** de
`MessageProcessor.copyForwardedAttachments` (`:673-749`) — mêmes champs recopiés (`filePath`,
`fileUrl`, `thumbHash`, `imageVariants`, `transcription`, `translations`, et TOUS les champs de
chiffrement) — avec trois différences :
1. contrôle de propriété avant toute lecture d'attachment (`message.findUnique` → `senderId !== requesterParticipantId` ⇒ `throw new Error('copy-attachments:not-owner')`) ;
2. **ne pas** écrire `forwardedFromAttachmentId` ni `isForwarded` (c'est une diffusion, pas un transfert) ;
3. **pas de `catch` silencieux** : toute erreur remonte (contrairement à `MessageProcessor.ts:767-769`).

- [ ] **Step 4 : Vérifier le vert du module**

Run: `cd services/gateway && bun run jest src/services/messaging/__tests__/copyAttachments.test.ts`

- [ ] **Step 5 : Brancher le champ d'envoi**

`packages/shared/types/messages.ts` (`SendMessageRequestSchema`) : ajouter
`copyAttachmentsFromMessageId: z.string().optional(),`.
`services/gateway/src/routes/conversations/messages.ts` (schéma body, à côté de `forwardedFromId` `:116`) :
`copyAttachmentsFromMessageId: z.string().optional(),` et l'ajouter au `refine` de non-vacuité
(`:150-157`) — un envoi qui ne porte que ce champ est légitime, comme un transfert.
`MessageProcessor.handleAttachments` (`:632-660`) : nouvelle branche, **avant** celle de
`forwardedFromId`, appelant `copyAttachmentsFromMessage` et laissant l'erreur remonter.

- [ ] **Step 6 : Test de câblage RED→GREEN**

Ajouter à `services/gateway/src/__tests__/unit/services/MessagingService.test.ts`, dans le describe du transfert :

```ts
      it('copie les pièces jointes SANS marquer le message comme transféré', async () => {
        const response = await service.handleMessage(
          { ...validRequest, content: '', copyAttachmentsFromMessageId: '507f1f77bcf86cd799439099' },
          testParticipantId
        );
        expect(response.success).toBe(true);
        const written = mockPrisma.message.create.mock.calls[0][0].data;
        expect(written.forwardedFromId ?? null).toBeNull();
      });
```
Run: `cd services/gateway && bun run jest src/__tests__/unit/services/MessagingService.test.ts src/__tests__/unit/routes/messages-routes.test.ts`

- [ ] **Step 7 : Gate complet + commit**

Run: `cd services/gateway && bun run test:coverage 2>&1 | tail -12` puis `npx tsc --noEmit`.

```bash
git add services/gateway/src/services/messaging/copyAttachments.ts services/gateway/src/services/messaging/__tests__/copyAttachments.test.ts services/gateway/src/services/messaging/MessageProcessor.ts services/gateway/src/routes/conversations/messages.ts packages/shared/types/messages.ts services/gateway/src/__tests__/unit/services/MessagingService.test.ts
git commit -m "feat(gateway,shared): diffuser un média à plusieurs sans le faire passer pour un transfert" -- services/gateway/src/services/messaging/copyAttachments.ts services/gateway/src/services/messaging/__tests__/copyAttachments.test.ts services/gateway/src/services/messaging/MessageProcessor.ts services/gateway/src/routes/conversations/messages.ts packages/shared/types/messages.ts services/gateway/src/__tests__/unit/services/MessagingService.test.ts
```

---

## Task 6 : iOS — fusion pure des trois sources (jumelle web)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/ForwardTargetMergeTests.swift` (créé)

**Interfaces:**
- Produces:

```swift
enum ForwardTargetKind: Equatable { case conversation, contact }

struct ForwardTarget: Identifiable, Equatable {
    let id: String              // "conv:<id>" ou "user:<id>" — clé d'état stable
    let kind: ForwardTargetKind
    let conversationId: String? // nil pour un contact sans conversation
    let userId: String?         // identifiant de la personne, nil pour un groupe
    let title: String
    let subtitle: String?
    let avatarURL: String?
}

enum ForwardTargetMerge {
    /// Ordre : conversations (dans l'ordre reçu), puis contacts non absorbés.
    /// Un contact dont `userId` correspond au `userId` d'une conversation
    /// directe déjà listée est ABSORBÉ par elle — une personne n'apparaît
    /// jamais deux fois.
    /// RÈGLE JUMELLE : apps/web/lib/forward-target-merge.ts
    static func merge(conversations: [ForwardTarget], contacts: [ForwardTarget]) -> [ForwardTarget]
}
```

- [ ] **Step 1 : Tests RED**

```swift
@MainActor
final class ForwardTargetMergeTests: XCTestCase {
    private func conv(_ id: String, userId: String? = nil, title: String = "C") -> ForwardTarget {
        ForwardTarget(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }
    private func contact(_ userId: String, title: String = "P") -> ForwardTarget {
        ForwardTarget(id: "user:\(userId)", kind: .contact, conversationId: nil, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }

    func test_merge_keepsConversationsFirst() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c2")], contacts: [contact("u9")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "conv:c2", "user:u9"])
    }

    func test_merge_absorbsContactAlreadyInADirectConversation() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1", userId: "u1")], contacts: [contact("u1"), contact("u2")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "user:u2"],
                       "une personne déjà jointe par une conversation directe ne doit pas apparaître deux fois")
    }

    func test_merge_deduplicatesRepeatedConversations() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c1")], contacts: [])
        XCTAssertEqual(out.map(\.id), ["conv:c1"])
    }

    func test_merge_withoutUserId_neverAbsorbs() {
        let out = ForwardTargetMerge.merge(conversations: [conv("g1")], contacts: [contact("u1")])
        XCTAssertEqual(out.map(\.id), ["conv:g1", "user:u1"],
                       "un groupe n'absorbe personne — seule une conversation directe le peut")
    }
}
```

- [ ] **Step 2 : Vérifier l'échec** (compile error : type absent).

- [ ] **Step 3 : Implémenter**

```swift
enum ForwardTargetMerge {
    static func merge(conversations: [ForwardTarget], contacts: [ForwardTarget]) -> [ForwardTarget] {
        var seenIds = Set<String>()
        var joinedUserIds = Set<String>()
        var out: [ForwardTarget] = []

        for target in conversations where seenIds.insert(target.id).inserted {
            if let userId = target.userId { joinedUserIds.insert(userId) }
            out.append(target)
        }
        for target in contacts {
            guard seenIds.insert(target.id).inserted else { continue }
            if let userId = target.userId, joinedUserIds.contains(userId) { continue }
            out.append(target)
        }
        return out
    }
}
```

- [ ] **Step 4 : Vérifier le vert** (`-only-testing:MeeshyTests/ForwardTargetMergeTests`), puis `cd apps/ios && xcodegen generate` (deux fichiers neufs).

- [ ] **Step 5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift apps/ios/MeeshyTests/Unit/Components/ForwardTargetMergeTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): une cible de transfert, qu'elle vienne d'une conversation ou d'un contact" -- apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift apps/ios/MeeshyTests/Unit/Components/ForwardTargetMergeTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

---

## Task 7 : iOS — modèle de vue paginé et recherche

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/ForwardPickerViewModel.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift:53-82` (+ `search`)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ForwardPickerViewModelTests.swift` (créé)

**Interfaces:**
- Consumes: `ForwardTarget`/`ForwardTargetMerge` (Task 6) ; `FriendService.allFriendRequests` (Task 2) ; `ContactDirectoryService.list(offset:limit:filter:query:)` (SDK existant) ; `ConversationServiceProviding.listPage(before:limit:currentUserId:)`.
- Produces:

```swift
@MainActor
final class ForwardPickerViewModel: ObservableObject {
    @Published private(set) var targets: [ForwardTarget]
    @Published private(set) var paginationState: PaginationState
    @Published private(set) var hasMore: Bool
    @Published var searchText: String

    func loadInitial() async
    func loadMore() async
    func search(_ query: String) async
}
```
Nouvelle méthode SDK : `func search(query: String) async throws -> [APIConversation]` (`GET /conversations/search?q=`).

- [ ] **Step 1 : Tests RED (pagination)** — reprendre le harnais de `ConversationListViewModelTests` (`MockConversationService.listPageHandler`, `listPageResult`) :

```swift
func test_loadMore_passesPreviousCursor_andAppends() async {
    let (sut, service) = makeSUT()
    service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: "cur1", hasMore: true))
    await sut.loadInitial()
    service.listPageResult = .success(ConversationPage(items: [makeConv("c2")], rawItems: [], nextCursor: "cur2", hasMore: false))

    await sut.loadMore()

    XCTAssertEqual(service.lastListPageCursor, "cur1")
    XCTAssertEqual(sut.targets.map(\.id), ["conv:c1", "conv:c2"])
    XCTAssertFalse(sut.hasMore)
}

func test_loadMore_whenHasMoreFalse_doesNotFetch() async {
    let (sut, service) = makeSUT()
    service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: nil, hasMore: false))
    await sut.loadInitial()
    let before = service.listPageCallCount

    await sut.loadMore()

    XCTAssertEqual(service.listPageCallCount, before)
}

func test_loadInitial_passesRealCurrentUserId() async {
    let (sut, service) = makeSUT(currentUserId: "me")
    service.listPageResult = .success(ConversationPage(items: [], rawItems: [], nextCursor: nil, hasMore: false))
    await sut.loadInitial()
    XCTAssertEqual(service.lastListPageCurrentUserId, "me",
                   "un id vide annule participantUserId, donc la déduplication par personne")
}
```

- [ ] **Step 2 : Vérifier l'échec**, **Step 3 : implémenter le modèle de vue** en copiant la structure de `ConversationListViewModel.loadMore()` (`:1725-1834`) **garde zero-progress comprise**, sans aucun `saveCursor` (pagination en mémoire), et en projetant chaque `MeeshyConversation` en `ForwardTarget` (`userId` = `participantUserId` pour un `direct`, `nil` sinon).

- [ ] **Step 4 : Tests RED (recherche)** :

```swift
func test_search_mergesConversationsThenContacts_andDropsStaleResponses() async {
    let (sut, service) = makeSUT()
    service.searchResult = .success([makeAPIConv("c9", participantUserId: "u1")])
    friendService.allFriendRequestsResult = .success(pageOf([makeAccepted(otherId: "u1")]))
    directoryService.listResult = .success(pageOf([makeDirectoryContact(userId: "u2")]))

    await sut.search("ali")

    XCTAssertEqual(sut.targets.map(\.id), ["conv:c9", "user:u2"],
                   "u1 est absorbé par sa conversation directe ; u2 reste")
}

func test_search_belowTwoCharacters_doesNotHitTheNetwork() async {
    let (sut, service) = makeSUT()
    await sut.search("a")
    XCTAssertEqual(service.searchCallCount, 0)
}
```

- [ ] **Step 5 : implémenter la recherche** (2 caractères minimum, anti-rebond 300 ms, réponse rejetée si `query != searchText` au retour), **Step 6 : vérifier le vert**, **Step 7 : `xcodegen generate` + commit** :

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ForwardPickerViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ForwardPickerViewModelTests.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios,sdk): le sélecteur de transfert pagine et cherche au-delà de sa première page" -- apps/ios/Meeshy/Features/Main/ViewModels/ForwardPickerViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ForwardPickerViewModelTests.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

---

## Task 8 : iOS — brancher la feuille et résoudre la cible à l'envoi

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift` (résolution de cible)
- Test: `apps/ios/MeeshyTests/Unit/Services/MessageForwardServiceTests.swift` (étendre)

**Interfaces:**
- Consumes: `ForwardPickerViewModel`, `ForwardTarget`, `ConversationCreator.createDirectConversation(with:currentUserId:)`.
- Produces:

```swift
func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget) async -> ForwardOutcome
```
(surcharge ; l'ancienne signature `to targetConversationId: String` reste pour les appelants existants).

- [ ] **Step 1 : Tests RED**

```swift
func test_forward_toContactWithoutConversation_createsItOnceThenSends() async throws {
    let (sut, api, _) = makeSUT()
    creator.createResult = .success(makeConversation(id: "new-conv"))
    stubSendSuccess(api, target: "new-conv")

    let target = ForwardTarget(id: "user:u1", kind: .contact, conversationId: nil, userId: "u1",
                               title: "Alice", subtitle: nil, avatarURL: nil)
    let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)

    XCTAssertEqual(outcome, .sent)
    XCTAssertEqual(creator.createCallCount, 1)
    XCTAssertEqual(api.requestEndpoints, ["/conversations/new-conv/messages"])
}

func test_forward_toContact_whenCreationFails_doesNotSend() async {
    let (sut, api, _) = makeSUT()
    creator.createResult = .failure(APIError.serverError(403, "USER_BLOCKED"))

    let target = ForwardTarget(id: "user:u1", kind: .contact, conversationId: nil, userId: "u1",
                               title: "Alice", subtitle: nil, avatarURL: nil)
    let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)

    guard case .failed = outcome else { return XCTFail("expected .failed") }
    XCTAssertEqual(api.postCount, 0)
}
```

- [ ] **Step 2 : Vérifier l'échec**, **Step 3 : implémenter** (la surcharge résout `conversationId` — direct si présent, sinon `createDirectConversation` — puis délègue à la méthode existante ; le `clientMessageId` est donc calculé APRÈS résolution, ce que la clé de dédup `"\(message.id)→\(conversationId)"` garantit déjà).

- [ ] **Step 4 : Brancher la feuille** : `ForwardPickerSheet` prend `@StateObject var model = ForwardPickerViewModel(...)`, liste `model.targets`, pose la sentinelle de pied (`Color.clear.frame(height: 1).onAppear { Task { await model.loadMore() } }`) **gardée par `model.hasMore`, `model.paginationState == .idle` ET `model.searchText.isEmpty`**, et passe `ForwardTarget` au service. Clés localisées neuves éventuelles : 7 langues.

- [ ] **Step 5 : Vérifier le vert + vérification visuelle** (`./apps/ios/meeshy.sh run` : scroller au-delà de 50, chercher un contact sans conversation, envoyer).

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift apps/ios/MeeshyTests/Unit/Services/MessageForwardServiceTests.swift
git commit -m "feat(ios): transférer à un contact même sans conversation, sans en créer une à la sélection" -- apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift apps/ios/MeeshyTests/Unit/Services/MessageForwardServiceTests.swift
```

---

## Task 9 : Web — fusion pure jumelle

**Files:**
- Create: `apps/web/lib/forward-target-merge.ts`
- Test: `apps/web/__tests__/lib/forward-target-merge.test.ts` (créé)

**Interfaces:**
- Produces (miroir exact de la Task 6) :

```ts
export type ForwardTargetKind = 'conversation' | 'contact';
export interface ForwardTarget {
  readonly id: string;                 // "conv:<id>" | "user:<id>"
  readonly kind: ForwardTargetKind;
  readonly conversationId?: string;
  readonly userId?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly avatarUrl?: string;
}
export function mergeForwardTargets(
  conversations: readonly ForwardTarget[],
  contacts: readonly ForwardTarget[],
): ForwardTarget[];
```

- [ ] **Step 1 : Tests RED** — les **quatre** cas de la Task 6, à l'identique (ordre, absorption, dédup, groupe qui n'absorbe pas).
- [ ] **Step 2 : Vérifier l'échec** (`cd apps/web && npx jest __tests__/lib/forward-target-merge.test.ts`).
- [ ] **Step 3 : Implémenter** avec le commentaire croisé `RÈGLE JUMELLE : apps/ios/.../ForwardTargetMerge.swift`.
- [ ] **Step 4 : Vérifier le vert. Step 5 : Commit**

```bash
git add apps/web/lib/forward-target-merge.ts apps/web/__tests__/lib/forward-target-merge.test.ts
git commit -m "feat(web): une cible de transfert, qu'elle vienne d'une conversation ou d'un contact" -- apps/web/lib/forward-target-merge.ts apps/web/__tests__/lib/forward-target-merge.test.ts
```

---

## Task 10 : Web — service de carnet d'adresses

**Files:**
- Create: `apps/web/services/contacts-directory.service.ts`
- Test: `apps/web/__tests__/services/contacts-directory.service.test.ts` (créé)

**Interfaces:**
- Produces:

```ts
export interface DirectoryContact {
  readonly id: string;
  readonly displayName: string | null;
  readonly isOnMeeshy: boolean;
  readonly matchedUser?: { readonly id: string; readonly username?: string; readonly displayName?: string; readonly avatar?: string };
}
export const contactsDirectoryService = {
  list(params: { offset?: number; limit?: number; filter?: 'all' | 'meeshy' | 'invitable'; q?: string }):
    Promise<{ contacts: DirectoryContact[]; hasMore: boolean }>;
};
```

- [ ] **Step 1 : Test RED**

> ⚠️ **Le corps HTTP arrive DOUBLEMENT emballé.** `apiService.request<T>()`
> (`apps/web/services/api.service.ts:207-238`) fait `data = await response.json()` puis
> `return { success: true, data, message }` : le corps COMPLET de la réponse atterrit dans `.data`,
> sans déballage. La route répondant via `sendPaginatedSuccess` (`{ success, data, message, pagination }`),
> la liste se lit en `response.data.data` et la pagination en `response.data.pagination` — **jamais**
> `response.data` / `response.pagination`. Tous les services voisins le font ainsi
> (`notification.service.ts:183-193`, `dashboard.service.ts:70`, `agent-admin.service.ts:4-18`), et
> leurs tests mockent le double niveau. Un mock à un seul niveau laisse le test vert pendant que la
> production reçoit un objet là où elle attend un tableau, et `hasMore` reste faux à jamais.

```ts
it('interroge /users/me/contacts avec filter=meeshy et la requête', async () => {
  mockApiGet.mockResolvedValue({ success: true, data: {
    success: true,
    data: [{ id: 'd1', displayName: 'Alice', isOnMeeshy: true, matchedUser: { id: 'u1', username: 'alice' } }],
    pagination: { total: 1, offset: 0, limit: 50, hasMore: false }
  } });

  const res = await contactsDirectoryService.list({ q: 'ali', filter: 'meeshy', limit: 50 });

  expect(mockApiGet).toHaveBeenCalledWith('/users/me/contacts', expect.objectContaining({ filter: 'meeshy', q: 'ali' }));
  expect(res.contacts[0].matchedUser?.id).toBe('u1');
  expect(res.hasMore).toBe(false);
});
```
(Adapter au motif de mock d'`apiService` des tests voisins de `__tests__/services/`.)

- [ ] **Step 2 : Vérifier l'échec. Step 3 : implémenter** (aucun repli fabriqué : une erreur réseau se propage, elle ne devient pas une liste vide). **Step 4 : Vérifier le vert. Step 5 : Commit**

```bash
git add apps/web/services/contacts-directory.service.ts apps/web/__tests__/services/contacts-directory.service.test.ts
git commit -m "feat(web): lire le carnet d'adresses synchronisé, avec sa recherche serveur" -- apps/web/services/contacts-directory.service.ts apps/web/__tests__/services/contacts-directory.service.test.ts
```

---

## Task 11 : Web — modale paginée, recherche unifiée, contact sans conversation

**Files:**
- Modify: `apps/web/components/conversations/forward-message-modal.tsx`
- Modify: `apps/web/components/conversations/ConversationLayout.tsx` (passer `loadMore`/`hasMore`/`isLoadingMore`)
- Test: `apps/web/__tests__/components/conversations/forward-message-modal.test.tsx`

**Interfaces:**
- Consumes: `mergeForwardTargets` (Task 9), `contactsDirectoryService` (Task 10), `useFriendRequestsV2().connected` (Task 3), `conversationsService.searchConversations` (existant), `conversationsService.createConversation` (existant).

- [ ] **Step 1 : Tests RED**

```tsx
it('charge la page suivante quand la sentinelle devient visible', async () => {
  const loadMore = jest.fn();
  render(<ForwardMessageModal {...baseProps} hasMore isLoadingMore={false} onLoadMore={loadMore} />);
  triggerIntersection(screen.getByTestId('forward-load-more-sentinel'));
  await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1));
});

it('ne pagine pas pendant une recherche', async () => {
  const loadMore = jest.fn();
  render(<ForwardMessageModal {...baseProps} hasMore isLoadingMore={false} onLoadMore={loadMore} />);
  await userEvent.type(screen.getByRole('textbox'), 'alice');
  expect(screen.queryByTestId('forward-load-more-sentinel')).toBeNull();
  expect(loadMore).not.toHaveBeenCalled();
});

it('crée la conversation directe à l’envoi, jamais à la sélection', async () => {
  const createConversation = jest.spyOn(conversationsService, 'createConversation')
    .mockResolvedValue({ id: 'new-conv' } as never);
  render(<ForwardMessageModal {...baseProps} contactsOverride={[{ id: 'user:u1', kind: 'contact', userId: 'u1', title: 'Alice' }]} />);

  await userEvent.click(screen.getByTestId('forward-row-user:u1'));
  expect(createConversation).not.toHaveBeenCalled();

  await userEvent.click(screen.getByTestId('forward-send-user:u1'));
  await waitFor(() => expect(createConversation).toHaveBeenCalledTimes(1));
  expect(sendMessageMock).toHaveBeenCalledWith('new-conv', expect.anything(), expect.anything(),
    undefined, undefined, undefined, undefined, expect.stringMatching(/^cid_/), 'msg-1', 'source-conv');
});
```
(Le dernier `expect` reprend l'ordre positionnel exact déjà asserté dans le fichier ; le relire avant d'écrire.)

- [ ] **Step 2 : Vérifier l'échec** (`cd apps/web && npx jest __tests__/components/conversations/forward-message-modal.test.tsx`).

- [ ] **Step 3 : Implémenter la pagination** : remplacer `<ScrollArea>` (`:180`) par un `div ref={scrollRef} className="h-72 overflow-y-auto"` ; sentinelle `<div data-testid="forward-load-more-sentinel" />` observée avec `root: scrollRef.current`, `rootMargin: '120px'` (motif `admin/user-detail/UserConversationsSection.tsx:282`) ; **instantané au montage** — la modale copie `conversations` dans un état local et l'étend via `onLoadMore`, sans relire le cache tant qu'elle est ouverte (`setConversations` collapse les pages, `use-conversations-pagination-rq.ts:88-99`).

- [ ] **Step 4 : Implémenter la recherche** : anti-rebond `use-debounce` (300 ms), 2 caractères minimum, trois sources fusionnées par `mergeForwardTargets`, réponse rejetée si la requête n'est plus la courante, **erreur distinguée du vide** (`searchConversations` rend `[]` sur erreur : gérer un état d'échec explicite plutôt que d'afficher « aucun résultat »).

- [ ] **Step 5 : Implémenter la cible contact** : à l'envoi seulement, `createConversation({ type:'direct', participantIds:[userId] })`, puis l'envoi existant avec l'identifiant obtenu. Ne PAS invalider `queryKeys.conversations.infinite()`.

- [ ] **Step 6 : Vérifier le vert + gates**

Run: `cd apps/web && npx jest __tests__/lib __tests__/components/conversations __tests__/services --maxWorkers=50%` puis `npm run type-check 2>&1 | tail -3` (comparer au baseline capturé AVANT le lot).

- [ ] **Step 7 : Commit**

```bash
git add apps/web/components/conversations/forward-message-modal.tsx apps/web/components/conversations/ConversationLayout.tsx apps/web/__tests__/components/conversations/forward-message-modal.test.tsx
git commit -m "feat(web): le sélecteur de transfert atteint toutes les conversations et les contacts" -- apps/web/components/conversations/forward-message-modal.tsx apps/web/components/conversations/ConversationLayout.tsx apps/web/__tests__/components/conversations/forward-message-modal.test.tsx
```

---

## Gates de fin de chantier

- [ ] `cd services/gateway && bun run test:coverage` puis `npx tsc --noEmit` (Tasks 1, 4, 5).
- [ ] `./apps/ios/meeshy.sh test` (au moins build complet + suites ciblées sur simulateur 18.2).
- [ ] Suites SDK ciblées (`FriendServiceTests`, `ConversationServiceTests`).
- [ ] `cd apps/web && npx jest` sur les chemins touchés + `npm run type-check` comparé au baseline.
- [ ] Vérification sur simulateur : scroll au-delà de 50 conversations, recherche d'un contact sans conversation, envoi.

## Self-Review

**Couverture de la spec.** S.1 → Task 4. S.2 → Task 1. S.3 → Task 5. Volet C → Tasks 2 et 3. A.1 → Task 7. A.2 → Task 11 (Step 3). A.3 → Tasks 6, 7, 9, 11 (Step 4). A.4 → Tasks 2, 10, et la consommation de `ContactDirectoryService.list(query:)` en Task 7. A.5 → Tasks 8 et 11 (Step 5). A.6 → aucune tâche n'appelle `/users/search` (vérifié : aucun step ne le mentionne).

**Écart assumé.** La spec annonçait `conversationMinimalSchema` comme autorisant déjà `participants` ; la Task 4 corrige et déclare le champ. La spec est à amender sur ce point ; le plan fait foi.

**Placeholders.** Aucun « TBD/TODO ». Deux steps renvoient au fichier voisin pour un harnais de test (Task 2 Step 1, Task 10 Step 1) : c'est une consigne de lecture, pas une omission de contenu — le test complet est fourni dans les deux cas.

**Cohérence des types.** `ForwardTarget` a les mêmes champs des deux côtés (`id`, `kind`, `conversationId`, `userId`, `title`, `subtitle`, `avatarURL`/`avatarUrl` — seule la casse de l'URL diffère, par convention de langage). `ForwardTargetMerge.merge` (Swift) ↔ `mergeForwardTargets` (TS) : même ordre de paramètres, même sémantique. `allFriendRequests(status:offset:limit:)` est utilisé avec les mêmes arguments en Tasks 2 et 7. `copyAttachmentsFromMessageId` porte le même nom en Task 5, dans le Zod partagé, et dans le plan du volet B.
