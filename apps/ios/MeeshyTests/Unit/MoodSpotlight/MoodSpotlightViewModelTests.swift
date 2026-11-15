import XCTest
import MeeshySDK
@testable import Meeshy

/// La page plein écran d'une humeur (#10814) : cache d'abord, humeur expirée
/// rendue comme indisponible, réponse optimiste qui retrouve son texte en cas
/// d'échec, et une vue enregistrée une fois — jamais pour sa propre humeur.
@MainActor
final class MoodSpotlightViewModelTests: XCTestCase {

    private final class FakeSource: MoodSpotlightSourcing, @unchecked Sendable {
        var cached: StatusEntry?
        var fetched: Result<StatusEntry?, Error> = .success(nil)
        var author: MeeshyUser?
        var recordedViews: [String] = []
        var fetchEntryCalls = 0

        func cachedEntry(statusId: String) async -> StatusEntry? { cached }
        func fetchEntry(statusId: String) async throws -> StatusEntry? {
            fetchEntryCalls += 1
            return try fetched.get()
        }
        func cachedAuthor(userId: String) async -> MeeshyUser? { author }
        func fetchAuthor(userId: String) async throws -> MeeshyUser {
            guard let author else { throw URLError(.notConnectedToInternet) }
            return author
        }
        func recordView(statusId: String) async { recordedViews.append(statusId) }
    }

    private final class FakeSender: MoodReplySending, @unchecked Sendable {
        var result: Result<String, Error> = .success("conv-1")
        var sent: [(String, String)] = []
        func sendReply(_ text: String, to entry: StatusEntry) async throws -> String {
            sent.append((text, entry.id))
            return try result.get()
        }
    }

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeEntry(id: String = "s1", userId: String = "author", content: String? = "Heureux",
                           expiresIn: TimeInterval = 3600) -> StatusEntry {
        StatusEntry(id: id, userId: userId, username: "Alice", avatarColor: "6366F1", moodEmoji: "😄",
                    content: content, createdAt: now, expiresAt: now.addingTimeInterval(expiresIn))
    }

    private func makeSUT(currentUserId: String = "me") -> (MoodSpotlightViewModel, FakeSource, FakeSender) {
        let source = FakeSource()
        let sender = FakeSender()
        let now = self.now
        let sut = MoodSpotlightViewModel(statusId: "s1", source: source, sender: sender,
                                         currentUserId: { currentUserId }, now: { now })
        return (sut, source, sender)
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    func test_load_cachedAndNetworkFails_keepsTheCachedMood() async {
        let (sut, source, _) = makeSUT()
        source.cached = makeEntry()
        source.fetched = .failure(URLError(.notConnectedToInternet))

        await sut.load()

        XCTAssertEqual(sut.entry?.id, "s1")
    }

    func test_load_networkServesNewerContent_replacesTheCachedMood() async {
        let (sut, source, _) = makeSUT()
        source.cached = makeEntry(content: "ancien")
        source.fetched = .success(makeEntry(content: "nouveau"))

        await sut.load()

        XCTAssertEqual(sut.entry?.content, "nouveau")
    }

    func test_load_expiredMood_isUnavailable() async {
        let (sut, source, _) = makeSUT()
        source.fetched = .success(makeEntry(expiresIn: -10))

        await sut.load()

        XCTAssertEqual(sut.content, .unavailable)
    }

    func test_load_notAMood_isUnavailable() async {
        let (sut, source, _) = makeSUT()
        source.fetched = .success(nil)

        await sut.load()

        XCTAssertEqual(sut.content, .unavailable)
    }

    func test_load_resolvesTheAuthorBanner() async {
        let (sut, source, _) = makeSUT()
        source.fetched = .success(makeEntry())
        source.author = MeeshyUser(id: "author", username: "alice", banner: "https://x/banner.jpg")

        await sut.load()

        XCTAssertEqual(sut.author?.banner, "https://x/banner.jpg")
    }

    func test_load_someoneElsesMood_recordsOneView() async {
        let (sut, source, _) = makeSUT()
        source.cached = makeEntry()
        source.fetched = .success(makeEntry())

        await sut.load()
        await settle()

        XCTAssertEqual(source.recordedViews, ["s1"])
    }

    func test_load_ownMood_recordsNoViewAndCannotReply() async {
        let (sut, source, _) = makeSUT(currentUserId: "author")
        source.fetched = .success(makeEntry())

        await sut.load()
        await settle()

        XCTAssertTrue(source.recordedViews.isEmpty)
        XCTAssertFalse(sut.canReply)
    }

    func test_sendReply_success_clearsTheFieldAndSendsToTheMood() async {
        let (sut, source, sender) = makeSUT()
        source.fetched = .success(makeEntry())
        await sut.load()
        sut.replyText = "  Trop bien !  "

        await sut.sendReply()

        XCTAssertEqual(sender.sent.first?.0, "Trop bien !")
        XCTAssertEqual(sender.sent.first?.1, "s1")
        XCTAssertEqual(sut.replyText, "")
        XCTAssertEqual(sut.replyState, .sent)
    }

    func test_sendReply_failure_restoresTheText() async {
        let (sut, source, sender) = makeSUT()
        source.fetched = .success(makeEntry())
        sender.result = .failure(URLError(.timedOut))
        await sut.load()
        sut.replyText = "Coucou"

        await sut.sendReply()

        XCTAssertEqual(sut.replyText, "Coucou")
        XCTAssertEqual(sut.replyState, .failed)
    }

    func test_sendReply_blankText_sendsNothing() async {
        let (sut, source, sender) = makeSUT()
        source.fetched = .success(makeEntry())
        await sut.load()
        sut.replyText = "   "

        await sut.sendReply()

        XCTAssertTrue(sender.sent.isEmpty)
        XCTAssertEqual(sut.replyState, .idle)
    }
}
