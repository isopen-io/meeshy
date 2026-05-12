# EditProfileViewModel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `EditProfileViewModel` from `EditProfileView.swift` (549 lignes) and apply the Phase 4 B5 optimistic+rollback pattern so that displayName/bio/avatar updates propagate live to every surface observing `AuthManager.currentUserPublisher`, with rollback via `OfflineQueue.outcomeStream(for:)` on `.exhausted`.

**Architecture:** MVVM pure — `@MainActor` `EditProfileViewModel: ObservableObject` injects 7 protocols (AuthManaging, OfflineQueueing, AttachmentUploading, ProfileCacheWriting, Sleeping, ToastSurfacing, HapticSurfacing). The VM owns optimistic apply via `AuthManager.applyLocalProfileChanges(...)` which reconstructs `MeeshyUser` via memberwise init (struct with `let` fields, helper extension `withProfileChanges`). Snapshot returned from apply is restored on enqueue throw or outcome `.exhausted`. EditProfileView becomes pure SwiftUI (~280 lines).

**Tech Stack:** Swift 6.2, SwiftUI, XCTest, MeeshySDK actor (OfflineQueue), GRDBCacheStore (CacheCoordinator.profiles).

**Spec:** `docs/superpowers/specs/2026-05-12-edit-profile-viewmodel-design.md` (commits `b6265097` + `7fdb183d`).

**Worktree:** Toute l'implémentation se fait dans `.claude/worktrees/feat+edit-profile-vm/` (branche `feat/edit-profile-vm`), créée au démarrage via `superpowers:using-git-worktrees`.

---

## File Structure

### New files (5)

| File | Responsibility |
|------|----------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift` | Pure extension `withProfileChanges(displayName:bio:avatar:) -> MeeshyUser`. Reconstructs the struct via memberwise init. |
| `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift` | `@MainActor ObservableObject` (~250 LOC). Owns input bindings, SaveState machine, `saveProfile(onDismiss:)`, `loadSelectedPhoto(_:)`, `observeOutcome(cmid:snapshot:)`. |
| `apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift` | Concrete + protocol `AttachmentUploading`. Multipart upload + JPEG compression. Extracted verbatim from `EditProfileView`. |
| `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift` | 16 `XCTestCase` methods using factory `makeSUT()` with full doubles graph. |
| `apps/ios/MeeshyTests/Mocks/MockAttachmentUploader.swift` | `AttachmentUploading` mock with `uploadAvatarResult: Result<URL, Error>` + call counts. |

### Modified files (4)

| File | Change |
|------|--------|
| `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift` | + protocol members `applyLocalProfileChanges(displayName:bio:avatarUrl:) -> ProfileSnapshot`, `restoreLocalProfileSnapshot(_:)` + `public struct ProfileSnapshot: Sendable, Equatable` + impl. |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` | + protocol `OfflineQueueing` and `extension OfflineQueue: OfflineQueueing {}` (conformance only; no behavior change). |
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` | + protocol `ProfileCacheWriting` and conformance via extension that routes to `profiles.save([user], for: userId)`. |
| `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift` | Refactor 549 → ~280 LOC. Strip `@State` business fields, delegate to `@StateObject var viewModel`. |
| `apps/ios/MeeshyTests/Mocks/MockAuthManager.swift` | + impl of new `AuthManaging` members + tracking storage. |
| `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift` | Fix L144: `.content` → `.text` (StoryTextObject renamed). |

### New utility/protocol files in app target (4 small files)

| File | Responsibility |
|------|----------------|
| `apps/ios/Meeshy/Features/Main/Services/Sleeping.swift` | `protocol Sleeping`, `final class SystemSleeper` (wraps `Task.sleep`). |
| `apps/ios/Meeshy/Features/Main/Services/ToastSurfacing.swift` | `protocol ToastSurfacing` + `extension ToastManager: ToastSurfacing {}`. |
| `apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift` | `protocol HapticSurfacing`, `final class HapticBridge` calling `HapticFeedback.success()/.error()`. |
| `apps/ios/MeeshyTests/Mocks/MockEditProfileDoubles.swift` | Bundled mocks for the 5 thin protocols (OfflineQueue, ProfileCache, Sleeper, Toast, Haptic). Single file to keep test scaffolding compact. |

---

## Sanity checks before starting

- Repo root: `/Users/smpceo/Documents/v2_meeshy`
- iOS build script (always use it): `./apps/ios/meeshy.sh build` / `./apps/ios/meeshy.sh test`
- Bundle ID: `me.meeshy.app`
- Worktree path convention: `.claude/worktrees/feat+edit-profile-vm/`

---

## Task 0: Worktree setup

**Files:** none yet (creates worktree)

- [ ] **Step 1: Create worktree from main**

Run from repo root `/Users/smpceo/Documents/v2_meeshy`:

```bash
git worktree add ../v2_meeshy-edit-profile-vm -b feat/edit-profile-vm main
```

Expected: new directory `../v2_meeshy-edit-profile-vm` containing a checkout on branch `feat/edit-profile-vm`.

- [ ] **Step 2: Switch to worktree**

```bash
cd ../v2_meeshy-edit-profile-vm
```

Subsequent tasks assume this is the working directory.

- [ ] **Step 3: Verify build baseline**

```bash
./apps/ios/meeshy.sh build
```

Expected: build succeeds (0 errors, warnings tolerated).

---

## Task 1: Fix `StoryRepostFlowTests.swift:144` (test bundle prereq #1)

**Files:**
- Modify: `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift:144`

- [ ] **Step 1: Read the failing line for context**

```bash
sed -n '140,148p' apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift
```

Expected output includes:

```
XCTAssertTrue(lockedBadges.first?.content.contains("@alice") == true,
              "Badge mentions the original author handle")
