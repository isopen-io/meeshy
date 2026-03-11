# Participant List: Cache, Pagination & Admin Role Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 bugs in participant list: broken admin role detection, eager full-list loading, and missing SDK cache.

**Architecture:** Gateway adds `currentUserRole` field to conversation list response. New SDK `ParticipantCacheManager` actor handles paginated loading and caching. iOS views consume cache with infinite scroll. Socket.IO events invalidate cache entries.

**Tech Stack:** Fastify/Prisma (gateway), Swift actor (SDK cache), SwiftUI LazyVStack + onAppear (infinite scroll), Socket.IO Combine publishers (cache invalidation)

---

## Task 1: Gateway — Add `currentUserRole` to conversation list response

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:360-464`

**Context:** The `GET /conversations` Prisma query (line 265) uses `take: 5` on participants. For large groups (217+ members), the current user may not be in the first 5, so `currentUserRole` ends up `nil` in the SDK. We need a dedicated batch query.

**Step 1: Add batch query for current user's participant records**

After the main conversation query (after line 358), add a batch Prisma query that fetches the current user's participant record for all returned conversations:

```typescript
// After line 358 (after const conversations = await prisma.conversation.findMany(...))
// Batch query: get current user's role in all returned conversations
const conversationIds = conversations.map(c => c.id);
const currentUserParticipants = userId ? await prisma.participant.findMany({
  where: {
    conversationId: { in: conversationIds },
    userId: userId,
    isActive: true
  },
  select: {
    conversationId: true,
    role: true
  }
}) : [];
const currentUserRoleMap = new Map(
  currentUserParticipants.map(p => [p.conversationId, p.role])
);
```

Note: `conversationIds` is already declared at line 362 — reuse it instead of redeclaring. Move this new code right after the existing `const conversationIds = conversations.map(c => c.id);` line.

**Step 2: Merge `currentUserRole` into conversation response**

In the response mapping (line 457), add the field:

```typescript
return {
  ...conversation,
  participants: membersWithUser,
  title: displayTitle,
  lastMessage: conversation.messages[0] || null,
  unreadCount,
  currentUserRole: currentUserRoleMap.get(conversation.id) || null  // NEW
};
```

**Step 3: Verify with curl**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/conversations?limit=5" | jq '.data[0].currentUserRole'
```

Expected: `"ADMIN"` or `"MEMBER"` etc. (not null for conversations the user belongs to)

**Step 4: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts
git commit -m "fix(gateway): add currentUserRole field to conversation list response

Batch query ensures the current user's role is always returned,
even for large groups where take:5 may not include them."
```

---

## Task 2: SDK — Use `currentUserRole` from API response

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`

**Context:** `APIConversation` already has `participants` (take 5) from which `currentUserRole` is derived. But for 217-member groups, the user isn't in those 5. The gateway now sends a dedicated `currentUserRole` field.

**Step 1: Add `currentUserRole` to `APIConversation`**

In `ConversationModels.swift` (after line 76, before `let createdAt`):

```swift
public let currentUserRole: String?  // Dedicated field from gateway (not derived from participants)
```

**Step 2: Update `toConversation()` to prioritize dedicated field**

Change line 105 from:
```swift
let currentRole = participants?.first(where: { $0.userId == currentUserId })?.role
```
To:
```swift
let currentRole = currentUserRole ?? participants?.first(where: { $0.userId == currentUserId })?.role
```

This gives priority to the dedicated gateway field, falling back to participant-derived role for backward compatibility.

**Step 3: Build to verify**

```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```

Expected: Build succeeds. `Decodable` auto-synthesis handles the new optional field (decodes to `nil` if absent from older API responses).

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift
git commit -m "fix(sdk): use dedicated currentUserRole field from gateway

Prioritizes the gateway-provided currentUserRole over participants-derived
role, fixing admin detection for large groups (217+ members)."
```

---

## Task 3: SDK — Create `ParticipantCacheManager` actor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift`

**Context:** Follow `MediaCacheManager` actor pattern. The cache stores participants per conversation with pagination state. Both `ConversationInfoSheet` and `ParticipantsView` read from it.

