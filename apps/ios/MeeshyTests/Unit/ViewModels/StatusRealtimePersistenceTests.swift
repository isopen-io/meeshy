import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// W4 lot 3 — les sinks temps réel des moods ne mutaient que `@Published
/// statuses` : rien n'atteignait le cache, donc un mood créé / supprimé /
/// réagi pendant la session disparaissait au prochain démarrage à froid. Et
/// `status:unreacted`, publié par le SDK, n'avait AUCUN abonné.
@MainActor
final class StatusRealtimePersistenceTests: XCTestCase {

    private let cacheKey = "statuses_friends"

    private func makeSUT() -> (sut: StatusViewModel, socket: MockSocialSocket, auth: MockAuthManager) {
        let socket = MockSocialSocket()
        let auth = MockAuthManager()
        let sut = StatusViewModel(
            mode: .friends,
            statusService: MockStatusService(),
            socialSocket: socket,
            authManager: auth,
            postService: MockPostService()
        )
        return (sut, socket, auth)
    }

    private func makeEntry(id: String, summary: [String: Int]? = nil) -> StatusEntry {
        StatusEntry(id: id, userId: "u", username: "a", avatarColor: "FFFFFF",
                    moodEmoji: "\u{1F389}", reactionSummary: summary)
    }

    private func unreacted(statusId: String, userId: String, emoji: String)
        -> SocketStatusUnreactedData {
        SocketStatusUnreactedData(statusId: statusId, userId: userId, emoji: emoji)
    }

    private func cachedStatuses() async -> [StatusEntry]? {
        await CacheCoordinator.shared.statuses.load(for: cacheKey).snapshot()
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.statuses.invalidate(for: cacheKey)
    }

    // MARK: - applyingReaction (pure)

    func test_applyingReaction_incrementsFromNilSummary() {
        XCTAssertEqual(
            StatusViewModel.applyingReaction(emoji: "\u{2764}", delta: 1, to: nil),
            ["\u{2764}": 1]
        )
    }

    func test_applyingReaction_decrementToZero_dropsTheKey() {
        XCTAssertEqual(
            StatusViewModel.applyingReaction(emoji: "\u{2764}", delta: -1, to: ["\u{2764}": 1]),
            [:]
        )
    }

    func test_applyingReaction_neverGoesNegative() {
        XCTAssertEqual(
            StatusViewModel.applyingReaction(emoji: "\u{2764}", delta: -1, to: [:]),
            [:]
        )
    }

    func test_applyingReaction_leavesOtherEmojisUntouched() {
        XCTAssertEqual(
            StatusViewModel.applyingReaction(emoji: "\u{1F525}", delta: 1,
                                             to: ["\u{2764}": 2]),
            ["\u{2764}": 2, "\u{1F525}": 1]
        )
    }

    // MARK: - status:unreacted (aucun abonné jusqu'ici)

    func test_socketStatusUnreacted_fromOtherUser_decrementsSummary() async throws {
        let (sut, socket, _) = makeSUT()
        sut.statuses = [makeEntry(id: "s1", summary: ["\u{1F44D}": 2])]
        sut.subscribeToSocketEvents()

        socket.statusUnreacted.send(
            unreacted(statusId: "s1", userId: "other", emoji: "\u{1F44D}")
        )

        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{1F44D}"], 1)
    }

    func test_socketStatusUnreacted_fromSelf_isIgnored() async throws {
        let (sut, socket, auth) = makeSUT()
        auth.currentUser = MeeshyUser(id: "me", username: "moi")
        sut.statuses = [makeEntry(id: "s1", summary: ["\u{1F44D}": 2])]
        sut.subscribeToSocketEvents()

        socket.statusUnreacted.send(
            unreacted(statusId: "s1", userId: "me", emoji: "\u{1F44D}")
        )

        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(
            sut.statuses[0].reactionSummary?["\u{1F44D}"], 2,
            "l'écho de notre propre retrait est déjà appliqué localement"
        )
    }

    // MARK: - persistance des sinks

    func test_socketStatusDeleted_persistsTheRemoval() async throws {
        let (sut, socket, _) = makeSUT()
        sut.statuses = [makeEntry(id: "s-gone"), makeEntry(id: "s-stays")]
        try await CacheCoordinator.shared.statuses.save(sut.statuses, for: cacheKey)
        sut.subscribeToSocketEvents()

        socket.statusDeleted.send("s-gone")

        try await Task.sleep(nanoseconds: 250_000_000)
        let cached = await cachedStatuses()
        XCTAssertEqual(cached?.map(\.id), ["s-stays"])
    }

    func test_socketStatusReacted_persistsTheNewSummary() async throws {
        let (sut, socket, _) = makeSUT()
        sut.statuses = [makeEntry(id: "s1")]
        try await CacheCoordinator.shared.statuses.save(sut.statuses, for: cacheKey)
        sut.subscribeToSocketEvents()

        let payload = try JSONDecoder().decode(
            SocketStatusReactedData.self,
            from: Data("{\"statusId\":\"s1\",\"userId\":\"other\",\"emoji\":\"\u{1F44D}\"}".utf8)
        )
        socket.statusReacted.send(payload)

        try await Task.sleep(nanoseconds: 250_000_000)
        let cached = await cachedStatuses()
        XCTAssertEqual(cached?.first?.reactionSummary?["\u{1F44D}"], 1)
    }
}