```

- [ ] **Step 2: Apply the fix**

Replace at line 144:

```swift
        XCTAssertTrue(lockedBadges.first?.content.contains("@alice") == true,
```

With:

```swift
        XCTAssertTrue(lockedBadges.first?.text.contains("@alice") == true,
```

`content` is no longer a stored property on `StoryTextObject` (renamed to `text`, see `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:206`). The legacy CodingKey `content` is preserved only for JSON decoding.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift
git commit -m "fix(ios/tests): StoryRepostFlowTests use renamed StoryTextObject.text

content was renamed to text in StoryModels.swift:206 ; content remains
only as a decoder CodingKey alias. Direct property access requires the
new name."
```

---

## Task 2: Diagnose + fix remaining test bundle compile errors

**Files:** unknown at this point — discovered by running tests.

- [ ] **Step 1: Run tests, capture output**

```bash
./apps/ios/meeshy.sh test 2>&1 | tee /tmp/meeshy-test-output.log | grep -E "error:|warning:" | head -50
```

Expected: zero, one, or several compile errors. If zero, tests should be running.

- [ ] **Step 2: For each compile error, fix the call site**

Read the actual error message. The memory note `*ViewModelTests async save() sans try?` suggests a call site like `await viewModel.save()` where `save` is `throws` — fix would be `try? await viewModel.save()` or `try await viewModel.save()` (depending on whether the test asserts the throw).

For each error:
1. Read the file at the indicated line.
2. Apply the minimal fix.
3. Re-run the test command.
4. Repeat until tests start executing (pass or fail at runtime, not compile).

- [ ] **Step 3: Commit each fix in a single commit per file or one consolidated commit**

```bash
git add apps/ios/MeeshyTests/<files>
git commit -m "fix(ios/tests): unblock test bundle compile

<one-line per fix>"
```

- [ ] **Step 4: Verify test bundle runs**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -20
```

Expected: output contains `Test Suite '...' started` / `passed` / `failed`. Not a compile abort.

---

## Task 3: `MeeshyUser+ProfileMutation` extension (TDD)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserProfileMutationTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserProfileMutationTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class MeeshyUserProfileMutationTests: XCTestCase {

    private func makeUser() -> MeeshyUser {
        MeeshyUser(
            id: "u1", username: "alice",
            email: "a@b.com", firstName: "Alice", lastName: "Smith",
            displayName: "Alice", bio: "Hello world", avatar: "https://cdn/old.jpg",
            banner: "https://cdn/banner.jpg", role: "USER",
            systemLanguage: "fr", regionalLanguage: "en"
        )
    }

    func test_withProfileChanges_updatesOnlySpecifiedFields() {
        let user = makeUser()
        let updated = user.withProfileChanges(
            displayName: "Bob",
            bio: nil,
            avatar: "https://cdn/new.jpg"
        )

        XCTAssertEqual(updated.displayName, "Bob")
        XCTAssertEqual(updated.bio, "Hello world", "nil = unchanged, not erase")
        XCTAssertEqual(updated.avatar, "https://cdn/new.jpg")
        XCTAssertEqual(updated.id, user.id)
        XCTAssertEqual(updated.username, user.username)
        XCTAssertEqual(updated.email, user.email)
        XCTAssertEqual(updated.firstName, user.firstName)
        XCTAssertEqual(updated.banner, user.banner)
        XCTAssertEqual(updated.systemLanguage, user.systemLanguage)
    }

    func test_withProfileChanges_allNil_returnsEquivalentUser() {
        let user = makeUser()
        let updated = user.withProfileChanges(
            displayName: nil, bio: nil, avatar: nil
        )

        XCTAssertEqual(updated.displayName, user.displayName)
        XCTAssertEqual(updated.bio, user.bio)
        XCTAssertEqual(updated.avatar, user.avatar)
        XCTAssertEqual(updated.id, user.id)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MeeshyUserProfileMutationTests \
  -quiet 2>&1 | tail -20
```

Expected: compile error "`MeeshyUser` has no member `withProfileChanges`".

- [ ] **Step 3: Implement the extension**

Create `packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift`:

```swift
import Foundation

extension MeeshyUser {

    /// Returns a new `MeeshyUser` with the three profile-editable fields
    /// optionally overwritten. `nil` for any field means "leave unchanged"
    /// (aligned with `UpdateProfilePayload` PATCH semantics).
    ///
    /// All 25 other fields are copied verbatim via memberwise init —
    /// `MeeshyUser` is a struct with `let` fields, so this is the only
    /// way to "mutate" it.
    public func withProfileChanges(
        displayName: String?,
        bio: String?,
        avatar: String?
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: username,
            email: email,
            firstName: firstName,
            lastName: lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar ?? self.avatar,
            banner: banner,
            role: role,
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            isOnline: isOnline,
            lastActiveAt: lastActiveAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive,
            deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous,
            isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt,
            phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic
        )
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MeeshyUserProfileMutationTests \
  -quiet 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **` with 2 tests run.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserProfileMutationTests.swift
git commit -m "feat(sdk/auth): MeeshyUser.withProfileChanges memberwise rebuilder

Spec 2026-05-12 EditProfileViewModel — MeeshyUser is a struct with let
fields, so optimistic profile mutation must reconstruct a new instance.
withProfileChanges keeps 25 fields verbatim and overlays the 3 editable
fields when non-nil (nil = unchanged, aligned with UpdateProfilePayload
PATCH semantics)."
```

---

## Task 4: `ProfileSnapshot` + `AuthManaging` protocol extension

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`

- [ ] **Step 1: Add `ProfileSnapshot` and protocol methods**

In `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`, immediately above the `public protocol AuthManaging` declaration (currently line 7), insert:

```swift
/// Immutable capture of the three profile-editable fields, returned by
/// `AuthManaging.applyLocalProfileChanges` and consumed by
/// `restoreLocalProfileSnapshot` for optimistic-rollback flows.
public struct ProfileSnapshot: Sendable, Equatable {
    public let displayName: String?
    public let bio: String?
    public let avatarUrl: String?

    public init(displayName: String?, bio: String?, avatarUrl: String?) {
        self.displayName = displayName
        self.bio = bio
        self.avatarUrl = avatarUrl
    }
}
```

- [ ] **Step 2: Extend the `AuthManaging` protocol**

In the same file, inside `public protocol AuthManaging: AnyObject { ... }`, just before the closing brace, add:

```swift
    /// Applies up to three profile field changes locally, without any
    /// network call. `nil` for a field means "leave unchanged". Returns
    /// a snapshot of the pre-mutation values for later rollback.
    /// Publishes via `currentUser` so all subscribers refresh in the
    /// same run-loop tick.
    @discardableResult
    func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot

    /// Restores the three profile fields from a snapshot. Used by
    /// EditProfileViewModel when `OfflineQueue.outcomeStream` emits
    /// `.exhausted` for the corresponding `updateProfile` row.
    func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot)
```

- [ ] **Step 3: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: errors like "Type 'AuthManager' does not conform to protocol 'AuthManaging'" and "Type 'MockAuthManager' does not conform to protocol 'AuthManaging'". Those are addressed in Tasks 5 and 6.

- [ ] **Step 4: No commit yet** — Task 5 lands the impl in the same logical change to keep the build green.

---

## Task 5: `AuthManager` impl `applyLocalProfileChanges` + `restoreLocalProfileSnapshot` (TDD)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthManagerProfileMutationTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthManagerProfileMutationTests.swift`:

```swift
import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class AuthManagerProfileMutationTests: XCTestCase {

    private func makeUser(displayName: String? = "Alice",
                          bio: String? = "Hello",
                          avatar: String? = "https://cdn/old.jpg") -> MeeshyUser {
        MeeshyUser(id: "u1", username: "alice",
                   displayName: displayName, bio: bio, avatar: avatar)
    }

    func test_applyLocalProfileChanges_updatesAllThreeFields_andPublishesCurrentUser() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser()

        var emitted: [MeeshyUser?] = []
        let cancellable = auth.currentUserPublisher.sink { emitted.append($0) }
        defer { cancellable.cancel() }

        _ = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )

        XCTAssertEqual(auth.currentUser?.displayName, "Bob")
        XCTAssertEqual(auth.currentUser?.bio, "World")
        XCTAssertEqual(auth.currentUser?.avatar, "https://cdn/new.jpg")
        XCTAssertEqual(emitted.count, 2, "initial + 1 mutation")
        XCTAssertEqual(emitted.last??.displayName, "Bob")
    }

    func test_applyLocalProfileChanges_returnsSnapshotOfPreMutationState() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser(displayName: "Alice", bio: "Hello",
                                     avatar: "https://cdn/old.jpg")

        let snapshot = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )

        XCTAssertEqual(snapshot.displayName, "Alice")
        XCTAssertEqual(snapshot.bio, "Hello")
        XCTAssertEqual(snapshot.avatarUrl, "https://cdn/old.jpg")
    }

    func test_restoreLocalProfileSnapshot_restoresExactPreMutationState() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser(displayName: "Alice", bio: "Hello",
                                     avatar: "https://cdn/old.jpg")

        let snapshot = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )
        auth.restoreLocalProfileSnapshot(snapshot)

        XCTAssertEqual(auth.currentUser?.displayName, "Alice")
        XCTAssertEqual(auth.currentUser?.bio, "Hello")
        XCTAssertEqual(auth.currentUser?.avatar, "https://cdn/old.jpg")
    }
}
```

- [ ] **Step 2: Run to verify failure (compile error)**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AuthManagerProfileMutationTests \
  -quiet 2>&1 | tail -10
```

Expected: compile errors on `AuthManager.shared.applyLocalProfileChanges` / `restoreLocalProfileSnapshot`.

- [ ] **Step 3: Add impl to `AuthManager`**

In `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`, inside `public final class AuthManager: ObservableObject, AuthManaging`, just before the closing brace, add:

```swift
    // MARK: - Local Profile Mutation (optimistic)

    @discardableResult
    public func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        let snapshot = ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        guard let user = currentUser else { return snapshot }
        currentUser = user.withProfileChanges(
            displayName: displayName,
            bio: bio,
            avatar: avatarUrl
        )
        return snapshot
    }

    public func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        guard let user = currentUser else { return }
        currentUser = user.withProfileChanges(
            displayName: snapshot.displayName,
            bio: snapshot.bio,
            avatar: snapshot.avatarUrl
        )
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AuthManagerProfileMutationTests \
  -quiet 2>&1 | tail -10
```

Expected: `** TEST SUCCEEDED **` with 3 tests run.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthManagerProfileMutationTests.swift
git commit -m "feat(sdk/auth): AuthManaging.applyLocalProfileChanges + restore

Phase 4 follow-up — extracts the optimistic seam needed by
EditProfileViewModel. applyLocalProfileChanges rewrites currentUser
in place via the new MeeshyUser.withProfileChanges helper and returns
a ProfileSnapshot for rollback. restoreLocalProfileSnapshot does the
inverse. Both go through @Published currentUser so every subscriber
refreshes in one tick."
```

---

## Task 6: Update `MockAuthManager` to conform

**Files:**
- Modify: `apps/ios/MeeshyTests/Mocks/MockAuthManager.swift`

- [ ] **Step 1: Read the file**

```bash
cat apps/ios/MeeshyTests/Mocks/MockAuthManager.swift | head -80
```

- [ ] **Step 2: Add the two new methods + tracking storage**

Inside `final class MockAuthManager: AuthManaging`, append before the closing brace:

```swift
    // MARK: - Profile Mutation tracking (Phase 4 follow-up)

    var appliedProfileChanges: [(displayName: String?, bio: String?, avatarUrl: String?)] = []
    var restoredSnapshots: [ProfileSnapshot] = []
    /// Optional override — when set, `applyLocalProfileChanges` returns this
    /// snapshot instead of computing one from `currentUser`. Useful for
    /// rollback symmetry tests.
    var applyLocalProfileChangesReturn: ProfileSnapshot?

    @discardableResult
    func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        appliedProfileChanges.append((displayName, bio, avatarUrl))
        let snapshot = applyLocalProfileChangesReturn ?? ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        if let user = currentUser {
            currentUser = user.withProfileChanges(
                displayName: displayName, bio: bio, avatar: avatarUrl
            )
        }
        return snapshot
    }

    func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        restoredSnapshots.append(snapshot)
        if let user = currentUser {
            currentUser = user.withProfileChanges(
                displayName: snapshot.displayName,
                bio: snapshot.bio,
                avatar: snapshot.avatarUrl
            )
        }
    }
```

- [ ] **Step 3: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/MeeshyTests/Mocks/MockAuthManager.swift
git commit -m "test(ios/mocks): MockAuthManager applyLocalProfileChanges + restore

Conforms to extended AuthManaging protocol. Tracks calls in
appliedProfileChanges + restoredSnapshots for EditProfileViewModel
tests."
```

---

## Task 7: `OfflineQueueing` protocol + actor conformance

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`

- [ ] **Step 1: Add protocol and conformance**

In `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`, immediately above `// MARK: - Offline Queue` (currently around line 304), add:

```swift
// MARK: - Test Seam

/// Subset of `OfflineQueue`'s public surface that consumers
/// (EditProfileViewModel + other Phase 4 VMs) depend on. Lets tests
/// inject a mock without faking the full actor.
public protocol OfflineQueueing: Sendable {
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P
    ) async throws

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome>
}

extension OfflineQueue: OfflineQueueing {}
```

Note: the existing `OfflineQueue.enqueue<P: Codable & Sendable>(_ kind: OutboxKind, payload: P) async throws` at line 678 already matches this signature. Same for `outcomeStream(for:)` at line 397. So conformance is automatic.

- [ ] **Step 2: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift
git commit -m "feat(sdk/persistence): OfflineQueueing protocol seam

Lets EditProfileViewModel and other consumers inject a mock without
faking the full actor. Surface = enqueue(_:payload:) + outcomeStream(for:)."
```

---

## Task 8: `ProfileCacheWriting` protocol + actor conformance

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`

- [ ] **Step 1: Read the relevant section**

```bash
grep -n "public actor CacheCoordinator\|public var profiles\|let profiles" packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift | head -10
```

- [ ] **Step 2: Add the protocol and conformance**

At the bottom of `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` (after the actor's closing brace), append:

```swift
// MARK: - Test Seam — ProfileCacheWriting

/// Narrow contract for persisting an updated user in the profile cache.
/// EditProfileViewModel uses this after `AuthManager.applyLocalProfileChanges`
/// so the optimistic state survives an app kill via GRDBCacheStore.
public protocol ProfileCacheWriting: Sendable {
    func saveProfile(_ user: MeeshyUser, for userId: String) async throws
}

extension CacheCoordinator: ProfileCacheWriting {
    public func saveProfile(_ user: MeeshyUser, for userId: String) async throws {
        try await profiles.save([user], for: userId)
    }
}
```

- [ ] **Step 3: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift
git commit -m "feat(sdk/cache): ProfileCacheWriting protocol seam

Routes EditProfileViewModel optimistic persist to profiles.save([user],
for: userId). Avoids invalidateAll() (wasteful) and aligns the cache
with the optimistic local state."
```

---

## Task 9: `Sleeping` protocol + `SystemSleeper`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/Sleeping.swift`

- [ ] **Step 1: Create the file**

```swift
import Foundation

/// Minimal abstraction over `Task.sleep` so EditProfileViewModel's
/// post-success delay can be controlled in tests. The Swift stdlib
/// `Clock` protocol has an `associatedtype Duration`, which complicates
/// mocking — this non-typed seam is intentionally simpler.
protocol Sleeping: Sendable {
    func sleep(milliseconds: UInt64) async
}

final class SystemSleeper: Sleeping {
    static let shared = SystemSleeper()

    func sleep(milliseconds: UInt64) async {
        try? await Task.sleep(nanoseconds: milliseconds * 1_000_000)
    }
}
```

- [ ] **Step 2: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -5
```

Expected: zero errors.

- [ ] **Step 3: Commit (will batch with Tasks 10 and 11 to keep commits coherent)**

Skip for now; commit at the end of Task 11.

---

## Task 10: `ToastSurfacing` and `HapticSurfacing` adapters

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/ToastSurfacing.swift`
- Create: `apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift`

- [ ] **Step 1: Create `ToastSurfacing.swift`**

```swift
import Foundation

@MainActor
protocol ToastSurfacing: AnyObject {
    func showSuccess(_ message: String)
    func showError(_ message: String)
}

extension ToastManager: ToastSurfacing {}
```

Note: `ToastManager` already has `showSuccess(_:)` and `showError(_:)` at `apps/ios/Meeshy/Features/Main/Services/ToastManager.swift:35-42`, so the conformance is automatic.

- [ ] **Step 2: Create `HapticSurfacing.swift`**

```swift
import Foundation
import MeeshyUI

@MainActor
protocol HapticSurfacing: AnyObject {
    func success()
    func error()
}

@MainActor
final class HapticBridge: HapticSurfacing {
    static let shared = HapticBridge()

    func success() { HapticFeedback.success() }
    func error()   { HapticFeedback.error() }
}
```

- [ ] **Step 3: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -5
```

Expected: zero errors.

- [ ] **Step 4: Commit (still batched — see Task 11)**

Skip for now.

---

## Task 11: `AttachmentUploading` protocol + `AttachmentUploader` (TDD on compression)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/AttachmentUploaderTests.swift`

- [ ] **Step 1: Write the failing test for compression**

Create `apps/ios/MeeshyTests/Unit/Services/AttachmentUploaderTests.swift`:

```swift
import XCTest
import UIKit
@testable import Meeshy

final class AttachmentUploaderTests: XCTestCase {

    func test_compress_reducesImageBelow500KB_whenLargerInput() {
        // 1200x1200 random-color image — yields ~1MB+ as JPEG quality 0.8
        let size = CGSize(width: 1200, height: 1200)
        UIGraphicsBeginImageContext(size)
        defer { UIGraphicsEndImageContext() }
        let context = UIGraphicsGetCurrentContext()!
        for x in stride(from: 0, to: Int(size.width), by: 4) {
            for y in stride(from: 0, to: Int(size.height), by: 4) {
                context.setFillColor(UIColor(red: CGFloat.random(in: 0...1),
                                              green: CGFloat.random(in: 0...1),
                                              blue: CGFloat.random(in: 0...1),
                                              alpha: 1).cgColor)
                context.fill(CGRect(x: x, y: y, width: 4, height: 4))
            }
        }
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        let inputData = image.jpegData(compressionQuality: 1.0)!
        XCTAssertGreaterThan(inputData.count, 500 * 1024,
                              "Test setup: input must exceed 500KB to be meaningful")

        let compressed = AttachmentUploader.compress(inputData, maxSizeKB: 500)

        XCTAssertLessThanOrEqual(compressed.count, 500 * 1024,
                                  "Compression must bring output under 500KB")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "AttachmentUploader|error:" | head -10
```

Expected: compile error "Cannot find 'AttachmentUploader' in scope".

- [ ] **Step 3: Create `AttachmentUploader.swift`**

```swift
import Foundation
import MeeshySDK
import UIKit

protocol AttachmentUploading: Sendable {
    /// Synchronous online-only upload of a JPEG avatar.
    /// Compression to maxSizeKB is applied internally.
    func uploadAvatar(_ data: Data) async throws -> URL
}

final class AttachmentUploader: AttachmentUploading {
    static let shared = AttachmentUploader()

    private let apiClient: APIClient
    private let urlSession: URLSession
    private let maxSizeKB: Int

    init(
        apiClient: APIClient = .shared,
        urlSession: URLSession = .shared,
        maxSizeKB: Int = 500
    ) {
        self.apiClient = apiClient
        self.urlSession = urlSession
        self.maxSizeKB = maxSizeKB
    }

    func uploadAvatar(_ data: Data) async throws -> URL {
        let compressed = Self.compress(data, maxSizeKB: maxSizeKB)
        let boundary = UUID().uuidString

        guard let url = URL(string: "\(apiClient.baseURL)/attachments/upload") else {
            throw APIError.invalidURL
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"avatar.jpg\"\r\n"
            .data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(compressed)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)",
                         forHTTPHeaderField: "Content-Type")
        if let token = apiClient.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body

        let (responseData, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else {
            throw APIError.serverError(
                (response as? HTTPURLResponse)?.statusCode ?? 500,
                String(localized: "Echec de l'envoi de l'avatar",
                       defaultValue: "Echec de l'envoi de l'avatar")
            )
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: responseData)
        guard let urlString = decoded.data.attachments.first?.url,
              let avatarURL = URL(string: urlString) else {
            throw APIError.noData
        }
        return avatarURL
    }

    /// JPEG re-encode until `.count <= maxSizeKB * 1024`.
    /// Public static so test code can verify the size invariant
    /// without touching the network path.
    static func compress(_ data: Data, maxSizeKB: Int) -> Data {
        guard let image = UIImage(data: data) else { return data }
        var compression: CGFloat = 0.8
        var compressed = image.jpegData(compressionQuality: compression) ?? data
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = image.jpegData(compressionQuality: compression) ?? data
        }
        return compressed
    }

    private struct UploadResponse: Decodable {
        let success: Bool
        let data: UploadData
    }
    private struct UploadData: Decodable { let attachments: [UploadedAttachment] }
    private struct UploadedAttachment: Decodable { let url: String }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "AttachmentUploaderTests|TEST" | head -10
```

Expected: 1 test passes.

- [ ] **Step 5: Commit the batch (Tasks 9-11)**

```bash
git add apps/ios/Meeshy/Features/Main/Services/Sleeping.swift
git add apps/ios/Meeshy/Features/Main/Services/ToastSurfacing.swift
git add apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift
git add apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift
git add apps/ios/MeeshyTests/Unit/Services/AttachmentUploaderTests.swift
git commit -m "feat(ios/services): AttachmentUploader + Sleeping/Toast/Haptic protocol seams

EditProfileViewModel prereqs:
- AttachmentUploading + AttachmentUploader extracted verbatim from
  EditProfileView (multipart + JPEG compression, online-only).
- Sleeping + SystemSleeper for testable post-success delay.
- ToastSurfacing + HapticSurfacing adapters over ToastManager / HapticFeedback.

1 test (compress)."
```

---

## Task 12: Test doubles for the 5 thin protocols

**Files:**
- Create: `apps/ios/MeeshyTests/Mocks/MockAttachmentUploader.swift`
- Create: `apps/ios/MeeshyTests/Mocks/MockEditProfileDoubles.swift`

- [ ] **Step 1: Create `MockAttachmentUploader.swift`**

```swift
import Foundation
@testable import Meeshy

final class MockAttachmentUploader: AttachmentUploading, @unchecked Sendable {
    var uploadAvatarResult: Result<URL, Error> =
        .success(URL(string: "https://cdn.meeshy.me/avatars/test.jpg")!)
    var uploadAvatarCallCount = 0
    var lastUploadAvatarData: Data?

    func uploadAvatar(_ data: Data) async throws -> URL {
        uploadAvatarCallCount += 1
        lastUploadAvatarData = data
        return try uploadAvatarResult.get()
    }

    func reset() {
        uploadAvatarResult = .success(URL(string: "https://cdn.meeshy.me/avatars/test.jpg")!)
        uploadAvatarCallCount = 0
        lastUploadAvatarData = nil
    }
}
```

- [ ] **Step 2: Create `MockEditProfileDoubles.swift`**

```swift
import Foundation
@testable import Meeshy
@testable import MeeshySDK

// MARK: - MockOfflineQueue

final class MockOfflineQueue: OfflineQueueing, @unchecked Sendable {
    struct EnqueueCall {
        let kind: OutboxKind
        let payload: any Codable & Sendable
    }

    var enqueueResult: Result<Void, Error> = .success(())
    var enqueueCalls: [EnqueueCall] = []
    var lastPayload: (any Codable & Sendable)?
    /// Per-cmid continuation; tests yield `.applied` / `.exhausted` to simulate
    /// the OutboxFlusher outcome.
    var outcomeContinuations: [String: AsyncStream<OutboxOutcome>.Continuation] = [:]

    func enqueue<P: Codable & Sendable>(_ kind: OutboxKind, payload: P) async throws {
        enqueueCalls.append(EnqueueCall(kind: kind, payload: payload))
        lastPayload = payload
        try enqueueResult.get()
    }

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome> {
        AsyncStream<OutboxOutcome> { continuation in
            outcomeContinuations[cmid] = continuation
        }
    }

    /// Test helper — yields an outcome on the stream for `cmid` and finishes
    /// the stream (single-shot, matches production semantics).
    func emitOutcome(_ outcome: OutboxOutcome, for cmid: String) {
        outcomeContinuations[cmid]?.yield(outcome)
        outcomeContinuations[cmid]?.finish()
    }
}

// MARK: - MockProfileCache

final class MockProfileCache: ProfileCacheWriting, @unchecked Sendable {
    var saveProfileResult: Result<Void, Error> = .success(())
    var saveProfileCalls: [(user: MeeshyUser, userId: String)] = []

    func saveProfile(_ user: MeeshyUser, for userId: String) async throws {
        saveProfileCalls.append((user, userId))
        try saveProfileResult.get()
    }
}

// MARK: - TestSleeper

final class TestSleeper: Sleeping, @unchecked Sendable {
    var sleepCalls: [UInt64] = []

    func sleep(milliseconds: UInt64) async {
        sleepCalls.append(milliseconds)
        // intentional no-op for test speed
    }
}

// MARK: - MockToast

@MainActor
final class MockToast: ToastSurfacing {
    var successMessages: [String] = []
    var errorMessages: [String] = []

    func showSuccess(_ message: String) { successMessages.append(message) }
    func showError(_ message: String)   { errorMessages.append(message) }
}

// MARK: - MockHaptic

@MainActor
final class MockHaptic: HapticSurfacing {
    var successCount = 0
    var errorCount = 0

    func success() { successCount += 1 }
    func error()   { errorCount += 1 }
}
```

- [ ] **Step 3: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/MeeshyTests/Mocks/MockAttachmentUploader.swift
git add apps/ios/MeeshyTests/Mocks/MockEditProfileDoubles.swift
git commit -m "test(ios/mocks): doubles for EditProfileViewModel (5 protocols)

MockOfflineQueue with per-cmid AsyncStream continuations for outcome
testing. MockProfileCache, TestSleeper, MockToast, MockHaptic each
record calls."
```

---

## Task 13: `EditProfileViewModel` skeleton — init + state (TDD)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`
- Create: `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`

- [ ] **Step 1: Write the failing initial-state tests**

Create `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`:

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class EditProfileViewModelTests: XCTestCase {

    // MARK: - Doubles graph

    private struct Doubles {
        let auth: MockAuthManager
        let queue: MockOfflineQueue
        let uploader: MockAttachmentUploader
        let cache: MockProfileCache
        let sleeper: TestSleeper
        let toast: MockToast
        let haptics: MockHaptic
    }

    private func makeUser(
        id: String = "u1",
        username: String = "alice",
        displayName: String? = "Alice",
        bio: String? = "Hello world",
        avatar: String? = "https://cdn/old.jpg"
    ) -> MeeshyUser {
        MeeshyUser(id: id, username: username,
                   displayName: displayName, bio: bio, avatar: avatar)
    }

    private func makeSUT(
        currentUser: MeeshyUser? = nil
    ) -> (sut: EditProfileViewModel, doubles: Doubles) {
        let user = currentUser ?? makeUser()
        let auth = MockAuthManager()
        auth.currentUser = user
        let queue = MockOfflineQueue()
        let uploader = MockAttachmentUploader()
        let cache = MockProfileCache()
        let sleeper = TestSleeper()
        let toast = MockToast()
        let haptics = MockHaptic()
        let sut = EditProfileViewModel(
            authManager: auth, offlineQueue: queue, attachmentUploader: uploader,
            profileCache: cache, sleeper: sleeper, toast: toast, haptics: haptics
        )
        return (sut, Doubles(auth: auth, queue: queue, uploader: uploader,
                              cache: cache, sleeper: sleeper, toast: toast,
                              haptics: haptics))
    }

    // MARK: - Initial state

    func test_init_seedsDisplayName_fromCurrentUser() {
        let (sut, _) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        XCTAssertEqual(sut.displayName, "Alice")
    }

    func test_init_seedsBio_fromCurrentUser() {
        let (sut, _) = makeSUT(currentUser: makeUser(bio: "Hello world"))
        XCTAssertEqual(sut.bio, "Hello world")
    }

    func test_init_hasChangesFalse_whenNoEdits() {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.hasChanges)
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "EditProfileViewModel|error:" | head -10
```

Expected: "Cannot find 'EditProfileViewModel' in scope".

- [ ] **Step 3: Create the VM skeleton**

Create `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`:

```swift
import Foundation
import SwiftUI
import PhotosUI
import MeeshySDK

@MainActor
final class EditProfileViewModel: ObservableObject {

    enum SaveState: Equatable {
        case idle, uploadingAvatar, enqueueing, success, failed
    }

    // MARK: - Bindings (inputs)

    @Published var displayName: String
    @Published var bio: String
    @Published var selectedImageData: Data?
    @Published var avatarPreviewImage: Image?

    // MARK: - State machine (outputs)

    @Published private(set) var saveState: SaveState = .idle
    @Published private(set) var errorMessage: String?
    @Published private(set) var showSuccess: Bool = false

    // MARK: - Dependencies

    private let authManager: AuthManaging
    private let offlineQueue: OfflineQueueing
    private let attachmentUploader: AttachmentUploading
    private let profileCache: ProfileCacheWriting
    private let sleeper: Sleeping
    private let toast: ToastSurfacing
    private let haptics: HapticSurfacing

    // MARK: - Init

    init(
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        attachmentUploader: AttachmentUploading = AttachmentUploader.shared,
        profileCache: ProfileCacheWriting = CacheCoordinator.shared,
        sleeper: Sleeping = SystemSleeper.shared,
        toast: ToastSurfacing = ToastManager.shared,
        haptics: HapticSurfacing = HapticBridge.shared
    ) {
        self.authManager = authManager
        self.offlineQueue = offlineQueue
        self.attachmentUploader = attachmentUploader
        self.profileCache = profileCache
        self.sleeper = sleeper
        self.toast = toast
        self.haptics = haptics
        let user = authManager.currentUser
        self.displayName = user?.displayName ?? user?.username ?? ""
        self.bio = user?.bio ?? ""
    }

    // MARK: - Computed

    var hasChanges: Bool {
        let user = authManager.currentUser
        let nameChanged = displayName != (user?.displayName ?? user?.username ?? "")
        let bioChanged = bio != (user?.bio ?? "")
        let avatarChanged = selectedImageData != nil
        return nameChanged || bioChanged || avatarChanged
    }

    var isSaving: Bool {
        switch saveState {
        case .uploadingAvatar, .enqueueing: return true
        default: return false
        }
    }

    var isUploadingAvatar: Bool { saveState == .uploadingAvatar }
    var bioMaxLength: Int { 300 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_init_|TEST" | head -10
```

Expected: 3 initial-state tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift
git add apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift
git commit -m "feat(ios/edit-profile): EditProfileViewModel skeleton + initial state

7 injected protocols, SaveState enum, @Published bindings seeded from
AuthManager.currentUser. 3 initial-state tests."
```

---

## Task 14: `hasChanges` tests + `loadSelectedPhoto`

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`

- [ ] **Step 1: Add `hasChanges` tests**

Append to `EditProfileViewModelTests.swift`, inside the class:

```swift
    // MARK: - hasChanges

    func test_hasChanges_trueAfterDisplayNameEdit() {
        let (sut, _) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"
        XCTAssertTrue(sut.hasChanges)
    }

    func test_hasChanges_trueAfterBioEdit() {
        let (sut, _) = makeSUT(currentUser: makeUser(bio: "Hello"))
        sut.bio = "World"
        XCTAssertTrue(sut.hasChanges)
    }

    func test_hasChanges_trueAfterImageSelection() {
        let (sut, _) = makeSUT()
        sut.selectedImageData = Data([0x01, 0x02, 0x03])
        XCTAssertTrue(sut.hasChanges)
    }
```

- [ ] **Step 2: Run tests — should PASS already**

`hasChanges` is already implemented in Task 13's VM skeleton. Re-running confirms the implementation is correct:

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_hasChanges|TEST" | head -10
```

Expected: 3 tests pass.

- [ ] **Step 3: Add `loadSelectedPhoto` to the VM**

In `EditProfileViewModel.swift`, append before the final brace of the class:

```swift
    // MARK: - Photo loading

    func loadSelectedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        selectedImageData = data
        if let uiImage = UIImage(data: data) {
            avatarPreviewImage = Image(uiImage: uiImage)
        }
    }
```

Add at the top of the file under existing imports:

```swift
#if canImport(UIKit)
import UIKit
#endif
```

- [ ] **Step 4: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -5
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift
git add apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift
git commit -m "feat(ios/edit-profile): hasChanges tests + loadSelectedPhoto

3 tests cover displayName/bio/image edits each flipping hasChanges to
true. loadSelectedPhoto extracted from the View (PhotosPickerItem →
Data → preview Image)."
```

---

## Task 15: `saveProfile` happy path no-avatar (TDD — 4 tests)

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`

- [ ] **Step 1: Write the 4 failing tests**

Append to `EditProfileViewModelTests.swift`:

```swift
    // MARK: - saveProfile happy path (no avatar)

    func test_save_appliesOptimisticLocally_beforeEnqueue() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 1)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.displayName, "Bob")
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.bio, "Hello world")
        XCTAssertNil(doubles.auth.appliedProfileChanges.first?.avatarUrl)
    }

    func test_save_enqueuesUpdateProfilePayload_withCmid() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.queue.enqueueCalls.count, 1)
        XCTAssertEqual(doubles.queue.enqueueCalls.first?.kind, .updateProfile)
        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertNotNil(payload?.clientMutationId)
        XCTAssertFalse(payload?.clientMutationId.isEmpty ?? true)
    }

    func test_save_persistsOptimisticUserInCache_afterEnqueue() async {
        let user = makeUser(id: "u1", displayName: "Alice")
        let (sut, doubles) = makeSUT(currentUser: user)
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.cache.saveProfileCalls.count, 1)
        XCTAssertEqual(doubles.cache.saveProfileCalls.first?.userId, "u1")
        XCTAssertEqual(doubles.cache.saveProfileCalls.first?.user.displayName, "Bob",
                       "Cache write captures the post-optimistic user")
    }

    func test_save_callsDismissCallback_afterSuccessDelay() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        var dismissed = false

        await sut.saveProfile(onDismiss: { dismissed = true })

        XCTAssertTrue(dismissed)
        XCTAssertEqual(doubles.sleeper.sleepCalls, [1500])
    }
```

- [ ] **Step 2: Run to verify failure**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_|error:" | head -10
```

Expected: compile error "Cannot find 'saveProfile'".

- [ ] **Step 3: Implement `saveProfile` (no-avatar branch only at this step)**

Append to `EditProfileViewModel.swift`:

```swift
    // MARK: - Save

    func saveProfile(onDismiss: @escaping @MainActor () -> Void) async {
        guard hasChanges, !isSaving else { return }
        errorMessage = nil

        // 1. Avatar upload (no-op if no image selected — added in Task 16).
        let uploadedAvatarUrl: String? = nil

        // 2. Build payload.
        let cmid = ClientMutationId.generate()
        let trimmedName = displayName.trimmingCharacters(in: .whitespaces)
        let trimmedBio = bio.trimmingCharacters(in: .whitespaces)
        let payload = UpdateProfilePayload(
            clientMutationId: cmid,
            displayName: trimmedName.isEmpty ? nil : trimmedName,
            bio: trimmedBio.isEmpty ? nil : trimmedBio,
            avatarUrl: uploadedAvatarUrl
        )

        // 3. Optimistic apply local (publishes via @Published currentUser).
        let snapshot = authManager.applyLocalProfileChanges(
            displayName: payload.displayName,
            bio: payload.bio,
            avatarUrl: payload.avatarUrl
        )

        // 4. Observer (added in Task 17).
        // observeOutcome(cmid: cmid, snapshot: snapshot)

        // 5. Enqueue.
        saveState = .enqueueing
        do {
            try await offlineQueue.enqueue(.updateProfile, payload: payload)
        } catch {
            authManager.restoreLocalProfileSnapshot(snapshot)
            errorMessage = String(localized: "Echec de la mise a jour",
                                   defaultValue: "Echec de la mise a jour")
            toast.showError(errorMessage ?? "")
            haptics.error()
            saveState = .failed
            return
        }

        // 6. Persist optimistic in cache.
        if let user = authManager.currentUser {
            try? await profileCache.saveProfile(user, for: user.id)
        }

        // 7. UX feedback + dismiss.
        haptics.success()
        toast.showSuccess(String(localized: "Profil mis a jour",
                                  defaultValue: "Profil mis a jour"))
        saveState = .success
        showSuccess = true
        await sleeper.sleep(milliseconds: 1500)
        onDismiss()
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_appliesOptimistic|test_save_enqueues|test_save_persists|test_save_callsDismiss|TEST" | head -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift
git add apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift
git commit -m "feat(ios/edit-profile): saveProfile happy path no-avatar

Optimistic apply → enqueue .updateProfile → persist in cache → dismiss.
4 tests cover the local mutation, payload shape (cmid present),
ProfileCache write, and post-success delay + dismiss."
```

---

## Task 16: `saveProfile` with avatar — 2 tests

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`

- [ ] **Step 1: Add 2 failing tests**

Append to `EditProfileViewModelTests.swift`:

```swift
    // MARK: - saveProfile with avatar

    func test_save_uploadsAvatarBeforeEnqueue_whenImageSelected() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01, 0x02, 0x03])
        doubles.uploader.uploadAvatarResult = .success(URL(string: "https://cdn/new.jpg")!)

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.uploader.uploadAvatarCallCount, 1)
        XCTAssertEqual(doubles.uploader.lastUploadAvatarData, Data([0x01, 0x02, 0x03]))
    }

    func test_save_enqueuesPayloadWithUploadedUrl() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01])
        doubles.uploader.uploadAvatarResult = .success(URL(string: "https://cdn/new.jpg")!)

        await sut.saveProfile(onDismiss: {})

        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertEqual(payload?.avatarUrl, "https://cdn/new.jpg")
    }
```

- [ ] **Step 2: Run to verify failure**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_uploadsAvatar|test_save_enqueuesPayload|FAIL" | head -10
```

Expected: 2 tests fail — `uploadAvatarCallCount == 0` and `payload?.avatarUrl == nil`.

- [ ] **Step 3: Add the upload branch**

In `EditProfileViewModel.swift`, replace the comment `// 1. Avatar upload (no-op if no image selected — added in Task 16).` and the line below it with:

```swift
        // 1. Avatar upload (online-only, sync before enqueue).
        var uploadedAvatarUrl: String?
        if let imageData = selectedImageData {
            saveState = .uploadingAvatar
            do {
                let url = try await attachmentUploader.uploadAvatar(imageData)
                uploadedAvatarUrl = url.absoluteString
            } catch {
                errorMessage = humanReadable(error)
                toast.showError(errorMessage ?? "")
                haptics.error()
                saveState = .failed
                return
            }
        }
```

Append a helper method at the bottom of the class:

```swift
    private func humanReadable(_ error: Error) -> String {
        if let e = error as? MeeshyError { return e.errorDescription ?? defaultFailureMessage() }
        if let e = error as? APIError    { return e.errorDescription ?? defaultFailureMessage() }
        return defaultFailureMessage()
    }

    private func defaultFailureMessage() -> String {
        String(localized: "Echec de la mise a jour",
               defaultValue: "Echec de la mise a jour")
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_uploadsAvatar|test_save_enqueuesPayload|TEST" | head -10
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift
git add apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift
git commit -m "feat(ios/edit-profile): saveProfile avatar branch

Avatar uploaded synchronously before enqueue (online-only). 2 tests
verify uploader is called with the selected bytes and the resulting URL
flows into UpdateProfilePayload.avatarUrl."
```

---

## Task 17: Failure paths + outcome observer — 4 tests

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift`

- [ ] **Step 1: Add 4 failing tests**

Append to `EditProfileViewModelTests.swift`:

```swift
    // MARK: - Failure paths + outcome observer

    func test_save_setsFailedState_whenAvatarUploadThrows_noLocalMutation() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01])
        doubles.uploader.uploadAvatarResult = .failure(APIError.serverError(500, "boom"))

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(sut.saveState, .failed)
        XCTAssertEqual(doubles.queue.enqueueCalls.count, 0)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 0,
                       "No local mutation when upload fails")
        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 0,
                       "Nothing to rollback")
        XCTAssertNotNil(sut.errorMessage)
    }

    func test_save_rollsBackSnapshot_whenEnqueueThrows() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"
        doubles.queue.enqueueResult = .failure(APIError.serverError(500, "queue dead"))

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(sut.saveState, .failed)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 1)
        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 1)
        XCTAssertEqual(doubles.auth.restoredSnapshots.first?.displayName, "Alice")
    }

    func test_save_rollsBackSnapshot_whenOutcomeStreamEmitsExhausted() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        // Outcome stream is single-shot per cmid.
        guard let call = doubles.queue.enqueueCalls.first,
              let payload = call.payload as? UpdateProfilePayload else {
            return XCTFail("no enqueue call")
        }
        doubles.queue.emitOutcome(.exhausted(cmid: payload.clientMutationId),
                                   for: payload.clientMutationId)

        // Give the observer Task a tick to run.
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(doubles.auth.restoredSnapshots.count, 1)
        XCTAssertEqual(doubles.haptics.errorCount, 1)
        XCTAssertEqual(doubles.toast.errorMessages.count, 1)
    }

    func test_save_doesNotRollback_whenOutcomeStreamEmitsApplied() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        guard let payload = doubles.queue.lastPayload as? UpdateProfilePayload else {
            return XCTFail("no payload")
        }
        doubles.queue.emitOutcome(.applied(cmid: payload.clientMutationId),
                                   for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 0)
        XCTAssertEqual(doubles.haptics.errorCount, 0)
    }