**Step 1: Create the actor**

```swift
import Foundation

// MARK: - Participant Page State

public struct ParticipantPageState: Sendable {
    public var participants: [APIParticipant]
    public var nextCursor: String?
    public var hasMore: Bool
    public var totalCount: Int?
    public var lastFetchedAt: Date

    public init(
        participants: [APIParticipant] = [],
        nextCursor: String? = nil,
        hasMore: Bool = true,
        totalCount: Int? = nil,
        lastFetchedAt: Date = Date()
    ) {
        self.participants = participants
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.totalCount = totalCount
        self.lastFetchedAt = lastFetchedAt
    }
}

// MARK: - Pagination Response (matches gateway response shape)

public struct ParticipantPageResponse: Decodable, Sendable {
    public let success: Bool
    public let data: [APIParticipant]
    public let pagination: ParticipantPagination?

    public struct ParticipantPagination: Decodable, Sendable {
        public let nextCursor: String?
        public let hasMore: Bool
        public let totalCount: Int?
    }
}

// MARK: - ParticipantCacheManager

public actor ParticipantCacheManager {
    public static let shared = ParticipantCacheManager()

    private var cache: [String: ParticipantPageState] = [:]
    private let pageSize = 30
    private let staleTTL: TimeInterval = 300 // 5 minutes

    // MARK: - Read

    public func cachedState(for conversationId: String) -> ParticipantPageState? {
        cache[conversationId]
    }

    public func cachedParticipants(for conversationId: String) -> [APIParticipant] {
        cache[conversationId]?.participants ?? []
    }

    public func hasMore(for conversationId: String) -> Bool {
        cache[conversationId]?.hasMore ?? true
    }

    public func isStale(for conversationId: String) -> Bool {
        guard let state = cache[conversationId] else { return true }
        return Date().timeIntervalSince(state.lastFetchedAt) > staleTTL
    }

    // MARK: - Load

    public func loadNextPage(for conversationId: String) async throws -> [APIParticipant] {
        let state = cache[conversationId]
        if let state, !state.hasMore { return state.participants }

        let cursor = state?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor {
            endpoint += "&cursor=\(cursor)"
        }

        let response: ParticipantPageResponse = try await APIClient.shared.request(endpoint: endpoint)
        guard response.success else { return state?.participants ?? [] }

        var updated = state ?? ParticipantPageState()
        updated.participants.append(contentsOf: response.data)
        updated.nextCursor = response.pagination?.nextCursor
        updated.hasMore = response.pagination?.hasMore ?? false
        updated.totalCount = response.pagination?.totalCount ?? updated.totalCount
        updated.lastFetchedAt = Date()

        cache[conversationId] = updated
        return updated.participants
    }

    public func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [APIParticipant] {
        if !forceRefresh, let state = cache[conversationId], !isStale(for: conversationId) {
            return state.participants
        }
        cache[conversationId] = nil
        return try await loadNextPage(for: conversationId)
    }

    // MARK: - Mutations (from Socket.IO events)

    public func updateRole(conversationId: String, participantId: String, newRole: String) {
        guard var state = cache[conversationId] else { return }
        if let idx = state.participants.firstIndex(where: { $0.id == participantId }) {
            var updated = state.participants[idx]
            // APIParticipant.role is let — need to rebuild
            state.participants[idx] = APIParticipant(
                id: updated.id, conversationId: updated.conversationId,
                type: updated.type, userId: updated.userId,
                displayName: updated.displayName, avatar: updated.avatar,
                role: newRole.lowercased(), language: updated.language,
                permissions: updated.permissions, isActive: updated.isActive,
                isOnline: updated.isOnline, joinedAt: updated.joinedAt,
                leftAt: updated.leftAt, bannedAt: updated.bannedAt,
                nickname: updated.nickname, lastActiveAt: updated.lastActiveAt,
                user: updated.user
            )
            cache[conversationId] = state
        }
    }

    public func removeParticipant(conversationId: String, participantId: String) {
        guard var state = cache[conversationId] else { return }
        state.participants.removeAll { $0.id == participantId }
        if let total = state.totalCount { state.totalCount = total - 1 }
        cache[conversationId] = state
    }

    public func addParticipant(conversationId: String, participant: APIParticipant) {
        guard var state = cache[conversationId] else { return }
        guard !state.participants.contains(where: { $0.id == participant.id }) else { return }
        state.participants.insert(participant, at: 0)
        if let total = state.totalCount { state.totalCount = total + 1 }
        cache[conversationId] = state
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) {
        cache.removeValue(forKey: conversationId)
    }

    public func invalidateAll() {
        cache.removeAll()
    }
}
```

