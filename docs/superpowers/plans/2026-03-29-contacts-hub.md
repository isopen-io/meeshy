# Contacts Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full contacts management hub with 4 tabs (Contacts, Demandes, Decouvrir, Bloques) accessible from the main menu.

**Architecture:** 4 tab views with per-tab ViewModels, `FriendServiceProviding` protocol for testability, filter chips for contacts, invite via email/SMS in Discover tab. Uses `CollapsibleHeader` from navigation plan.

**Tech Stack:** SwiftUI, MeeshySDK (FriendService, BlockService), Fastify gateway (new endpoints)

**Spec:** `docs/superpowers/specs/2026-03-29-contacts-hub-design.md`

**Depends on:** Navigation & Collapsible Header plan (must be completed first — provides `CollapsibleHeader`, `case .contacts` route, typed `[Route]` path)

---

### Task 1: FriendServiceProviding Protocol

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockFriendService.swift`

- [ ] **Step 1: Add protocol above FriendService class**

In `FriendService.swift`, add before the class declaration:

```swift
public protocol FriendServiceProviding: Sendable {
    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest
    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest
    func deleteRequest(requestId: String) async throws
}
```

Add `: FriendServiceProviding` conformance to the class.

- [ ] **Step 2: Create MockFriendService for tests**

```swift
import MeeshySDK

final class MockFriendService: FriendServiceProviding, @unchecked Sendable {
    var receivedRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var sentRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var respondResult: Result<FriendRequest, Error> = .failure(NSError(domain: "", code: 0))
    var sendRequestResult: Result<FriendRequest, Error> = .failure(NSError(domain: "", code: 0))

    var receivedRequestsCallCount = 0
    var sentRequestsCallCount = 0
    var respondCallCount = 0
    var lastRespondRequestId: String?
    var lastRespondAccepted: Bool?
    var deleteCallCount = 0

    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest {
        try sendRequestResult.get()
    }

    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        receivedRequestsCallCount += 1
        return try receivedRequestsResult.get()
    }

    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        sentRequestsCallCount += 1
        return try sentRequestsResult.get()
    }

    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest {
        respondCallCount += 1
        lastRespondRequestId = requestId
        lastRespondAccepted = accepted
        return try respondResult.get()
    }

    func deleteRequest(requestId: String) async throws {
        deleteCallCount += 1
    }

    func reset() {
        receivedRequestsCallCount = 0
        sentRequestsCallCount = 0
        respondCallCount = 0
        deleteCallCount = 0
        lastRespondRequestId = nil
        lastRespondAccepted = nil
    }
}
```

- [ ] **Step 3: Build SDK tests**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockFriendService.swift
git commit -m "feat(sdk): add FriendServiceProviding protocol + MockFriendService"
```

---

### Task 2: ContactsShared — Shared Helpers

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/ContactsShared.swift`

- [ ] **Step 1: Create shared types and helpers**

```swift
import SwiftUI
import MeeshyUI

enum ContactsTab: String, CaseIterable {
    case contacts = "Contacts"
    case requests = "Demandes"
    case discover = "Decouvrir"
    case blocked = "Bloques"

    var icon: String {
        switch self {
        case .contacts: return "person.2.fill"
        case .requests: return "person.badge.plus"
        case .discover: return "magnifyingglass"
        case .blocked: return "hand.raised.fill"
        }
    }
}

enum ContactFilter: String, CaseIterable {
    case all = "Tous"
    case online = "En ligne"
    case offline = "Hors ligne"
    case phonebook = "Repertoire"
    case affiliates = "Affilies"
}

enum RequestFilter: String, CaseIterable {
    case received = "Recues"
    case sent = "Envoyees"
}