```

- [ ] **Step 2: Run to verify failure**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_setsFailed|test_save_rollsBack|test_save_doesNotRollback|FAIL" | head -10
```

Expected: 4 tests fail (mostly due to `observeOutcome` not being wired and missing error toast call sites).

- [ ] **Step 3: Wire `observeOutcome` + add toast/haptic on failed branches**

In `EditProfileViewModel.swift`, uncomment the call site and add the private method:

Replace the commented line:
```swift
        // 4. Observer (added in Task 17).
        // observeOutcome(cmid: cmid, snapshot: snapshot)
```

With:
```swift
        // 4. Observer — attached BEFORE enqueue to avoid race where the
        //    OutboxFlusher emits the outcome before the for-await is listed.
        observeOutcome(cmid: cmid, snapshot: snapshot)
```

Append at the bottom of the class (above `humanReadable`):

```swift
    // MARK: - Outcome observer

    /// Subscribes to `OfflineQueue.outcomeStream(for: cmid)` and rolls back
    /// the optimistic mutation when the stream emits `.exhausted`.
    /// `.applied` is a no-op — the optimistic state is already correct.
    /// Fire-and-forget Task; the stream completes after one event so the
    /// for-await terminates and the Task ends.
    private func observeOutcome(cmid: String, snapshot: ProfileSnapshot) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let stream = await self.offlineQueue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    self.authManager.restoreLocalProfileSnapshot(snapshot)
                    self.toast.showError(
                        String(localized: "Mise a jour du profil echouee",
                               defaultValue: "Mise a jour du profil echouee")
                    )
                    self.haptics.error()
                }
            }
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./apps/ios/meeshy.sh test 2>&1 | grep -E "test_save_setsFailed|test_save_rollsBack|test_save_doesNotRollback|TEST" | head -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift
git add apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift
git commit -m "feat(ios/edit-profile): saveProfile failure paths + outcome observer

observeOutcome attached BEFORE enqueue (avoid race). .exhausted →
restoreLocalProfileSnapshot + toast + haptic.error. .applied → no-op.
Upload fail and enqueue fail set saveState=.failed with errorMessage
and surface toast.error. 4 tests cover all failure branches."
```