**Step 2: Ensure `APIParticipant` has a public memberwise init**

In `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`, add an explicit `public init` to `APIParticipant` (needed for the `updateRole` rebuild):

```swift
public init(
    id: String, conversationId: String, type: ParticipantType,
    userId: String?, displayName: String, avatar: String?,
    role: String, language: String, permissions: ParticipantPermissions,
    isActive: Bool, isOnline: Bool?, joinedAt: Date,
    leftAt: Date?, bannedAt: Date?, nickname: String?,
    lastActiveAt: Date?, user: APIConversationUser?
) {
    self.id = id; self.conversationId = conversationId; self.type = type
    self.userId = userId; self.displayName = displayName; self.avatar = avatar
    self.role = role; self.language = language; self.permissions = permissions
    self.isActive = isActive; self.isOnline = isOnline; self.joinedAt = joinedAt
    self.leftAt = leftAt; self.bannedAt = bannedAt; self.nickname = nickname
    self.lastActiveAt = lastActiveAt; self.user = user
}
```

**Step 3: Build to verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/ParticipantCacheManager.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift
git commit -m "feat(sdk): add ParticipantCacheManager actor for paginated participant loading

Provides shared cache across views with pagination state, mutation
support for socket events, and 5-minute TTL staleness check."
```

---

## Task 4: iOS — Refactor `ConversationInfoSheet` to use cache + first page only

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Context:** Currently loads ALL participants eagerly. Change to load first page (30) from `ParticipantCacheManager`, show preview, delegate full list to `ParticipantsView`.

**Step 1: Replace local `loadParticipants()` with cache call**

Replace the entire `loadParticipants()` function (lines 917-949) with:

```swift
private func loadParticipants() async {
    isLoadingParticipants = true
    defer { isLoadingParticipants = false }

    do {
        let cached = await ParticipantCacheManager.shared.cachedParticipants(for: conversation.id)
        let isStale = await ParticipantCacheManager.shared.isStale(for: conversation.id)

        if !cached.isEmpty && !isStale {
            participants = cached.map { $0.toConversationParticipant() }
            return
        }

        let fetched = try await ParticipantCacheManager.shared.loadFirstPage(
            for: conversation.id,
            forceRefresh: isStale
        )
        participants = fetched.map { $0.toConversationParticipant() }
    } catch {
        // Silently fail — show empty
    }
}
```

**Step 2: Add `toConversationParticipant()` extension on `APIParticipant`**

In `ConversationInfoSheet.swift`, add after the `ConversationParticipant` struct (after line 24):

```swift
extension APIParticipant {
    func toConversationParticipant() -> ConversationParticipant {
        ConversationParticipant(
            id: id,
            userId: userId,
            username: user?.username,
            firstName: nil,
            lastName: nil,
            displayName: displayName,
            avatar: resolvedAvatar,
            conversationRole: role,
            isOnline: isOnline,
            lastActiveAt: lastActiveAt,
            joinedAt: joinedAt
        )
    }
}
```

**Step 3: Build to verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "refactor(ios): ConversationInfoSheet uses ParticipantCacheManager

Loads first page from SDK cache instead of fetching all participants.
Shares cache with ParticipantsView to avoid duplicate API calls."
```

---