func relativeTime(from date: Date) -> String {
    let interval = Date().timeIntervalSince(date)
    if interval < 60 { return "A l'instant" }
    if interval < 3600 { return "Il y a \(Int(interval / 60))min" }
    if interval < 86400 { return "Il y a \(Int(interval / 3600))h" }
    if interval < 604800 { return "Il y a \(Int(interval / 86400))j" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "fr_FR")
    formatter.dateFormat = "dd MMM"
    return formatter.string(from: date)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/ContactsShared.swift
git commit -m "feat(ios): add contacts shared types and helpers"
```

---

### Task 3: RequestsViewModel + Tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift`
- Create: `apps/ios/MeeshyTests/Unit/Contacts/RequestsViewModelTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class RequestsViewModelTests: XCTestCase {

    private func makeSUT() -> (sut: RequestsViewModel, mock: MockFriendService) {
        let mock = MockFriendService()
        let sut = RequestsViewModel(friendService: mock)
        return (sut, mock)
    }

    func test_loadReceived_success_populatesList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequest.stub(id: "r1", senderId: "s1", status: "pending")
        mock.receivedRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [request], pagination: nil, error: nil)
        )
        await sut.loadReceived()
        XCTAssertEqual(sut.receivedRequests.count, 1)
        XCTAssertEqual(mock.receivedRequestsCallCount, 1)
    }

    func test_loadSent_filtersPendingOnly() async {
        let (sut, mock) = makeSUT()
        let pending = FriendRequest.stub(id: "s1", status: "pending")
        let accepted = FriendRequest.stub(id: "s2", status: "accepted")
        mock.sentRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [pending, accepted], pagination: nil, error: nil)
        )
        await sut.loadSent()
        XCTAssertEqual(sut.sentRequests.count, 1)
        XCTAssertEqual(sut.sentRequests.first?.id, "s1")
    }

    func test_accept_removesFromList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequest.stub(id: "r1", senderId: "s1", status: "pending")
        sut.receivedRequests = [request]
        mock.respondResult = .success(request)
        await sut.accept(requestId: "r1")
        XCTAssertTrue(sut.receivedRequests.isEmpty)
        XCTAssertEqual(mock.lastRespondAccepted, true)
    }

    func test_reject_removesFromList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequest.stub(id: "r1", senderId: "s1", status: "pending")
        sut.receivedRequests = [request]
        mock.respondResult = .success(request)
        await sut.reject(requestId: "r1")
        XCTAssertTrue(sut.receivedRequests.isEmpty)
        XCTAssertEqual(mock.lastRespondAccepted, false)
    }

    func test_cancel_removesFromSentList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequest.stub(id: "s1", status: "pending")
        sut.sentRequests = [request]
        await sut.cancel(requestId: "s1")
        XCTAssertTrue(sut.sentRequests.isEmpty)
        XCTAssertEqual(mock.deleteCallCount, 1)
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement RequestsViewModel**

```swift
import SwiftUI
import MeeshySDK

@MainActor
final class RequestsViewModel: ObservableObject {
    @Published var receivedRequests: [FriendRequest] = []
    @Published var sentRequests: [FriendRequest] = []
    @Published var loadState: LoadState = .idle

    private let friendService: FriendServiceProviding

    init(friendService: FriendServiceProviding = FriendService.shared) {
        self.friendService = friendService
    }

    func loadReceived() async {
        loadState = .loading
        do {
            let response = try await friendService.receivedRequests(offset: 0, limit: 30)
            receivedRequests = response.data
            loadState = .loaded
        } catch {
            loadState = .error("Erreur lors du chargement")
        }
    }

    func loadSent() async {
        do {
            let response = try await friendService.sentRequests(offset: 0, limit: 30)
            sentRequests = response.data.filter { $0.status == "pending" }
        } catch {}
    }

    func accept(requestId: String) async {
        let snapshot = receivedRequests
        receivedRequests.removeAll { $0.id == requestId }
        HapticFeedback.success()
        do {
            let _ = try await friendService.respond(requestId: requestId, accepted: true)
            ToastManager.shared.showSuccess("Connexion acceptee")
        } catch {
            receivedRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'accepter")
        }
    }

    func reject(requestId: String) async {
        let snapshot = receivedRequests
        receivedRequests.removeAll { $0.id == requestId }
        HapticFeedback.medium()
        do {
            let _ = try await friendService.respond(requestId: requestId, accepted: false)
            ToastManager.shared.showSuccess("Demande refusee")
        } catch {
            receivedRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible de refuser")
        }
    }

    func cancel(requestId: String) async {
        let snapshot = sentRequests
        sentRequests.removeAll { $0.id == requestId }
        HapticFeedback.medium()
        do {
            try await friendService.deleteRequest(requestId: requestId)
            ToastManager.shared.showSuccess("Demande annulee")
        } catch {
            sentRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'annuler")
        }
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift apps/ios/MeeshyTests/Unit/Contacts/RequestsViewModelTests.swift
git commit -m "feat(ios): RequestsViewModel with optimistic updates + tests"
```

---

### Task 4: RequestsTab View

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/RequestsTab.swift`

- [ ] **Step 1: Implement RequestsTab**

Implement the view with:
- Sub-filter pills (Recues / Envoyees)
- Received request rows with accept/reject buttons
- Sent request rows with cancel button
- Empty states
- Uses `RequestsViewModel`

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/RequestsTab.swift
git commit -m "feat(ios): RequestsTab view with received/sent sub-filters"
```

---

### Task 5: BlockedViewModel + BlockedTab

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift`
- Create: `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift`

- [ ] **Step 1: Implement BlockedViewModel**

Uses `BlockServiceProviding` (already has protocol). Loads blocked users, unblock with optimistic update.

- [ ] **Step 2: Implement BlockedTab view**

Blocked user rows with unblock button + confirmation alert. Empty state.

- [ ] **Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift apps/ios/Meeshy/Features/Contacts/BlockedTab.swift
git commit -m "feat(ios): BlockedViewModel + BlockedTab view"
```

---

### Task 6: ContactsListTab (V1 — Placeholder with Chip UI)

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`

- [ ] **Step 1: Implement ContactsListTab**

V1 implementation:
- Filter chips UI (Tous, En ligne, Hors ligne, Repertoire, Affilies)
- "Repertoire" and "Affilies" show "Bientot disponible" placeholder
- Contacts list using `receivedRequests(status=accepted)` + `sentRequests(status=accepted)` merged and deduplicated
- Contact rows with presence indicators
- Tap opens UserProfileSheet

Note: V1 uses merged accepted requests as data source. V2 will use the dedicated `GET /friends` endpoint.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift
git commit -m "feat(ios): ContactsListTab with filter chips (V1 data source)"
```

---

### Task 7: DiscoverTab (Invite + Search)

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift`
- Create: `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift`

- [ ] **Step 1: Implement DiscoverViewModel**

- Email invite (calls future API or shows toast for now)
- SMS invite (opens MFMessageComposeViewController)
- User search via `UserService.shared.search(query:)`
- Connection status resolution against local data

- [ ] **Step 2: Implement DiscoverTab view**

- Email invite card with text field + send button
- SMS invite card with text field + "Choisir un contact" button
- "Importer mes contacts" button (V1: placeholder)
- Search section with results list

- [ ] **Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift
git commit -m "feat(ios): DiscoverTab with invite + user search"
```

---

### Task 8: ContactsHubView — Full Implementation

**Files:**
- Modify: `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift` (replace placeholder)

- [ ] **Step 1: Replace placeholder with full tab implementation**

- CollapsibleHeader with "Contacts" title
- 4 tab bar with animated underline indicator
- Tab content switching (Contacts, Requests, Discover, Blocked)
- Badge on Demandes tab for pending count
- Swipeable tabs via gesture or TabView

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift
git commit -m "feat(ios): ContactsHubView with 4 tabs, animated tab bar, collapsible header"
```

---

### Task 9: Update ProfileView + Deprecate FriendRequestListView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

- [ ] **Step 1: Update ProfileView friend requests button**

Change `router.push(.friendRequests)` to `router.push(.contacts)` in `friendRequestsSection`. The contacts hub opens on the Demandes tab by default when coming from this button.

- [ ] **Step 2: Add deprecation comment to FriendRequestListView**

Add `// @deprecated — Replaced by ContactsHubView > RequestsTab` at top of file. Do not delete yet.

- [ ] **Step 3: Build and full test**

Run: `./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test`
Expected: Build succeeded, all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ProfileView.swift apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift
git commit -m "feat(ios): ProfileView navigates to contacts hub, deprecate FriendRequestListView"
```

---

### Task 10: Final Integration Build + Xcode Project

**Files:**
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (auto via Xcode or build)

- [ ] **Step 1: Ensure all new files are in Xcode project**

Run `./apps/ios/meeshy.sh build` — if files are missing from the project, add them.

- [ ] **Step 2: Full test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: All tests pass

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(ios): contacts hub complete — 4 tabs, filter chips, invite, search"
```
