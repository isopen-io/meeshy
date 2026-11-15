import XCTest
@testable import Meeshy
import MeeshySDK

/// Réagir à l'humeur d'un contact (#18110) : la fonction unique
/// `reactToStatus` dit ce qui est arrivé, ne renvoie jamais deux fois le même
/// emoji sur un même statut dans la session, et rend l'emoji à l'utilisateur
/// quand le serveur refuse.
@MainActor
final class StatusReactionTests: XCTestCase {

    private func makeSUT() -> (sut: StatusViewModel, service: MockStatusService) {
        let service = MockStatusService()
        let sut = StatusViewModel(
            mode: .friends,
            statusService: service,
            socialSocket: MockSocialSocket(),
            authManager: MockAuthManager(),
            postService: MockPostService()
        )
        return (sut, service)
    }

    private func makeEntry(id: String = "s1") -> StatusEntry {
        StatusEntry(id: id, userId: "author", username: "alice", avatarColor: "6366F1", moodEmoji: "\u{1F389}")
    }

    func test_reactToStatus_serverAccepts_returnsSent() async {
        let (sut, _) = makeSUT()
        sut.statuses = [makeEntry()]

        let outcome = await sut.reactToStatus("s1", emoji: "\u{2764}\u{FE0F}")

        XCTAssertEqual(outcome, .sent)
    }

    func test_reactToStatus_sameEmojiTwiceOnSameStatus_sendsOnce() async {
        let (sut, service) = makeSUT()
        sut.statuses = [makeEntry()]

        await sut.reactToStatus("s1", emoji: "\u{1F525}")
        let second = await sut.reactToStatus("s1", emoji: "\u{1F525}")

        XCTAssertEqual(second, .alreadyPlaced)
        XCTAssertEqual(service.reactCallCount, 1)
        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{1F525}"], 1)
    }

    func test_reactToStatus_sameEmojiOnAnotherStatus_isSent() async {
        let (sut, service) = makeSUT()
        sut.statuses = [makeEntry(id: "s1"), makeEntry(id: "s2")]

        await sut.reactToStatus("s1", emoji: "\u{1F525}")
        let other = await sut.reactToStatus("s2", emoji: "\u{1F525}")

        XCTAssertEqual(other, .sent)
        XCTAssertEqual(service.reactCallCount, 2)
    }

    func test_reactToStatus_serverRefuses_returnsFailedAndAllowsARetry() async {
        let (sut, service) = makeSUT()
        sut.statuses = [makeEntry()]
        service.reactResult = .failure(NSError(domain: "test", code: 1))

        let refused = await sut.reactToStatus("s1", emoji: "\u{1F44D}")
        service.reactResult = .success(())
        let retried = await sut.reactToStatus("s1", emoji: "\u{1F44D}")

        XCTAssertEqual(refused, .failed)
        XCTAssertEqual(retried, .sent)
        XCTAssertEqual(service.reactCallCount, 2)
    }

    func test_reactToStatus_statusNotInTheBar_stillReachesTheServer() async {
        let (sut, service) = makeSUT()

        let outcome = await sut.reactToStatus("absent", emoji: "\u{1F62E}")

        XCTAssertEqual(outcome, .sent)
        XCTAssertEqual(service.lastReactStatusId, "absent")
    }

    func test_reactionHandler_react_goesThroughReactToStatusAndRemembersTheEmoji() async {
        let (sut, service) = makeSUT()
        sut.statuses = [makeEntry()]
        let handler = sut.reactionHandler

        let outcome = await handler.react("s1", "\u{1F64F}")

        XCTAssertEqual(outcome, .sent)
        XCTAssertEqual(service.lastReactEmoji, "\u{1F64F}")
        XCTAssertEqual(handler.placed("s1"), ["\u{1F64F}"])
        XCTAssertEqual(sut.statuses[0].reactionSummary?["\u{1F64F}"], 1)
    }

    func test_reactionHandler_placed_afterRefusal_isEmpty() async {
        let (sut, service) = makeSUT()
        service.reactResult = .failure(NSError(domain: "test", code: 1))
        let handler = sut.reactionHandler

        _ = await handler.react("s1", "\u{1F44D}")

        XCTAssertTrue(handler.placed("s1").isEmpty)
    }
}
