# Conversation Options Finalize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Finaliser le câblage de bout-en-bout des options de conversation (catégorie/tags réels, autocomplétion fonctionnelle, affichage cohérent dans liste + sheet, mises à jour persistées correctement).

**Architecture:** Nouveau endpoint `GET /me/preferences/conversation-tags` côté gateway + validation ownership de `categoryId`. SDK étendu avec `createCategory` et `getMyConversationTags`. iOS introduit `ConversationOptionsViewModel` qui orchestre le flux optimistic + 2 composants `MeeshyUI` (`CategoryPickerField`, `TagInputField`) qui remplacent l'autocomplétion locale cassée. Liste corrigée pour résoudre `categoryId → name` et afficher tags + customName + reaction dans la cellule.

**Tech Stack:** Fastify 5 + Prisma (gateway), Swift 6 / SPM (SDK + iOS), XCTest, Jest E2E.

**Spec:** `docs/superpowers/specs/2026-05-09-conversation-options-finalize-design.md`

---

## Files map

**Created**
- `services/gateway/src/routes/me/preferences/conversation-tags.ts` — agrégation tags
- `services/gateway/src/__tests__/e2e/preferences-conversation-tags.e2e.test.ts`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift`
- `apps/ios/MeeshyTests/Unit/ViewModels/ConversationOptionsViewModelTests.swift`
- `apps/ios/MeeshyTests/Mocks/MockPreferenceService.swift`
- `apps/ios/MeeshyTests/Mocks/MockConversationService.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`
- `packages/MeeshySDK/Tests/MeeshyUITests/CategoryPickerFieldTests.swift`
- `packages/MeeshySDK/Tests/MeeshyUITests/TagInputFieldTests.swift`

**Modified**
- `services/gateway/src/routes/conversation-preferences.ts` — ownership validation
- `services/gateway/src/routes/me/preferences/index.ts` — register new route
- `services/gateway/src/__tests__/e2e/preferences-categories.e2e.test.ts` — extend
- `packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift` — add 2 methods
- `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PreferenceServiceTests.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift` — refactor
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` — filter fix
- `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` — chips/customName/reaction
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` — section header avec name

---

## Task 1: Backend — endpoint conversation-tags

**Files:**
- Create: `services/gateway/src/routes/me/preferences/conversation-tags.ts`
- Modify: `services/gateway/src/routes/me/preferences/index.ts`
- Test: `services/gateway/src/__tests__/e2e/preferences-conversation-tags.e2e.test.ts`

- [ ] **Step 1: Create new route file**

```typescript
// services/gateway/src/routes/me/preferences/conversation-tags.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';

const conversationTagsResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'All distinct tags used by the authenticated user across their conversation preferences, sorted alphabetically'
        }
      }
    }
  }
} as const;

export async function conversationTagsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[ConversationTags] Missing required service: prisma');
    return;
  }

  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  fastify.addHook('preHandler', authMiddleware);

  fastify.get(
    '/',
    {
      schema: {
        description: 'Returns the deduplicated, sorted list of tags the user has assigned across their conversation preferences. Used for client-side autocomplete suggestions.',
        tags: ['preferences'],
        summary: 'List user conversation tags',
        response: {
          200: conversationTagsResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const rows = await prisma.userConversationPreferences.findMany({
          where: { userId, tags: { isEmpty: false } },
          select: { tags: true }
        });

        const set = new Set<string>();
        for (const row of rows) {
          for (const t of row.tags || []) {
            const trimmed = t.trim();
            if (trimmed.length > 0) set.add(trimmed);
          }
        }

        const tags = Array.from(set).sort((a, b) => a.localeCompare(b));

        return reply.send({
          success: true,
          data: { tags }
        });
      } catch (error: any) {
        logError('Error fetching conversation tags', error, { source: 'conversation-tags-routes' });
        return reply.status(500).send({
          success: false,
          error: 'FETCH_ERROR',
          message: error.message || 'Failed to fetch tags'
        });
      }
    }
  );
}
```

- [ ] **Step 2: Register route in preferences index**

Edit `services/gateway/src/routes/me/preferences/index.ts`. Find the existing `categoriesRoutes` registration block and add the new sub-route registration alongside (just before the per-category factories):

```typescript
import { conversationTagsRoutes } from './conversation-tags';

// ... inside userPreferencesRoutes, after categoriesRoutes and before factory routers:
fastify.register(conversationTagsRoutes, { prefix: '/conversation-tags' });
```

(Add the `import` near the other route imports at the top.)

- [ ] **Step 3: Write E2E test**

```typescript
// services/gateway/src/__tests__/e2e/preferences-conversation-tags.e2e.test.ts
import Fastify, { FastifyInstance } from 'fastify';
import { conversationTagsRoutes } from '../../routes/me/preferences/conversation-tags';

jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user-123',
      isAnonymous: false
    };
  })
}));

describe('E2E: GET /me/preferences/conversation-tags', () => {
  let app: FastifyInstance;
  const mockPrisma = {
    userConversationPreferences: {
      findMany: jest.fn()
    }
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    (app as any).prisma = mockPrisma;
    await app.register(conversationTagsRoutes, { prefix: '/me/preferences/conversation-tags' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns deduplicated, sorted tags', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([
      { tags: ['urgent', 'family'] },
      { tags: ['family', 'work'] },
      { tags: [] },
      { tags: ['urgent'] }
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.tags).toEqual(['family', 'urgent', 'work']);
  });

  it('returns empty array when no tags exist', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.tags).toEqual([]);
  });

  it('trims whitespace and ignores blanks', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([
      { tags: ['  urgent  ', '', '   ', 'family'] }
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.json().data.tags).toEqual(['family', 'urgent']);
  });

  it('scopes query to authenticated user', async () => {
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);

    await app.inject({ method: 'GET', url: '/me/preferences/conversation-tags' });

    expect(mockPrisma.userConversationPreferences.findMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-123', tags: { isEmpty: false } },
      select: { tags: true }
    });
  });

  it('returns 500 on prisma failure', async () => {
    mockPrisma.userConversationPreferences.findMany.mockRejectedValue(new Error('boom'));

    const res = await app.inject({
      method: 'GET',
      url: '/me/preferences/conversation-tags'
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
```

- [ ] **Step 4: Run gateway tests**

```bash
cd services/gateway && npm test -- preferences-conversation-tags
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/me/preferences/conversation-tags.ts \
        services/gateway/src/routes/me/preferences/index.ts \
        services/gateway/src/__tests__/e2e/preferences-conversation-tags.e2e.test.ts
git commit -m "feat(gateway): add GET /me/preferences/conversation-tags endpoint

Aggregates distinct tags used across the authenticated user's conversation
preferences. Returns sorted, deduplicated, whitespace-trimmed list.
Powers iOS autocomplete suggestions in conversation options sheet."
```

---

## Task 2: Backend — categoryId ownership validation

**Files:**
- Modify: `services/gateway/src/routes/conversation-preferences.ts` (PUT handler)
- Test: `services/gateway/src/__tests__/e2e/preferences-categories.e2e.test.ts` (extend) OR new file `preferences-conversation-prefs.e2e.test.ts`

- [ ] **Step 1: Locate the PUT handler in `conversation-preferences.ts`**

It is the block starting with `fastify.put<{ Params: ConversationIdParams; Body: ConversationPreferencesBody }>(` near line 400. Before the `prisma.userConversationPreferences.upsert(...)` call, add the validation.

- [ ] **Step 2: Insert ownership validation**

Inside the handler, immediately after `const { conversationId } = request.params; const data = request.body;` add:

```typescript
        // If categoryId is provided AND non-null, verify it belongs to the user
        if (data.categoryId !== undefined && data.categoryId !== null) {
          const category = await fastify.prisma.userConversationCategory.findUnique({
            where: { id: data.categoryId },
            select: { id: true, userId: true }
          });
          if (!category || category.userId !== userId) {
            return reply.status(400).send({
              success: false,
              error: 'INVALID_CATEGORY_ID',
              message: 'Category does not exist or does not belong to the authenticated user'
            });
          }
        }
```

- [ ] **Step 3: Write E2E test for ownership validation**

Add to `services/gateway/src/__tests__/e2e/preferences-conversation-prefs.e2e.test.ts` (create if absent following the pattern of `preferences-categories.e2e.test.ts`).

If creating new file:

```typescript
import Fastify, { FastifyInstance } from 'fastify';
import { conversationPreferencesRoutes } from '../../routes/conversation-preferences';

jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'user-A',
      isAnonymous: false
    };
  })
}));