## Task 5: iOS — Refactor `ParticipantsView` with infinite scroll + cache

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`

**Context:** Currently loads all participants in a `while hasMore` loop. Change to load from cache, with infinite scroll loading more pages as user scrolls.

**Step 1: Add pagination state properties**

Add after line 24 (after `@State private var errorMessage: String?`):

```swift
@State private var isLoadingMore = false
@State private var hasMore = true
```

**Step 2: Replace `loadParticipants()` with first-page load**

Replace the entire `loadParticipants()` function (lines 468-501) with:

```swift
private func loadParticipants() async {
    isLoading = true
    defer { isLoading = false }

    do {
        let fetched = try await ParticipantCacheManager.shared.loadFirstPage(
            for: conversationId,
            forceRefresh: true
        )
        participants = fetched.map { $0.toConversationParticipant() }
        hasMore = await ParticipantCacheManager.shared.hasMore(for: conversationId)
    } catch {
        Logger.participants.error("Failed to load participants: \(error.localizedDescription)")
    }
}
```

**Step 3: Add `loadMoreIfNeeded()` function**

Add after `loadParticipants()`:

```swift
private func loadMoreIfNeeded(currentItem: ConversationParticipant) async {
    guard hasMore, !isLoadingMore else { return }
    guard currentItem.id == participants.last?.id else { return }

    isLoadingMore = true
    defer { isLoadingMore = false }

    do {
        let allFetched = try await ParticipantCacheManager.shared.loadNextPage(for: conversationId)
        participants = allFetched.map { $0.toConversationParticipant() }
        hasMore = await ParticipantCacheManager.shared.hasMore(for: conversationId)
    } catch {
        Logger.participants.error("Failed to load more: \(error.localizedDescription)")
    }
}
```

**Step 4: Add `onAppear` trigger + loading indicator in the member list**

In the `memberList` `LazyVStack` (around line 197-214), modify the `ForEach`:

```swift
LazyVStack(spacing: 0) {
    ForEach(participants) { participant in
        participantRow(participant)
            .onAppear {
                Task { await loadMoreIfNeeded(currentItem: participant) }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if canRemoveParticipant(participant) {
                    Button(role: .destructive) {
                        confirmRemoveUserId = participant.id
                    } label: {
                        Label("Retirer", systemImage: "person.badge.minus")
                    }
                }
            }
            .contextMenu {
                contextMenuItems(for: participant)
            }
    }

    if isLoadingMore {
        HStack {
            Spacer()
            ProgressView()
                .padding(.vertical, 16)
            Spacer()
        }
    }
}
```

**Step 5: Update `removeParticipant()` to also update cache**

In `removeParticipant(userId:)` (line 503-516), add cache update after local removal:

```swift
private func removeParticipant(userId: String) async {
    do {
        let _: APIResponse<[String: String]> = try await APIClient.shared.request(
            endpoint: "/conversations/\(conversationId)/participants/\(userId)",
            method: "DELETE"
        )
        HapticFeedback.success()
        let removedId = participants.first(where: { $0.id == userId })?.id ?? userId
        participants.removeAll { $0.id == userId }
        await ParticipantCacheManager.shared.removeParticipant(
            conversationId: conversationId,
            participantId: removedId
        )
    } catch {
        Logger.participants.error("Failed to remove participant: \(error.localizedDescription)")
        HapticFeedback.error()
        errorMessage = "Impossible de retirer ce membre."
    }
}
```

**Step 6: Update `changeRole()` to also update cache**

In `changeRole(userId:newRole:)` (line 518-533), replace `await loadParticipants()` with cache update:

```swift
private func changeRole(userId: String, newRole: String) async {
    struct RoleBody: Encodable { let role: String }
    do {
        let body = try JSONEncoder().encode(RoleBody(role: newRole))
        let _: APIResponse<[String: String]> = try await APIClient.shared.request(
            endpoint: "/conversations/\(conversationId)/participants/\(userId)/role",
            method: "PATCH",
            body: body
        )
        HapticFeedback.success()
        if let idx = participants.firstIndex(where: { $0.id == userId }) {
            participants[idx].conversationRole = newRole.lowercased()
        }
        await ParticipantCacheManager.shared.updateRole(
            conversationId: conversationId,
            participantId: userId,
            newRole: newRole
        )
    } catch {
        Logger.participants.error("Failed to change role: \(error.localizedDescription)")
        HapticFeedback.error()
    }
}
```

**Step 7: Update socket handler to also update cache**

In the `.onReceive` for `participantRoleUpdated` (lines 105-113), add cache update:

```swift
.onReceive(
    MessageSocketManager.shared.participantRoleUpdated
        .filter { $0.conversationId == conversationId }
        .receive(on: DispatchQueue.main)
) { event in
    if let idx = participants.firstIndex(where: { $0.id == event.participant.id }) {
        participants[idx].conversationRole = event.newRole.lowercased()
    }
    Task {
        await ParticipantCacheManager.shared.updateRole(
            conversationId: conversationId,
            participantId: event.participant.id,
            newRole: event.newRole
        )
    }
}
```

**Step 8: Build to verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 9: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift
git commit -m "feat(ios): infinite scroll in ParticipantsView with SDK cache

Loads 30 participants per page via ParticipantCacheManager.
Triggers next page load on last item onAppear. Cache mutations
(remove, role change) update both local state and SDK cache."
```

