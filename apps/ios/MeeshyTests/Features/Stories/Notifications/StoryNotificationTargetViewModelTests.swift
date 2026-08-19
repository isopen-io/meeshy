import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryNotificationTargetViewModelTests: XCTestCase {

    // MARK: - Helpers

    private func makeContext() -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Alice",
            trigger: .reaction(emoji: "🔥"),
            occurredAt: Date()
        )
    }

    private func makePost(id: String, expiresAt: Date?, referenceAccess: ReferenceAccess? = nil) -> APIPost {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiresAtJSON = expiresAt.map { "\"\(formatter.string(from: $0))\"" } ?? "null"
        let referenceAccessJSON = referenceAccess.map { "\"\($0.rawValue)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": "story content",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "expiresAt": \(expiresAtJSON),
            "referenceAccess": \(referenceAccessJSON),
            "author": {"id": "a1", "username": "alice"}
        }
        """)
    }

    // MARK: - Tests

    func test_load_withCachedActiveStory_emitsActiveImmediately() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = post
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active, got \(vm.state)")
        }
    }

    func test_load_withCachedExpiredStory_emitsExpiredImmediately() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600))
        mock.cachedPostResult = post
        mock.fetchPostResult = .failure(APIError.serverError(404, "Not Found"))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .comments,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_withoutCache_fetchesFromNetwork_thenEmitsActive() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active, got \(vm.state)")
        }
    }

    func test_load_withoutCache_andNetwork404_emitsExpired() async {
        let mock = MockStoryService()
        mock.cachedPostResult = nil
        mock.fetchPostResult = .failure(APIError.serverError(404, "Not Found"))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    /// P2 — a network/offline failure is NOT proof the story is gone. Tapping
    /// a story notification with no connectivity used to show the same
    /// "Story expired" empty state (with a "Create a story" CTA) as a
    /// genuine 404 — a transient network error must surface a retryable
    /// `.offline` state instead, never fabricate `.expired`.
    func test_load_withoutCache_andNetworkError_emitsOffline_notExpired() async {
        let mock = MockStoryService()
        mock.cachedPostResult = nil
        mock.fetchPostResult = .failure(URLError(.notConnectedToInternet))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .offline)
    }

    /// A 5xx is likewise not a confirmed "not found" — only a genuine 404
    /// (`APIError.serverError(404, _)`) may claim `.expired`.
    func test_load_withoutCache_andServerError500_emitsOffline_notExpired() async {
        let mock = MockStoryService()
        mock.cachedPostResult = nil
        mock.fetchPostResult = .failure(APIError.serverError(500, "Internal Server Error"))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .offline)
    }

    /// A cache hit already answered the question (active or expired) — a
    /// subsequent network error revalidating in the background must not
    /// downgrade that answer to `.offline`.
    func test_load_cachedActive_thenNetworkError_keepsActiveNotOffline() async {
        let mock = MockStoryService()
        let cached = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = cached
        mock.fetchPostResult = .failure(URLError(.notConnectedToInternet))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active (cache already answered) got \(vm.state)")
        }
    }

    func test_load_cacheActive_butNetworkReturnsExpired_revalidatesToExpired() async {
        let mock = MockStoryService()
        let cached = makePost(id: "p1", expiresAt: Date().addingTimeInterval(60))
        let fresh = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-1))
        mock.cachedPostResult = cached
        mock.fetchPostResult = .success(fresh)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_idempotent_canBeCalledMultipleTimes() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        await vm.load()
        await vm.load()

        if case .active = vm.state {} else { XCTFail("Expected .active, got \(vm.state)") }
        XCTAssertEqual(mock.fetchPostCallCount, 3)
    }

    // MARK: - Task 9 — le droit se DÉCLARE, il ne se déduit jamais de expiresAt

    /// Un contenu expiré dont le lecteur détient un droit de référence
    /// ACCORDÉ doit s'ouvrir normalement — `isExpired` seul le refuserait.
    func test_expiredStory_withGrantedReferenceAccess_rendersActive() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600), referenceAccess: .granted)
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1", intent: .reactions, context: makeContext(), storyService: mock
        )
        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active (referenceAccess granted overrides expiresAt), got \(vm.state)")
        }
    }

    /// Droit ÉTEINT (fenêtre de 24h post-expiration close) : un état DISTINCT
    /// de `.expired`, pas le même repli qu'un contenu jamais référencé.
    func test_expiredStory_withConsumedReferenceAccess_rendersExpiredConsumed() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600), referenceAccess: .consumed)
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1", intent: .reactions, context: makeContext(), storyService: mock
        )
        await vm.load()

        XCTAssertEqual(vm.state, .expiredConsumed)
    }

    /// Sans référence pour ce lecteur (`.none`, le cas enum explicite —
    /// distinct de `nil`), le comportement historique s'applique inchangé.
    func test_expiredStory_withNoneReferenceAccess_rendersExpired() async {
        let mock = MockStoryService()
        // Qualifié explicitement : un `.none` nu se lie à `Optional.none`
        // (nil), pas au cas enum `ReferenceAccess.none` — piège Swift déjà
        // vécu (cf. XCTAssertEqual d'enum optionnel).
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600), referenceAccess: ReferenceAccess.none)
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1", intent: .reactions, context: makeContext(), storyService: mock
        )
        await vm.load()

        XCTAssertEqual(vm.state, .expired)
    }

    /// Le CHARGEMENT — cache-first, prefetch NSE, revalidation réseau — ne
    /// doit JAMAIS consommer le droit. `markViewed` (`POST /posts/:id/view`)
    /// n'est appelé que par le viewer, quand la slide est réellement affichée
    /// à l'écran (`StoryViewerView+Content`). Deux `load()` d'affilée
    /// (idempotence documentée) doivent laisser ce compteur à zéro.
    func test_load_neverCallsMarkViewed() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600), referenceAccess: .granted)
        mock.cachedPostResult = post
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1", intent: .reactions, context: makeContext(), storyService: mock
        )
        await vm.load()
        await vm.load()

        XCTAssertEqual(mock.markViewedCallCount, 0)
    }
}

// MARK: - LoadState Equatable conformance for assertions

extension StoryNotificationTargetViewModel.LoadState: @retroactive Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.loading, .loading), (.expired, .expired),
             (.expiredConsumed, .expiredConsumed), (.offline, .offline):
            return true
        case (.active(let a), .active(let b)):
            return a.id == b.id
        default:
            return false
        }
    }
}