describe('E2E: PUT /api/user-preferences/conversations/:conversationId — categoryId ownership', () => {
  let app: FastifyInstance;
  const mockPrisma = {
    userConversationPreferences: { upsert: jest.fn() },
    userConversationCategory: { findUnique: jest.fn() }
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    (app as any).prisma = mockPrisma;
    (app as any).authenticate = async () => {};
    await app.register(conversationPreferencesRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('rejects categoryId belonging to another user with 400 INVALID_CATEGORY_ID', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue({
      id: 'cat-of-user-B', userId: 'user-B'
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'cat-of-user-B' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_CATEGORY_ID');
    expect(mockPrisma.userConversationPreferences.upsert).not.toHaveBeenCalled();
  });

  it('rejects categoryId that does not exist', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'does-not-exist' }
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts categoryId owned by the authenticated user', async () => {
    mockPrisma.userConversationCategory.findUnique.mockResolvedValue({
      id: 'cat-of-A', userId: 'user-A'
    });
    mockPrisma.userConversationPreferences.upsert.mockResolvedValue({
      id: 'p1', userId: 'user-A', conversationId: 'conv-1', categoryId: 'cat-of-A',
      isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false,
      tags: [], customName: null, reaction: null, orderInCategory: null,
      category: { id: 'cat-of-A', name: 'Family', color: null, icon: null }
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: 'cat-of-A' }
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userConversationPreferences.upsert).toHaveBeenCalled();
  });

  it('skips validation when categoryId is null (uncategorize)', async () => {
    mockPrisma.userConversationPreferences.upsert.mockResolvedValue({
      id: 'p1', userId: 'user-A', conversationId: 'conv-1', categoryId: null,
      isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false,
      tags: [], customName: null, reaction: null, orderInCategory: null
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/user-preferences/conversations/conv-1',
      payload: { categoryId: null }
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userConversationCategory.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd services/gateway && npm test -- preferences-conversation-prefs
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversation-preferences.ts \
        services/gateway/src/__tests__/e2e/preferences-conversation-prefs.e2e.test.ts
git commit -m "feat(gateway): validate categoryId ownership in PUT conversation prefs

Prevents users from assigning their conversations to categories that don't
belong to them. Returns 400 INVALID_CATEGORY_ID when the categoryId either
doesn't exist or belongs to another user. categoryId=null still works
(uncategorize)."
```

---

## Task 3: SDK — PreferenceService.createCategory + getMyConversationTags

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PreferenceServiceTests.swift`

- [ ] **Step 1: Extend `PreferenceServiceProviding` and `PreferenceService`**

Replace the existing `PreferenceServiceProviding` protocol declaration and the `PreferenceService` class with the extended version below (keep existing methods, add new ones):

```swift
public protocol PreferenceServiceProviding: Sendable {
    func getCategories() async throws -> [ConversationCategory]
    func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences
    func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws
    func patchCategory(id: String, isExpanded: Bool) async throws
    func getAllPreferences() async throws -> UserPreferences
    func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws
    func resetPreferences(category: PreferenceCategory) async throws
    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory
    func getMyConversationTags() async throws -> [String]
}
```

Append to the `PreferenceService` class (after `resetPreferences`):

```swift
    // MARK: - Category Creation

    public func createCategory(name: String, color: String? = nil, icon: String? = nil) async throws -> ConversationCategory {
        struct Body: Encodable {
            let name: String
            let color: String?
            let icon: String?
        }
        let response: APIResponse<ConversationCategory> = try await api.post(
            endpoint: "/me/preferences/categories",
            body: Body(name: name, color: color, icon: icon)
        )
        return response.data
    }

    // MARK: - User Tags

    public func getMyConversationTags() async throws -> [String] {
        struct Payload: Decodable { let tags: [String] }
        let response: APIResponse<Payload> = try await api.request(
            endpoint: "/me/preferences/conversation-tags"
        )
        return response.data.tags
    }
```

Note the protocol method must NOT have default values; the concrete implementation may. The protocol signature is:
```swift
func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory
```
And public implementation accepts defaults:
```swift
public func createCategory(name: String, color: String? = nil, icon: String? = nil) async throws -> ConversationCategory
```

- [ ] **Step 2: Make `ConversationCategory` Encodable for testability AND check existing decodability**

Open `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`. The current `ConversationCategory` is `Decodable, Identifiable`. Keep `Decodable` for response decoding, leave the test-side encoding to manual JSON. No change needed here.

But the response from `POST /me/preferences/categories` returns the FULL category — which already matches the `ConversationCategory` Decodable shape. Verify by reading `services/gateway/src/routes/me/preferences/categories.ts` POST handler (returns the full prisma row including `userId`, `createdAt`, `updatedAt`, `name`, `color`, `icon`, `order`, `isExpanded`).

The existing `ConversationCategory` struct has 6 properties (`id, name, color, icon, order, isExpanded`). All are `Decodable` already. Decoding will skip extra fields (`userId`, `createdAt`, `updatedAt`) via Swift's default keyed decoding. ✓

- [ ] **Step 3: Add tests**

Append to `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PreferenceServiceTests.swift` (after the last existing test):

```swift
    // MARK: - createCategory

    func testCreateCategoryPostsCorrectEndpointAndDecodesResponse() async throws {
        let returned = makeCategory(id: "newCat", name: "Family")
        let response = APIResponse(success: true, data: returned, error: nil)
        mock.stub("/me/preferences/categories", result: response)

        let result = try await service.createCategory(name: "Family", color: nil, icon: nil)

        XCTAssertEqual(result.id, "newCat")
        XCTAssertEqual(result.name, "Family")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/categories")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testCreateCategoryThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "invalid name")
        do {
            _ = try await service.createCategory(name: "", color: nil, icon: nil)
            XCTFail("should throw")
        } catch {
            // expected
        }
    }

    // MARK: - getMyConversationTags

    func testGetMyConversationTagsReturnsTags() async throws {
        struct Payload: Decodable { let tags: [String] }
        let response = APIResponse(success: true, data: Payload(tags: ["family", "urgent"]), error: nil)
        mock.stub("/me/preferences/conversation-tags", result: response)

        let result = try await service.getMyConversationTags()

        XCTAssertEqual(result, ["family", "urgent"])
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/conversation-tags")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testGetMyConversationTagsReturnsEmpty() async throws {
        struct Payload: Decodable { let tags: [String] }
        let response = APIResponse(success: true, data: Payload(tags: []), error: nil)
        mock.stub("/me/preferences/conversation-tags", result: response)

        let result = try await service.getMyConversationTags()
        XCTAssertEqual(result, [])
    }
```

- [ ] **Step 4: Run SDK tests**

Use the package-level scheme from main repo CLAUDE.md memory: `MeeshySDK-Package`.

```bash
cd packages/MeeshySDK && swift test --filter PreferenceServiceTests
```

If `swift test` is not the convention used here, use the test runner from the iOS app:
```bash
./apps/ios/meeshy.sh test --filter PreferenceServiceTests
```

Expected: all PreferenceServiceTests pass (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Services/PreferenceServiceTests.swift
git commit -m "feat(sdk): add createCategory and getMyConversationTags to PreferenceService

Exposes POST /me/preferences/categories (typed ConversationCategory return)
and GET /me/preferences/conversation-tags (deduplicated tag list) so iOS
can persist new categories and offer real autocomplete suggestions."
```

---

## Task 4: MeeshyUI — CategoryPickerField component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/CategoryPickerFieldTests.swift`

- [ ] **Step 1: Create CategoryPickerField.swift**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift
import SwiftUI
import MeeshySDK

@MainActor
public struct CategoryPickerField: View {
    public let categories: [ConversationCategory]
    @Binding public var selectedId: String?
    public let accentColor: Color
    public let onCreateCategory: (String) async -> ConversationCategory?

    @State private var editing: String = ""
    @FocusState private var focused: Bool
    @State private var isCreating: Bool = false
    @Environment(\.colorScheme) private var colorScheme

    nonisolated public init(
        categories: [ConversationCategory],
        selectedId: Binding<String?>,
        accentColor: Color,
        onCreateCategory: @escaping (String) async -> ConversationCategory?
    ) {
        self.categories = categories
        self._selectedId = selectedId
        self.accentColor = accentColor
        self.onCreateCategory = onCreateCategory
    }

    private var isDark: Bool { colorScheme == .dark }

    private var selectedCategory: ConversationCategory? {
        guard let id = selectedId else { return nil }
        return categories.first(where: { $0.id == id })
    }

    private var displayedCategories: [ConversationCategory] {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return categories.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
        }
        return categories
            .filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
    }

    private var canCreate: Bool {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        return !categories.contains(where: { $0.name.lowercased() == trimmed.lowercased() })
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            inputField
            if focused {
                suggestionList
            }
        }
        .onChange(of: focused) { _, isFocused in
            if isFocused {
                editing = selectedCategory?.name ?? ""
            } else {
                editing = selectedCategory?.name ?? ""
            }
        }
        .onAppear {
            editing = selectedCategory?.name ?? ""
        }
    }

    @ViewBuilder
    private var inputField: some View {
        HStack(spacing: 8) {
            if let cat = selectedCategory, !focused {
                Circle()
                    .fill(Color(hex: cat.color ?? "6366F1"))
                    .frame(width: 8, height: 8)
            }
            TextField("Choisir ou créer une catégorie...", text: $editing)
                .focused($focused)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.words)
                .onSubmit { submit() }
            if !editing.isEmpty {
                Button {
                    editing = ""
                    selectedId = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Effacer la catégorie")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(focused ? accentColor.opacity(0.6) : Color.gray.opacity(0.15), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var suggestionList: some View {
        VStack(spacing: 0) {
            ForEach(displayedCategories) { cat in
                Button {
                    selectedId = cat.id
                    editing = cat.name
                    focused = false
                } label: {
                    HStack {
                        Circle().fill(Color(hex: cat.color ?? "6366F1")).frame(width: 8, height: 8)
                        Text(cat.name).font(.system(size: 14, weight: .medium))
                        Spacer()
                        if cat.id == selectedId {
                            Image(systemName: "checkmark").foregroundColor(accentColor)
                        }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Sélectionner la catégorie \(cat.name)"))
            }

            if canCreate {
                Divider().opacity(0.3)
                Button {
                    Task { await create() }
                } label: {
                    HStack(spacing: 6) {
                        if isCreating {
                            ProgressView().scaleEffect(0.7)
                        } else {
                            Image(systemName: "plus.circle.fill").foregroundColor(accentColor)
                        }
                        Text("Créer \"\(editing.trimmingCharacters(in: .whitespacesAndNewlines))\"")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(accentColor)
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .disabled(isCreating)
                .accessibilityLabel(Text("Créer la catégorie \(editing)"))
            }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(isDark ? Color.white.opacity(0.06) : Color.white))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.12), lineWidth: 1))
    }

    private func submit() {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        if let exact = categories.first(where: { $0.name.lowercased() == trimmed.lowercased() }) {
            selectedId = exact.id
            editing = exact.name
            focused = false
            return
        }
        if !trimmed.isEmpty {
            Task { await create() }
        }
    }

    private func create() async {
        guard !isCreating else { return }
        let name = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isCreating = true
        defer { isCreating = false }
        if let created = await onCreateCategory(name) {
            selectedId = created.id
            editing = created.name
            focused = false
        }
    }
}

// MARK: - Color hex helper (local, public to MeeshyUI)

private extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: s).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        self = Color(red: r, green: g, blue: b)
    }
}
```

If `Color(hex:)` already exists publicly in MeeshyUI (`MeeshyColors.swift`), drop the private extension and use the public one. The implementer must verify by grepping `extension Color {` in `MeeshyUI/`.

- [ ] **Step 2: Write tests**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/CategoryPickerFieldTests.swift
import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CategoryPickerFieldTests: XCTestCase {
    private func makeCategory(id: String, name: String, order: Int = 0) -> ConversationCategory {
        ConversationCategory(id: id, name: name, color: "#6366F1", icon: nil, order: order, isExpanded: true)
    }

    private struct Host: View {
        let categories: [ConversationCategory]
        @State var selected: String? = nil
        var onCreate: (String) async -> ConversationCategory? = { _ in nil }

        var body: some View {
            CategoryPickerField(
                categories: categories,
                selectedId: $selected,
                accentColor: .blue,
                onCreateCategory: onCreate
            )
        }
    }

    func test_init_doesNotCrashWhenCategoriesEmpty() {
        let host = Host(categories: [])
        XCTAssertNotNil(host.body)
    }

    func test_init_doesNotCrashWithCategories() {
        let host = Host(categories: [makeCategory(id: "1", name: "Family")])
        XCTAssertNotNil(host.body)
    }

    func test_init_doesNotCrashWithSelectedCategory() {
        var host = Host(categories: [makeCategory(id: "1", name: "Family")])
        host.selected = "1"
        XCTAssertNotNil(host.body)
    }
}
```

(SwiftUI focus-state tests require ViewInspector or UI tests; we keep these as smoke that the view compiles and constructs without crashing — the integration tests in iOS app cover the flow.)

- [ ] **Step 3: Run tests**

```bash
swift test --filter CategoryPickerFieldTests
```

Or use ./apps/ios/meeshy.sh test if configured.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/CategoryPickerFieldTests.swift
git commit -m "feat(meeshyui): add CategoryPickerField primitive

Inline picker that shows all user categories on focus, filters to the
typed substring, and offers a Create button when no match exists.
Driven entirely by a Binding<String?> selectedId and an async create
closure. Replaces the broken local string-based autocomplete in the
conversation options sheet."
```

---

## Task 5: MeeshyUI — TagInputField component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/TagInputFieldTests.swift`

- [ ] **Step 1: Create TagInputField.swift**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift
import SwiftUI

@MainActor
public struct TagInputField: View {
    @Binding public var selectedTags: [String]
    public let knownTags: [String]
    public let accentColor: Color

    @State private var editing: String = ""
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    nonisolated public init(
        selectedTags: Binding<[String]>,
        knownTags: [String],
        accentColor: Color
    ) {
        self._selectedTags = selectedTags
        self.knownTags = knownTags
        self.accentColor = accentColor
    }

    private var isDark: Bool { colorScheme == .dark }

    private var trimmedQuery: String {
        editing.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var suggestions: [String] {
        let pool = knownTags.filter { !selectedTags.contains($0) }
        if trimmedQuery.isEmpty {
            return Array(pool.prefix(8))
        }
        return Array(
            pool.filter { $0.localizedCaseInsensitiveContains(trimmedQuery) }.prefix(8)
        )
    }

    private var canCreate: Bool {
        !trimmedQuery.isEmpty &&
        !selectedTags.contains(where: { $0.lowercased() == trimmedQuery.lowercased() }) &&
        !knownTags.contains(where: { $0.lowercased() == trimmedQuery.lowercased() })
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !selectedTags.isEmpty { chips }
            inputField
            if focused { suggestionPanel }
        }
    }

    private var chips: some View {
        FlowLayout(spacing: 6) {
            ForEach(selectedTags, id: \.self) { tag in
                HStack(spacing: 4) {
                    Text(tag)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(accentColor)
                    Button {
                        selectedTags.removeAll { $0 == tag }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(accentColor.opacity(0.6))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("Retirer le tag \(tag)"))
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(accentColor.opacity(isDark ? 0.15 : 0.1)))
            }
        }
    }

    private var inputField: some View {
        HStack(spacing: 6) {
            TextField("Ajouter un tag...", text: $editing)
                .focused($focused)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { submit() }
            if !editing.isEmpty {
                Button {
                    editing = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Effacer la saisie")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(focused ? accentColor.opacity(0.6) : Color.gray.opacity(0.15), lineWidth: 1)
        )
    }

    private var suggestionPanel: some View {
        VStack(spacing: 0) {
            ForEach(suggestions, id: \.self) { tag in
                Button {
                    addTag(tag)
                } label: {
                    HStack {
                        Image(systemName: "tag.fill").font(.system(size: 10)).foregroundColor(.secondary)
                        Text(tag).font(.system(size: 14, weight: .medium))
                        Spacer()
                        Image(systemName: "arrow.turn.down.left").font(.system(size: 10)).foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Ajouter le tag \(tag)"))
            }

            if canCreate {
                if !suggestions.isEmpty { Divider().opacity(0.3) }
                Button {
                    addTag(trimmedQuery)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill").foregroundColor(accentColor)
                        Text("Créer \"\(trimmedQuery)\"")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(accentColor)
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Créer le tag \(trimmedQuery)"))
            }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(isDark ? Color.white.opacity(0.06) : Color.white))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.12), lineWidth: 1))
    }

    private func submit() {
        if let first = suggestions.first {
            addTag(first)
            return
        }
        if canCreate { addTag(trimmedQuery) }
    }

    private func addTag(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !selectedTags.contains(trimmed) else { return }
        selectedTags.append(trimmed)
        editing = ""
    }
}
```

This depends on `FlowLayout` already existing in `MeeshyUI`. The implementer must verify by grepping; if absent, also include the FlowLayout from `ConversationPreferencesTab.swift` (which references `FlowLayout(spacing:)` already — it must exist somewhere in the tree).

- [ ] **Step 2: Write tests**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/TagInputFieldTests.swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TagInputFieldTests: XCTestCase {
    private struct Host: View {
        @State var tags: [String]
        let known: [String]
        var body: some View {
            TagInputField(selectedTags: $tags, knownTags: known, accentColor: .blue)
        }
    }

    func test_init_emptyState() {
        XCTAssertNotNil(Host(tags: [], known: []).body)
    }

    func test_init_withSelected() {
        XCTAssertNotNil(Host(tags: ["urgent"], known: ["urgent", "family"]).body)
    }
}
```

- [ ] **Step 3: Run + commit**

```bash
swift test --filter TagInputFieldTests

git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/TagInputFieldTests.swift
git commit -m "feat(meeshyui): add TagInputField primitive

Chips + input + autocomplete-on-focus dropdown for the conversation tags
field. Filters known tags by substring, offers Create action for new
ones, ENTER selects first match or creates."
```

---

## Task 6: iOS — ConversationOptionsViewModel + tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift`
- Create: `apps/ios/MeeshyTests/Mocks/MockPreferenceService.swift`
- Create: `apps/ios/MeeshyTests/Mocks/MockConversationService.swift`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationOptionsViewModelTests.swift`

- [ ] **Step 1: Create ConversationOptionsViewModel**

```swift
// apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift
import Foundation
import Combine
import MeeshySDK
import os

@MainActor
final class ConversationOptionsViewModel: ObservableObject {
    @Published var prefs: APIConversationPreferences = .empty
    @Published var categories: [ConversationCategory] = []
    @Published var allTags: [String] = []
    @Published var loadState: LoadState = .idle
    @Published var errorMessage: String?
    @Published var didDelete: Bool = false
    @Published var didLeave: Bool = false

    private let conversationId: String
    private let preferenceService: PreferenceServiceProviding
    private let conversationService: ConversationServiceProviding
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "conv-options")

    private let customNameSubject = PassthroughSubject<String, Never>()
    private var cancellables = Set<AnyCancellable>()

    init(
        conversationId: String,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared
    ) {
        self.conversationId = conversationId
        self.preferenceService = preferenceService
        self.conversationService = conversationService
        setupDebounce()
    }

    enum LoadState: Equatable {
        case idle, loading, loaded, error(String)
    }

    func load() async {
        loadState = .loading
        do {
            async let prefsCall = preferenceService.getConversationPreferences(conversationId: conversationId)
            async let categoriesCall = preferenceService.getCategories()
            async let tagsCall = preferenceService.getMyConversationTags()
            let (p, c, t) = try await (prefsCall, categoriesCall, tagsCall)
            self.prefs = p
            self.categories = c
            self.allTags = t
            self.loadState = .loaded
        } catch {
            Self.logger.error("Failed to load options: \(error.localizedDescription)")
            loadState = .error(error.localizedDescription)
            errorMessage = "Impossible de charger les préférences."
        }
    }

    // MARK: - Setters with optimistic + rollback

    func setPinned(_ value: Bool) async {
        let previous = prefs.isPinned
        prefs.isPinned = value
        await persist(UpdateConversationPreferencesRequest(isPinned: value)) { [weak self] in
            await MainActor.run { self?.prefs.isPinned = previous }
        }
    }

    func setMuted(_ value: Bool) async {
        let previous = prefs.isMuted
        prefs.isMuted = value
        await persist(UpdateConversationPreferencesRequest(isMuted: value)) { [weak self] in
            await MainActor.run { self?.prefs.isMuted = previous }
        }
    }

    func setMentionsOnly(_ value: Bool) async {
        let previous = prefs.mentionsOnly
        prefs.mentionsOnly = value
        await persist(UpdateConversationPreferencesRequest(mentionsOnly: value)) { [weak self] in
            await MainActor.run { self?.prefs.mentionsOnly = previous }
        }
    }

    func setCustomName(_ value: String) {
        prefs.customName = value.isEmpty ? nil : value
        customNameSubject.send(value)
    }

    func setReaction(_ emoji: String?) async {
        let previous = prefs.reaction
        prefs.reaction = emoji
        await persist(UpdateConversationPreferencesRequest(reaction: emoji)) { [weak self] in
            await MainActor.run { self?.prefs.reaction = previous }
        }
    }

    func setCategory(_ id: String?) async {
        let previous = prefs.categoryId
        prefs.categoryId = id
        await persist(UpdateConversationPreferencesRequest(categoryId: id)) { [weak self] in
            await MainActor.run { self?.prefs.categoryId = previous }
        }
    }

    func addTag(_ tag: String) async {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let current = prefs.tags ?? []
        guard !current.contains(trimmed) else { return }
        let next = current + [trimmed]
        let previous = current
        prefs.tags = next
        if !allTags.contains(trimmed) {
            allTags.append(trimmed)
            allTags.sort()
        }
        await persist(UpdateConversationPreferencesRequest(tags: next)) { [weak self] in
            await MainActor.run { self?.prefs.tags = previous }
        }
    }

    func removeTag(_ tag: String) async {
        let current = prefs.tags ?? []
        let next = current.filter { $0 != tag }
        let previous = current
        prefs.tags = next
        await persist(UpdateConversationPreferencesRequest(tags: next)) { [weak self] in
            await MainActor.run { self?.prefs.tags = previous }
        }
    }

    func toggleArchive() async {
        let next = !(prefs.isArchived ?? false)
        let previous = prefs.isArchived
        prefs.isArchived = next
        await persist(UpdateConversationPreferencesRequest(isArchived: next)) { [weak self] in
            await MainActor.run { self?.prefs.isArchived = previous }
        }
    }

    func createCategoryAndSelect(name: String) async -> ConversationCategory? {
        do {
            let created = try await preferenceService.createCategory(name: name, color: nil, icon: nil)
            categories.append(created)
            categories.sort { ($0.order ?? 0) < ($1.order ?? 0) }
            await setCategory(created.id)
            return created
        } catch {
            Self.logger.error("createCategory failed: \(error.localizedDescription)")
            errorMessage = "Impossible de créer la catégorie."
            return nil
        }
    }

    func deleteForMe() async {
        do {
            try await conversationService.deleteForMe(conversationId: conversationId)
            didDelete = true
        } catch {
            Self.logger.error("deleteForMe failed: \(error.localizedDescription)")
            errorMessage = "Impossible de supprimer la conversation."
        }
    }

    func leave() async {
        do {
            try await conversationService.leave(conversationId: conversationId)
            didLeave = true
        } catch {
            Self.logger.error("leave failed: \(error.localizedDescription)")
            errorMessage = "Impossible de quitter la conversation."
        }
    }

    // MARK: - Internals

    private func setupDebounce() {
        customNameSubject
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { [weak self] value in
                guard let self else { return }
                let body = UpdateConversationPreferencesRequest(customName: value.isEmpty ? nil : value)
                Task { await self.persist(body, rollback: nil) }
            }
            .store(in: &cancellables)
    }

    private func persist(
        _ request: UpdateConversationPreferencesRequest,
        rollback: (@Sendable () async -> Void)?
    ) async {
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: request
            )
            errorMessage = nil
        } catch {
            Self.logger.error("persist failed: \(error.localizedDescription)")
            await rollback?()
            errorMessage = "Erreur lors de la sauvegarde."
        }
    }
}

extension APIConversationPreferences {
    static var empty: APIConversationPreferences {
        APIConversationPreferences(
            isPinned: false, isMuted: false, isArchived: false,
            deletedForUserAt: nil, tags: [], categoryId: nil,
            reaction: nil, customName: nil, mentionsOnly: false
        )
    }
}
```

NOTE: `ConversationServiceProviding` MUST exist (or be added to the SDK). If it doesn't exist, add a minimal protocol next to `ConversationService.shared` covering `deleteForMe(conversationId:)` and `leave(conversationId:)`. The implementer must check `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` first.

`APIConversationPreferences` fields are ALL `let` per current SDK — if so, change them to `var` in `ServiceModels.swift`. Or define a local `MutableConversationPreferences` struct in the iOS app and convert at the boundary. **Recommended**: change to `var` (5 fields max) in the SDK ServiceModels.

- [ ] **Step 2: Make `APIConversationPreferences` mutable**

In `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`, locate `APIConversationPreferences` and change every `public let` to `public var` for the mutable fields:

```swift
public struct APIConversationPreferences: Codable, Sendable {
    public var isPinned: Bool?
    public var isMuted: Bool?
    public var isArchived: Bool?
    public var deletedForUserAt: Date?
    public var tags: [String]?
    public var categoryId: String?
    public var reaction: String?
    public var customName: String?
    public var mentionsOnly: Bool?
    public init(...)
}
```

(Adjust the existing struct body as needed.)

- [ ] **Step 3: Mock services**

```swift
// apps/ios/MeeshyTests/Mocks/MockPreferenceService.swift
import Foundation
@testable import MeeshySDK

final class MockPreferenceService: PreferenceServiceProviding, @unchecked Sendable {
    var prefsResult: Result<APIConversationPreferences, Error> = .success(.empty)
    var categoriesResult: Result<[ConversationCategory], Error> = .success([])
    var tagsResult: Result<[String], Error> = .success([])
    var updateResult: Result<Void, Error> = .success(())
    var createCategoryResult: Result<ConversationCategory, Error> = .success(
        ConversationCategory(id: "new", name: "X", color: nil, icon: nil, order: 0, isExpanded: true)
    )

    private(set) var updateCalls: [(String, UpdateConversationPreferencesRequest)] = []
    private(set) var createCategoryCalls: [(String, String?, String?)] = []

    func reset() {
        updateCalls.removeAll()
        createCategoryCalls.removeAll()
    }

    func getConversationPreferences(conversationId: String) async throws -> APIConversationPreferences {
        try prefsResult.get()
    }
    func getCategories() async throws -> [ConversationCategory] { try categoriesResult.get() }
    func getMyConversationTags() async throws -> [String] { try tagsResult.get() }
    func updateConversationPreferences(conversationId: String, request: UpdateConversationPreferencesRequest) async throws {
        updateCalls.append((conversationId, request))
        if case .failure(let e) = updateResult { throw e }
    }
    func createCategory(name: String, color: String?, icon: String?) async throws -> ConversationCategory {
        createCategoryCalls.append((name, color, icon))
        return try createCategoryResult.get()
    }
    func patchCategory(id: String, isExpanded: Bool) async throws {}
    func getAllPreferences() async throws -> UserPreferences { fatalError("not used in tests") }
    func patchPreferences<T: Encodable>(category: PreferenceCategory, body: T) async throws {}
    func resetPreferences(category: PreferenceCategory) async throws {}
}
```

```swift
// apps/ios/MeeshyTests/Mocks/MockConversationService.swift
import Foundation
@testable import MeeshySDK

final class MockConversationService: ConversationServiceProviding, @unchecked Sendable {
    var deleteResult: Result<Void, Error> = .success(())
    var leaveResult: Result<Void, Error> = .success(())
    private(set) var deleteCalls: [String] = []
    private(set) var leaveCalls: [String] = []

    func reset() {
        deleteCalls.removeAll(); leaveCalls.removeAll()
    }

    func deleteForMe(conversationId: String) async throws {
        deleteCalls.append(conversationId)
        if case .failure(let e) = deleteResult { throw e }
    }
    func leave(conversationId: String) async throws {
        leaveCalls.append(conversationId)
        if case .failure(let e) = leaveResult { throw e }
    }
}
```

If `ConversationServiceProviding` does not exist, the mock won't compile — the implementer adds the protocol to the SDK first. The protocol must include at minimum:

```swift
public protocol ConversationServiceProviding: Sendable {
    func deleteForMe(conversationId: String) async throws
    func leave(conversationId: String) async throws
}
```

And the existing `ConversationService` must conform.

- [ ] **Step 4: Tests**

```swift
// apps/ios/MeeshyTests/Unit/ViewModels/ConversationOptionsViewModelTests.swift
import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class ConversationOptionsViewModelTests: XCTestCase {
    private struct SUT {
        let vm: ConversationOptionsViewModel
        let prefs: MockPreferenceService
        let conv: MockConversationService
    }

    private func makeSUT() -> SUT {
        let p = MockPreferenceService()
        let c = MockConversationService()
        let vm = ConversationOptionsViewModel(
            conversationId: "conv-1",
            preferenceService: p,
            conversationService: c
        )
        return SUT(vm: vm, prefs: p, conv: c)
    }

    func test_load_populatesPrefsCategoriesAndTags() async {
        let s = makeSUT()
        s.prefs.prefsResult = .success(APIConversationPreferences(
            isPinned: true, isMuted: false, isArchived: false, deletedForUserAt: nil,
            tags: ["urgent"], categoryId: "cat1", reaction: "🔥",
            customName: "Mum", mentionsOnly: nil))
        s.prefs.categoriesResult = .success([
            ConversationCategory(id: "cat1", name: "Family", color: "#6366F1", icon: nil, order: 0, isExpanded: true)
        ])
        s.prefs.tagsResult = .success(["urgent", "work"])

        await s.vm.load()

        XCTAssertEqual(s.vm.prefs.isPinned, true)
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertEqual(s.vm.categories.count, 1)
        XCTAssertEqual(s.vm.allTags, ["urgent", "work"])
        XCTAssertEqual(s.vm.loadState, .loaded)
    }

    func test_setPinned_optimistic_persists() async {
        let s = makeSUT()
        await s.vm.setPinned(true)
        XCTAssertEqual(s.vm.prefs.isPinned, true)
        XCTAssertEqual(s.prefs.updateCalls.count, 1)
        XCTAssertEqual(s.prefs.updateCalls[0].1.isPinned, true)
    }

    func test_setPinned_rollsBackOnFailure() async {
        let s = makeSUT()
        s.prefs.updateResult = .failure(NSError(domain: "x", code: 0))
        await s.vm.setPinned(true)
        XCTAssertEqual(s.vm.prefs.isPinned, false)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_addTag_appendsAndPersists() async {
        let s = makeSUT()
        await s.vm.addTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertTrue(s.vm.allTags.contains("urgent"))
        XCTAssertEqual(s.prefs.updateCalls.last?.1.tags, ["urgent"])
    }

    func test_addTag_dedupes() async {
        let s = makeSUT()
        s.vm.prefs.tags = ["urgent"]
        await s.vm.addTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["urgent"])
        XCTAssertEqual(s.prefs.updateCalls.count, 0)
    }

    func test_removeTag_persists() async {
        let s = makeSUT()
        s.vm.prefs.tags = ["urgent", "work"]
        await s.vm.removeTag("urgent")
        XCTAssertEqual(s.vm.prefs.tags, ["work"])
    }

    func test_createCategoryAndSelect_addsAndAssigns() async {
        let s = makeSUT()
        let created = ConversationCategory(id: "new1", name: "Family", color: nil, icon: nil, order: 0, isExpanded: true)
        s.prefs.createCategoryResult = .success(created)

        let result = await s.vm.createCategoryAndSelect(name: "Family")

        XCTAssertEqual(result?.id, "new1")
        XCTAssertEqual(s.vm.categories.contains(where: { $0.id == "new1" }), true)
        XCTAssertEqual(s.vm.prefs.categoryId, "new1")
        XCTAssertEqual(s.prefs.createCategoryCalls.count, 1)
        XCTAssertEqual(s.prefs.updateCalls.last?.1.categoryId, "new1")
    }

    func test_deleteForMe_setsDidDelete() async {
        let s = makeSUT()
        await s.vm.deleteForMe()
        XCTAssertTrue(s.vm.didDelete)
        XCTAssertEqual(s.conv.deleteCalls, ["conv-1"])
    }

    func test_deleteForMe_failureSurfacesError() async {
        let s = makeSUT()
        s.conv.deleteResult = .failure(NSError(domain: "x", code: 0))
        await s.vm.deleteForMe()
        XCTAssertFalse(s.vm.didDelete)
        XCTAssertNotNil(s.vm.errorMessage)
    }

    func test_toggleArchive_flipsAndPersists() async {
        let s = makeSUT()
        await s.vm.toggleArchive()
        XCTAssertEqual(s.vm.prefs.isArchived, true)
        await s.vm.toggleArchive()
        XCTAssertEqual(s.vm.prefs.isArchived, false)
    }
}
```

- [ ] **Step 5: Run + commit**

```bash
./apps/ios/meeshy.sh test --filter ConversationOptionsViewModelTests
```

Expected: 9 tests pass.

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift \
        apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift \
        apps/ios/MeeshyTests/Mocks/MockPreferenceService.swift \
        apps/ios/MeeshyTests/Mocks/MockConversationService.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationOptionsViewModelTests.swift
git commit -m "feat(ios): add ConversationOptionsViewModel for conversation options

@MainActor MVVM owner of conversation preferences. Loads prefs+categories+tags
in parallel, exposes optimistic setters with rollback on failure, and persists
through PreferenceService. Adds createCategoryAndSelect for the inline picker
flow. Mockable via PreferenceServiceProviding + ConversationServiceProviding."
```

---

## Task 7: iOS — Refactor ConversationPreferencesTab to use VM + new components

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`

- [ ] **Step 1: Replace state and bindings**

Replace the local `@State` properties (`isPinned`, `isMuted`, ..., `existingCategories`, `existingTags`, etc.) with `@StateObject private var viewModel: ConversationOptionsViewModel`.

The struct init becomes:

```swift
init(conversation: Conversation, participants: [PaginatedParticipant], accentColor: String) {
    self.conversation = conversation
    self.participants = participants
    self.accentColor = accentColor
    self._viewModel = StateObject(wrappedValue: ConversationOptionsViewModel(conversationId: conversation.id))
}
```

Each toggle's `onChange` now calls a VM method:

```swift
// Pin toggle
Toggle("", isOn: Binding(
    get: { viewModel.prefs.isPinned ?? false },
    set: { val in Task { await viewModel.setPinned(val) } }
))

// Muet
Toggle("", isOn: Binding(
    get: { viewModel.prefs.isMuted ?? false },
    set: { val in Task { await viewModel.setMuted(val) } }
))

// Mentions seulement
Toggle("", isOn: Binding(
    get: { viewModel.prefs.mentionsOnly ?? false },
    set: { val in Task { await viewModel.setMentionsOnly(val) } }
))
.disabled(viewModel.prefs.isMuted ?? false)

// CustomName TextField
TextField("Donner un surnom...", text: Binding(
    get: { viewModel.prefs.customName ?? "" },
    set: { viewModel.setCustomName($0) }
))
```

- [ ] **Step 2: Replace category section with `CategoryPickerField`**

Replace the entire VStack that renders the category input with:

```swift
CategoryPickerField(
    categories: viewModel.categories,
    selectedId: Binding(
        get: { viewModel.prefs.categoryId },
        set: { newId in
            Task { await viewModel.setCategory(newId) }
        }
    ),
    accentColor: Color(hex: accentColor),
    onCreateCategory: { name in
        await viewModel.createCategoryAndSelect(name: name)
    }
)
.padding(.horizontal, 14)
.padding(.vertical, 10)
```

- [ ] **Step 3: Replace tags section with `TagInputField`**

```swift
TagInputField(
    selectedTags: Binding(
        get: { viewModel.prefs.tags ?? [] },
        set: { newTags in
            // Diff-based: detect single add or single remove
            let current = viewModel.prefs.tags ?? []
            let added = newTags.filter { !current.contains($0) }
            let removed = current.filter { !newTags.contains($0) }
            for t in added { Task { await viewModel.addTag(t) } }
            for t in removed { Task { await viewModel.removeTag(t) } }
        }
    ),
    knownTags: viewModel.allTags,
    accentColor: Color(hex: accentColor)
)
.padding(.horizontal, 14)
.padding(.vertical, 10)
```

- [ ] **Step 4: Hook archive / deleteForMe / leave to VM**

```swift
// Archive button
Button { showArchiveConfirm = true } label: {
    settingsRow(
        icon: (viewModel.prefs.isArchived ?? false) ? "archivebox.fill" : "archivebox",
        iconColor: "F59E0B",
        title: (viewModel.prefs.isArchived ?? false) ? "Désarchiver" : "Archiver"
    ) { EmptyView() }
}
.confirmationDialog(...) {
    Button("Confirmer") { Task { await viewModel.toggleArchive() } }
}

// Delete for me
.confirmationDialog(...) {
    Button("Supprimer", role: .destructive) {
        Task {
            await viewModel.deleteForMe()
            if viewModel.didDelete { dismiss() }
        }
    }
}

// Leave
.confirmationDialog(...) {
    Button("Quitter", role: .destructive) {
        Task {
            await viewModel.leave()
            if viewModel.didLeave { dismiss() }
        }
    }
}
```

- [ ] **Step 5: Replace task lifecycle**

```swift
.task { await viewModel.load() }
```

Remove the now-unused `loadPreferences()`, `loadExistingCategoriesAndTags()`, `save(...)`, `setupDebounce()`, `selectCategory(_:)`, `addTag(_:)`, `toggleArchive()`, `leaveConversation()`, `deleteForMe()`, plus all `existingCategories`/`existingTags`/`categoryInput`/`tagInput`/`isPinned`/`isMuted`/`mentionsOnly`/`isArchived`/`customName`/`reaction`/`tags`/`categoryId`/`isLoading`/`isSaving`/`customNameSubject` — all moved to the VM.

Keep the member search section (independent feature).

Display loading state:

```swift
if viewModel.loadState == .loading && viewModel.prefs.tags == nil {
    ProgressView()
} else {
    displaySection
    organizationSection
    notificationsSection
    actionsSection
}
```

- [ ] **Step 6: Build & smoke**

```bash
./apps/ios/meeshy.sh build
```

Expected: clean build, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift
git commit -m "refactor(ios): wire ConversationPreferencesTab through ConversationOptionsViewModel

Replaces the broken local string-based autocomplete with the new
CategoryPickerField + TagInputField components. Eliminates duplicate
loading code, fixes the categoryId-as-name bug, and ensures every
control flows through optimistic+rollback persistence."
```

---

## Task 8: iOS — ConversationListViewModel filters + grouping

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift` (extend if exists)

- [ ] **Step 1: Audit and fix filters**

In `ConversationListViewModel`, locate the filtering switch (around line 232 per earlier audit). Ensure:

```swift
case .archived:
    return base.filter { $0.isArchived }
case .favoris:
    return base.filter { $0.reaction != nil }
```

If `.archived` is currently `!c.isActive`, change it. Verify by reading the full switch.

- [ ] **Step 2: Pass categories cache to grouping**

The VM needs access to user categories (for resolving id→name in headers). Add:

```swift
@Published var categories: [ConversationCategory] = []

private let preferenceService: PreferenceServiceProviding

init(..., preferenceService: PreferenceServiceProviding = PreferenceService.shared) {
    self.preferenceService = preferenceService
    // existing init body
    Task { await self.refreshCategories() }
}

func refreshCategories() async {
    do {
        categories = try await preferenceService.getCategories()
    } catch {
        // non-critical
    }
}
```

In the grouping function, look up category by id:

```swift
private func categoryName(for id: String) -> String {
    categories.first(where: { $0.id == id })?.name ?? "Autre"
}

private func categoryColor(for id: String) -> String? {
    categories.first(where: { $0.id == id })?.color
}
```

If the existing `ConversationSection` enum doesn't carry a name, extend it or replace it with a struct:

```swift
struct ConversationSection: Identifiable, Equatable {
    let id: String         // categoryId or "__other__"
    let name: String
    let color: String?
}
```

The `groupConversations()` function returns `[(ConversationSection, [Conversation])]` where each `ConversationSection.name` is resolved via `categoryName(for: id)`.

- [ ] **Step 3: Subscribe to userPreferencesUpdated socket event**

Already done in the file (line 257). Extend to ALSO update `tags`, `customName`, `reaction`, `categoryId`, `mentionsOnly`, `isArchived` if the event payload carries them:

```swift
messageSocket.userPreferencesUpdated
    .receive(on: DispatchQueue.main)
    .sink { [weak self] event in
        guard let self, let convId = event.conversationId else { return }
        if let idx = conversations.firstIndex(where: { $0.id == convId }) {
            var conv = conversations[idx]
            if let isPinned = event.isPinned { conv.isPinned = isPinned }
            if let isMuted = event.isMuted { conv.isMuted = isMuted }
            // Add fields if the event type carries them; otherwise leave
            conversations[idx] = conv
        }
    }
    .store(in: &cancellables)
```

(Event extension is out of scope for this PR — leave a note in commit.)

- [ ] **Step 4: Tests**

If `ConversationListViewModelTests.swift` exists, add:

```swift
func test_archivedFilter_usesIsArchivedField() {
    let sut = makeSUT()
    sut.conversations = [
        makeConversation(id: "1", isArchived: true),
        makeConversation(id: "2", isArchived: false)
    ]
    sut.activeFilter = .archived
    XCTAssertEqual(sut.filteredConversations.map(\.id), ["1"])
}

func test_groupByCategory_resolvesCategoryName() {
    let sut = makeSUT()
    sut.categories = [
        ConversationCategory(id: "c1", name: "Family", color: "#FF0000", icon: nil, order: 0, isExpanded: true)
    ]
    sut.conversations = [makeConversation(id: "conv1", sectionId: "c1")]
    let groups = sut.groupConversations()
    XCTAssertEqual(groups.first?.0.name, "Family")
}

func test_groupByCategory_unknownIdGoesToOther() {
    let sut = makeSUT()
    sut.conversations = [makeConversation(id: "conv1", sectionId: "ghost-id")]
    let groups = sut.groupConversations()
    XCTAssertTrue(groups.contains { $0.0.id == "__other__" })
}
```

(Adjust factory helpers `makeConversation` to your existing test setup.)

- [ ] **Step 5: Build, run tests, commit**

```bash
./apps/ios/meeshy.sh test --filter ConversationListViewModelTests
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ConversationListViewModelTests.swift
git commit -m "fix(ios): conversation list filters use real preferences fields

- archived filter reads userPreferences.isArchived (was wrongly !isActive)
- group-by-category resolves categoryId to category.name via PreferenceService cache
- unknown / null categoryId falls under 'Autre' section
- adds test coverage for both fixes"
```

---

## Task 9: iOS — ThemedConversationRow customName + reaction + tag chips

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift`

- [ ] **Step 1: Verify the existing inputs**

Read the file head and `init(...)` to understand the `let` parameters list. Add (or confirm) these fields:

```swift
let displayName: String        // already = conversation.title; replace caller to pass customName ?? title
let reactionEmoji: String?
let tags: [String]
```

- [ ] **Step 2: Render reaction emoji + tags chips**

Inside the existing title HStack, after the title text:

```swift
if let r = reactionEmoji, !r.isEmpty {
    Text(r).font(.system(size: 12))
}
```

Below the last-message line (or wherever the snippet sits):

```swift
if !tags.isEmpty {
    HStack(spacing: 4) {
        ForEach(tags.prefix(2), id: \.self) { tag in
            Text(tag)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color(hex: accentColor).opacity(0.12)))
        }
        if tags.count > 2 {
            Text("+\(tags.count - 2)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)
        }
    }
}
```

- [ ] **Step 3: Update call site**

In `ConversationListView.swift`, find the row construction. Replace `title: conversation.title` with `displayName: conversation.customName ?? conversation.title` (or whatever the existing param is). Pass `reactionEmoji: conversation.reaction, tags: conversation.tags.map(\.name)` (or `\.label`, depending on `MeeshyConversationTag`'s actual property — verify).

Note: Looking at `ConversationModels.swift:217`, tags are constructed as `[MeeshyConversationTag]` where each carries a `name` property — pass `tags: conversation.tags.map(\.name)`.

- [ ] **Step 4: Build, smoke, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): conversation row shows customName, reaction emoji, tag chips

The cell now respects the user's customName override, displays a 12pt
emoji next to the title when a reaction is set, and renders up to 2 tag
chips with a +N counter beneath the last-message snippet."
```

---

## Task 10: iOS — Section header with category name + color

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

- [ ] **Step 1: Render section header**

Locate the ForEach that iterates over grouped sections. Replace the section header view with:

```swift
ForEach(groups, id: \.0.id) { section, convs in
    Section {
        ForEach(convs) { conv in
            ThemedConversationRow(...)
        }
    } header: {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: section.color ?? "9CA3AF"))
                .frame(width: 8, height: 8)
            Text(section.name)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)
            Text("(\(convs.count))")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}
```

- [ ] **Step 2: Build, smoke, commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): conversation list section header shows category name + color

Replaces the raw categoryId display with the resolved category name and
its accent color dot. 'Autre' section groups orphaned and uncategorized
conversations."
```

---

## Task 11: Final smoke + build + tests + merge to main

- [ ] **Step 1: Full build**

```bash
./apps/ios/meeshy.sh build
```

Expected: 0 errors, 0 warnings new.

- [ ] **Step 2: Full test suite**

```bash
./apps/ios/meeshy.sh test
cd services/gateway && npm test
```

Expected: all green.

- [ ] **Step 3: Manual smoke (optional but recommended)**

```bash
./apps/ios/meeshy.sh run
```

Manually verify each acceptance criterion from the spec.

- [ ] **Step 4: Merge to main and push**

This step is performed at the worktree level — agent workers stop here and report. The orchestrator handles the merge.

---

## Self-review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| 1.1 conversation-tags endpoint | Task 1 |
| 1.2 categoryId ownership validation | Task 2 |
| 1.3 backend tests | Tasks 1+2 |
| 2.1 SDK createCategory + getMyConversationTags | Task 3 |
| 2.2 SDK tests | Task 3 |
| 3.1 ConversationOptionsViewModel | Task 6 |
| 3.2 Refactor ConversationPreferencesTab | Task 7 |
| 3.3 CategoryPickerField | Task 4 |
| 3.4 TagInputField | Task 5 |
| 3.5 ConversationListViewModel filters/grouping | Task 8 |
| 3.6 ThemedConversationRow customName/reaction/chips | Task 9 |
| 3.7 Section header with name | Task 10 |
| 4 Synchronization | Implicit via Task 6 (optimistic+rollback) |
| 5 Tests | Distributed across tasks |

All spec requirements covered.

**Type consistency check:** `ConversationOptionsViewModel.prefs` is `APIConversationPreferences` with mutable fields (Task 6 step 2). Tests in Task 6 use `MockPreferenceService` which returns the same type. Good.

**Placeholder scan:** No TODO/TBD; the only conditional reference is to verify `Color(hex:)` and `FlowLayout` already exist in MeeshyUI before adding fallbacks — explicit instruction to grep, not a placeholder.

Plan complete. Saved to `docs/superpowers/plans/2026-05-09-conversation-options-finalize.md`.