---

## Task 6: iOS — Socket.IO cache invalidation for join/leave events

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`

**Context:** Events `conversation:joined` and `conversation:left` already exist in the socket event types. We need to listen for them and invalidate the cache.

**Step 1: Check if `MessageSocketManager` already publishes join/leave events**

Search for `conversationJoined` or `conversationLeft` publisher in `MessageSocketManager.swift`. If not present, we need to add Combine publishers.

**Step 2: If publishers don't exist, add them to `MessageSocketManager`**

In `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`, add:

```swift
// Publishers
public let conversationJoinedPublisher = PassthroughSubject<ConversationParticipationEvent, Never>()
public let conversationLeftPublisher = PassthroughSubject<ConversationParticipationEvent, Never>()

// Event struct
public struct ConversationParticipationEvent: Sendable {
    public let conversationId: String
    public let userId: String
}
```

And register the socket listeners:

```swift
socket.on("conversation:joined") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let conversationId = dict["conversationId"] as? String,
          let userId = dict["userId"] as? String else { return }
    self?.conversationJoinedPublisher.send(
        ConversationParticipationEvent(conversationId: conversationId, userId: userId)
    )
}

socket.on("conversation:left") { [weak self] data, _ in
    guard let dict = data.first as? [String: Any],
          let conversationId = dict["conversationId"] as? String,
          let userId = dict["userId"] as? String else { return }
    self?.conversationLeftPublisher.send(
        ConversationParticipationEvent(conversationId: conversationId, userId: userId)
    )
}
```

**Step 3: Add listeners in `ParticipantsView`**

After the existing `.onReceive` for `participantRoleUpdated`, add:

```swift
.onReceive(
    MessageSocketManager.shared.conversationJoinedPublisher
        .filter { $0.conversationId == conversationId }
        .receive(on: DispatchQueue.main)
) { _ in
    Task {
        await ParticipantCacheManager.shared.invalidate(conversationId: conversationId)
        await loadParticipants()
    }
}
.onReceive(
    MessageSocketManager.shared.conversationLeftPublisher
        .filter { $0.conversationId == conversationId }
        .receive(on: DispatchQueue.main)
) { event in
    participants.removeAll { $0.userId == event.userId }
    Task {
        await ParticipantCacheManager.shared.invalidate(conversationId: conversationId)
    }
}
```

**Step 4: Build to verify**

```bash
./apps/ios/meeshy.sh build
```

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift \
       apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift \
       apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift
git commit -m "feat(ios): socket.IO cache invalidation for participant join/leave

Listens for conversation:joined and conversation:left events.
Invalidates ParticipantCacheManager on member changes."
```

---

## Task 7: Final verification

**Step 1: Full build**

```bash
./apps/ios/meeshy.sh build
```

**Step 2: Test on device/simulator**

1. Login as `atabeth` on staging
2. Open Meeshy Global conversation info → verify only ~30 members load initially
3. Open "Gerer les membres" → verify admin actions (promote/demote/remove) are visible
4. Scroll down in member list → verify more members load progressively
5. Go back to info sheet → verify members are cached (no reload)
6. Close and reopen info sheet → verify cache is used (fast load, no network if < 5min)

**Step 3: Commit all remaining changes**

If any adjustments were needed during testing, commit them.