---

## Task 18: Refactor `EditProfileView` to delegate to the VM

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`

- [ ] **Step 1: Replace the view body and state**

Open `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift` and rewrite it in full (549 → ~280 LOC):

```swift
import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI

struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var authManager: AuthManager

    @StateObject private var viewModel: EditProfileViewModel

    @State private var selectedPhotoItem: PhotosPickerItem?

    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    private let accentColor = "818CF8"

    init(viewModel: EditProfileViewModel = EditProfileViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }

            if viewModel.showSuccess {
                successOverlay
            }
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            Task { await viewModel.loadSelectedPhoto(newItem) }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text(String(localized: "Retour", defaultValue: "Retour"))
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo400)
            }

            Spacer()

            Text(String(localized: "Modifier le profil",
                         defaultValue: "Modifier le profil"))
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                avatarSection
                fieldsSection
                readOnlySection
                saveButton

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Avatar Section

    private var avatarSection: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                if let preview = viewModel.avatarPreviewImage {
                    preview
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(MeeshyColors.indigo400.opacity(0.4), lineWidth: 2)
                        )
                } else {
                    MeeshyAvatar(
                        name: user?.displayName ?? user?.username ?? "?",
                        context: .profileEdit,
                        accentColor: accentColor,
                        secondaryColor: "6366F1",
                        avatarURL: user?.avatar
                    )
                }

                let bgPrimary = theme.backgroundPrimary
                PhotosPicker(
                    selection: $selectedPhotoItem,
                    matching: .images,
                    photoLibrary: .shared()
                ) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(MeeshyColors.indigo400))
                        .overlay(Circle().stroke(bgPrimary, lineWidth: 2))
                }
            }

            if viewModel.isUploadingAvatar {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(MeeshyColors.indigo400)
                    Text(String(localized: "Envoi de la photo...",
                                 defaultValue: "Envoi de la photo..."))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Fields Section

    private var fieldsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(
                title: String(localized: "Informations", defaultValue: "Informations"),
                icon: "pencil.circle.fill", color: accentColor
            )

            VStack(spacing: 0) {
                editableField(
                    icon: "person.fill",
                    title: String(localized: "Nom d'affichage",
                                  defaultValue: "Nom d'affichage"),
                    text: $viewModel.displayName,
                    placeholder: String(localized: "Votre nom",
                                         defaultValue: "Votre nom")
                )

                bioField
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: accentColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: accentColor), lineWidth: 1)
                    )
            )
        }
    }

    private var bioField: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "text.quote")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(MeeshyColors.indigo400.opacity(0.12))
                )
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "Bio", defaultValue: "Bio"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField(
                    String(localized: "Parlez de vous...",
                           defaultValue: "Parlez de vous..."),
                    text: $viewModel.bio,
                    axis: .vertical
                )
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .lineLimit(3...6)
                .onChange(of: viewModel.bio) { _, newValue in
                    if newValue.count > viewModel.bioMaxLength {
                        viewModel.bio = String(newValue.prefix(viewModel.bioMaxLength))
                    }
                }

                HStack {
                    Spacer()
                    Text("\(viewModel.bio.count)/\(viewModel.bioMaxLength)")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(
                            viewModel.bio.count >= viewModel.bioMaxLength
                                ? MeeshyColors.error
                                : theme.textMuted
                        )
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Read-Only Section

    private var readOnlySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(
                title: String(localized: "Compte", defaultValue: "Compte"),
                icon: "lock.fill", color: "4338CA"
            )

            VStack(spacing: 0) {
                if let email = user?.email {
                    readOnlyRow(
                        icon: "envelope.fill",
                        title: String(localized: "Email", defaultValue: "Email"),
                        value: email, color: "4338CA"
                    )
                }

                if let phone = user?.phoneNumber {
                    readOnlyRow(
                        icon: "phone.fill",
                        title: String(localized: "Telephone",
                                      defaultValue: "T\u{00E9}l\u{00E9}phone"),
                        value: phone, color: "4338CA"
                    )
                }

                readOnlyRow(
                    icon: "at",
                    title: String(localized: "Nom d'utilisateur",
                                  defaultValue: "Nom d'utilisateur"),
                    value: "@\(user?.username ?? "—")",
                    color: "4338CA"
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: "4338CA"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: "4338CA"), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        VStack(spacing: 8) {
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            Button {
                HapticFeedback.medium()
                Task {
                    await viewModel.saveProfile { dismiss() }
                }
            } label: {
                HStack(spacing: 8) {
                    if viewModel.isSaving {
                        ProgressView()
                            .scaleEffect(0.8)
                            .tint(.white)
                    }
                    Text(String(localized: "Sauvegarder",
                                 defaultValue: "Sauvegarder"))
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            viewModel.hasChanges && !viewModel.isSaving
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                )
            }
            .disabled(!viewModel.hasChanges || viewModel.isSaving)
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "Profil mis a jour",
                         defaultValue: "Profil mis \u{00E0} jour"))
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(MeeshyColors.success.opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Reusable Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func editableField(
        icon: String, title: String,
        text: Binding<String>, placeholder: String
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(MeeshyColors.indigo400.opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField(placeholder, text: text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func readOnlyRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
```

- [ ] **Step 2: Build to verify compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error:" | head -10
```

Expected: zero errors. Build artifact ready.

- [ ] **Step 3: Run all tests once**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -30
```

Expected: 22+ new tests pass (2 MeeshyUser + 3 AuthManager + 1 Uploader + 16 VM). Pre-existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift
git commit -m "refactor(ios/edit-profile): EditProfileView delegates to VM

549 → ~280 LOC. All business state moved to EditProfileViewModel via
@StateObject. Only selectedPhotoItem (PhotosPickerItem, SwiftUI-coupled)
stays as @State. Visual surface 1:1 unchanged. saveProfile delegates
to viewModel.saveProfile { dismiss() }."
```

---

## Task 19: Manual smoke tests (golden path + offline)

**Files:** none (manual verification)

- [ ] **Step 1: Run app, sign in as `atabeth / pD5p1ir9uxLUf2X2FpNE`**

```bash
./apps/ios/meeshy.sh run
```

The script blocks on the log stream; use the simulator UI to test.

- [ ] **Step 2: Navigate to Profile → Edit Profile**

Verify: displayName + bio + avatar shown as today.

- [ ] **Step 3: Change displayName only → Save**

Expected: instant return to Profile, displayName updated, success toast, avatar/bio unchanged. Wait 2s, no rollback toast appears.

- [ ] **Step 4: Change bio only → Save**

Expected: same as Step 3 for bio.

- [ ] **Step 5: Change avatar only → Save**

Expected: upload spinner ("Envoi de la photo..."), then save → return → new avatar visible everywhere (Profile + conversation header + bubble user). Wait 2s, no rollback.

- [ ] **Step 6: Change all three → Save**

Expected: spinner → save → return → all 3 updates visible everywhere instantly.

- [ ] **Step 7: Open Edit, change displayName, tap Back (not Save)**

Expected: no save fires, returning shows old displayName. (Verifies `hasChanges` doesn't trigger save without explicit tap.)

- [ ] **Step 8: Offline test — toggle airplane mode, change displayName, Save**

Expected: success toast appears (queue persisted locally), Profile + conversation surfaces show the new name. Turn airplane mode off; OutboxFlusher fires PATCH within a few seconds. No rollback (assuming the server accepts).

- [ ] **Step 9: Force-rollback test — pause OutboxFlusher OR mock server returning 5xx 4 times**

(Optional, requires server cooperation.) Expected: after `maxAttempts`, `.exhausted` triggers `restoreLocalProfileSnapshot`, Profile reverts to old displayName, error toast surfaces.

- [ ] **Step 10: If everything passes, no commit needed** (the smoke tests don't change files).

Document any anomaly observed in the PR description.

---

## Definition of Done

After all 19 tasks completed:

- ✅ `./apps/ios/meeshy.sh build` exits 0 (warnings tolerated, no new warnings introduced)
- ✅ `./apps/ios/meeshy.sh test` runs and all new tests pass (≥22 new tests)
- ✅ Test counts breakdown:
  - 2 `MeeshyUserProfileMutationTests`
  - 3 `AuthManagerProfileMutationTests`
  - 1 `AttachmentUploaderTests`
  - 16 `EditProfileViewModelTests`
- ✅ SwiftLint 0 violation on the new files (run if `.swiftlint.yml` is in repo)
- ✅ Manual smoke tests Steps 3-7 all pass on simulator
- ✅ Offline smoke (Step 8) demonstrates live propagation
- ✅ Branch `feat/edit-profile-vm` ready for PR against `main`

---

## How to ship after the worktree is green

From the worktree:

```bash
git push -u origin feat/edit-profile-vm
gh pr create --title "feat(ios/edit-profile): EditProfileViewModel extraction + optimistic+rollback" \
  --body "$(cat <<'EOF'
## Summary

- Extracts `EditProfileViewModel` from `EditProfileView.swift` (549 → ~280 LOC)
- Applies Phase 4 B5 pattern: optimistic apply via `AuthManager.applyLocalProfileChanges` + rollback via `OfflineQueue.outcomeStream(for:)` on `.exhausted`
- Live propagation of displayName/bio/avatar to all surfaces observing `currentUserPublisher`
- Fixes test bundle compile errors (StoryRepostFlowTests + others)

## Spec

`docs/superpowers/specs/2026-05-12-edit-profile-viewmodel-design.md`

## Plan

`docs/superpowers/plans/2026-05-12-edit-profile-viewmodel.md`

## Test plan

- [x] `MeeshyUserProfileMutationTests` (2 tests)
- [x] `AuthManagerProfileMutationTests` (3 tests)
- [x] `AttachmentUploaderTests` (1 test)
- [x] `EditProfileViewModelTests` (16 tests)
- [x] Manual smoke: displayName / bio / avatar / triple / back-without-save / offline
EOF
)"
```

Cleanup after merge (run from main repo, not worktree):

```bash
cd /Users/smpceo/Documents/v2_meeshy
git worktree remove ../v2_meeshy-edit-profile-vm
```

---

## Self-Review (post-write)

**Spec coverage check** :

| Spec section | Task |
|--------------|------|
| `ProfileSnapshot` struct | Task 4 |
| `AuthManaging` extension (2 methods) | Tasks 4 + 5 |
| `MeeshyUser.withProfileChanges` | Task 3 |
| `AuthManager` impl | Task 5 |
| `MockAuthManager` update | Task 6 |
| `OfflineQueueing` protocol | Task 7 |
| `ProfileCacheWriting` protocol | Task 8 |
| `Sleeping` protocol + `SystemSleeper` | Task 9 |
| `ToastSurfacing` + `HapticSurfacing` adapters | Task 10 |
| `AttachmentUploading` + `AttachmentUploader` | Task 11 |
| Test doubles for 5 thin protocols | Task 12 |
| `EditProfileViewModel` skeleton + init + hasChanges + loadSelectedPhoto | Tasks 13-14 |
| `saveProfile` happy path no-avatar | Task 15 |
| `saveProfile` with avatar | Task 16 |
| Failure paths + outcome observer | Task 17 |
| `EditProfileView` refactor | Task 18 |
| Smoke tests | Task 19 |
| Test bundle fix #1 (StoryRepostFlowTests:144) | Task 1 |
| Test bundle fix #2 (`*ViewModelTests` async save) | Task 2 |

All 17 spec items covered.

**Placeholder scan** : none of the forbidden patterns (TBD, "fill in details", "similar to Task N", etc.) found in this plan. All steps include either runnable code or explicit commands with expected output.

**Type consistency** :
- `AuthManaging.applyLocalProfileChanges(displayName:bio:avatarUrl:) -> ProfileSnapshot` — same signature in protocol decl (Task 4), AuthManager impl (Task 5), MockAuthManager (Task 6), VM call site (Task 15).
- `MeeshyUser.withProfileChanges(displayName:bio:avatar:) -> MeeshyUser` — note: parameter labels are `displayName/bio/avatar`, not `avatarUrl`. Verified consistent across Task 3 (impl) and Task 5 (AuthManager call site).
- `OfflineQueueing.enqueue<P: Codable & Sendable>(_:payload:) async throws` + `outcomeStream(for:) async -> AsyncStream<OutboxOutcome>` — consistent across Tasks 7, 12, 15-17.
- `ProfileCacheWriting.saveProfile(_:for:) async throws` — Tasks 8, 12, 15.
- `Sleeping.sleep(milliseconds:) async` — Tasks 9, 12, 15.
- `SaveState` enum cases `.idle / .uploadingAvatar / .enqueueing / .success / .failed` — Tasks 13, 15, 16, 17.

No mismatches detected.
