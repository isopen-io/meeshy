import XCTest
import MeeshySDK
@testable import Meeshy

/// Réagir depuis la page plein écran d'une humeur (#18110) : la page passe par
/// le handler injecté depuis la racine (la même `reactToStatus` que la bulle),
/// pose l'emoji AVANT la réponse du serveur, le rend sur refus, ne le renvoie
/// pas deux fois et ne propose rien sur sa propre humeur.
@MainActor
final class MoodSpotlightReactionTests: XCTestCase {

    private final class StubSource: MoodSpotlightSourcing, @unchecked Sendable {
        let entry: StatusEntry
        init(entry: StatusEntry) { self.entry = entry }
        func cachedEntry(statusId: String) async -> StatusEntry? { entry }
        func fetchEntry(statusId: String) async throws -> StatusEntry? { entry }
        func cachedAuthor(userId: String) async -> MeeshyUser? { nil }
        func fetchAuthor(userId: String) async throws -> MeeshyUser { throw URLError(.notConnectedToInternet) }
        func recordView(statusId: String) async {}
    }

    private final class SilentSender: MoodReplySending, @unchecked Sendable {
        func sendReply(_ text: String, to entry: StatusEntry) async throws -> String { "conv" }
    }

    @MainActor
    private final class RecordingReactor {
        var outcome: StatusReactionOutcome = .sent
        var alreadyPlaced: Set<String> = []
        var calls: [(statusId: String, emoji: String)] = []
        var placedSeenDuringCall: Set<String>?
        weak var observed: MoodSpotlightViewModel?

        var handler: MoodReactionHandler {
            MoodReactionHandler(
                react: { [unowned self] statusId, emoji in
                    calls.append((statusId, emoji))
                    placedSeenDuringCall = observed?.reactions.placed
                    return outcome
                },
                placed: { [unowned self] _ in alreadyPlaced }
            )
        }
    }

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeSUT(authorId: String = "author", reactor: RecordingReactor? = RecordingReactor())
        -> (MoodSpotlightViewModel, RecordingReactor?) {
        let entry = StatusEntry(id: "s1", userId: authorId, username: "Alice", avatarColor: "6366F1",
                                moodEmoji: "\u{1F604}", content: "Heureux", createdAt: now,
                                expiresAt: now.addingTimeInterval(3600))
        let now = self.now
        let sut = MoodSpotlightViewModel(
            statusId: "s1", source: StubSource(entry: entry), sender: SilentSender(),
            currentUserId: { "me" }, now: { now },
            reactionHandler: { reactor?.handler }
        )
        reactor?.observed = sut
        return (sut, reactor)
    }

    func test_react_othersMood_sendsThroughTheInjectedHandler() async {
        let (sut, reactor) = makeSUT()
        await sut.load()

        await sut.react(with: "\u{1F525}")

        XCTAssertEqual(reactor?.calls.map(\.statusId), ["s1"])
        XCTAssertEqual(reactor?.calls.map(\.emoji), ["\u{1F525}"])
        XCTAssertEqual(sut.reactions.placed, ["\u{1F525}"])
    }

    func test_react_appliesTheEmojiBeforeTheServerAnswers() async {
        let (sut, reactor) = makeSUT()
        await sut.load()

        await sut.react(with: "\u{1F44D}")

        XCTAssertEqual(reactor?.placedSeenDuringCall, ["\u{1F44D}"])
    }

    func test_react_serverRefuses_rollsTheEmojiBack() async {
        let (sut, reactor) = makeSUT()
        reactor?.outcome = .failed
        await sut.load()

        await sut.react(with: "\u{1F44D}")

        XCTAssertTrue(sut.reactions.placed.isEmpty)
    }

    func test_react_sameEmojiTwice_sendsOnce() async {
        let (sut, reactor) = makeSUT()
        await sut.load()

        await sut.react(with: "\u{1F62E}")
        await sut.react(with: "\u{1F62E}")

        XCTAssertEqual(reactor?.calls.count, 1)
    }

    func test_react_ownMood_sendsNothing() async {
        let (sut, reactor) = makeSUT(authorId: "me")
        await sut.load()

        await sut.react(with: "\u{1F525}")

        XCTAssertFalse(sut.canReact)
        XCTAssertEqual(reactor?.calls.count, 0)
    }

    func test_canReact_withoutHandler_isFalse() async {
        let (sut, _) = makeSUT(reactor: nil)
        await sut.load()

        XCTAssertFalse(sut.canReact)
    }

    func test_load_emojiAlreadySentFromTheBubble_isShownPlacedAndNotResent() async {
        let reactor = RecordingReactor()
        reactor.alreadyPlaced = ["\u{2764}\u{FE0F}"]
        let (sut, _) = makeSUT(reactor: reactor)
        await sut.load()

        await sut.react(with: "\u{2764}\u{FE0F}")

        XCTAssertEqual(sut.reactions.placed, ["\u{2764}\u{FE0F}"])
        XCTAssertEqual(reactor.calls.count, 0)
    }
}
