import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// « Ensemble » sur iOS (#17097) : une invitation se propose, se rejoint d'un geste ou se refuse ; la séance suit les
/// synchronisations servies ; une fin ferme le lecteur et ne se rouvre pas ; un refus se dit sans sa raison.
@MainActor
final class TogetherCenterTests: XCTestCase {

    final class FakeEmitter: TogetherEmitting, @unchecked Sendable {
        var inviteOutcome: TogetherInviteOutcome = .failed
        var joinOutcome: TogetherJoinOutcome = .failed
        var syncResult: TogetherPlayback?
        private(set) var invites: [(toUserId: String, conversationId: String, attachmentId: String)] = []
        private(set) var joins: [String] = []
        private(set) var syncs: [(sessionId: String, playing: Bool, positionMs: Double)] = []
        private(set) var leaves: [String] = []

        func invite(toUserId: String, conversationId: String, attachmentId: String) async -> TogetherInviteOutcome {
            invites.append((toUserId, conversationId, attachmentId))
            return inviteOutcome
        }

        func join(sessionId: String) async -> TogetherJoinOutcome {
            joins.append(sessionId)
            return joinOutcome
        }

        func sync(sessionId: String, playing: Bool, positionMs: Double) async -> TogetherPlayback? {
            syncs.append((sessionId, playing, positionMs))
            return syncResult
        }

        func leave(sessionId: String) {
            leaves.append(sessionId)
        }
    }

    private static let sessionId = String(repeating: "b", count: 32)

    private func makeCenter(_ emitter: FakeEmitter, viewer: String = "me", people: [CirclePerson] = []) -> TogetherCenter {
        TogetherCenter(
            emitter: emitter,
            people: FakeCirclePeople(people),
            viewerId: { viewer },
            invitedEvents: Empty().eraseToAnyPublisher(),
            startedEvents: Empty().eraseToAnyPublisher(),
            syncedEvents: Empty().eraseToAnyPublisher(),
            endedEvents: Empty().eraseToAnyPublisher(),
            now: { Date(timeIntervalSince1970: 1_000) }
        )
    }

    private func invited(from: String = "proche") -> TogetherInvited {
        TogetherInvited(sessionId: Self.sessionId, fromUserId: from, conversationId: "c", attachmentId: "a", media: .video, expiresAt: "x")
    }

    private func playback(playing: Bool = true, rev: Int = 1) -> TogetherPlayback {
        TogetherPlayback(playing: playing, positionMs: 0, at: 1_000_000, rev: rev, byUserId: "proche")
    }

    private func started(host: String = "proche", guest: String = "me", rev: Int = 1) -> TogetherStarted {
        TogetherStarted(sessionId: Self.sessionId, hostUserId: host, guestUserId: guest, conversationId: "c", attachmentId: "a", media: .video, playback: playback(rev: rev))
    }

    func test_anInvitation_isOffered_andJoiningOpensTheSessionWithoutWaitingForTheEvent() async {
        let emitter = FakeEmitter()
        emitter.joinOutcome = .joined(started())
        let center = makeCenter(emitter)

        center.receive(invited())
        XCTAssertEqual(center.state.invitation?.sessionId, Self.sessionId)

        await center.join()

        XCTAssertEqual(emitter.joins, [Self.sessionId])
        XCTAssertNil(center.state.invitation)
        XCTAssertEqual(center.state.session?.partnerId, "proche")
    }

    func test_joiningAnInvitationThatIsGone_closesIt_andSaysOnlyThat() async {
        let emitter = FakeEmitter()
        emitter.joinOutcome = .gone
        let center = makeCenter(emitter)
        center.receive(invited())

        await center.join()

        XCTAssertNil(center.state.invitation)
        XCTAssertEqual(center.notice, .gone)
    }

    func test_declining_closesHere_andTellsTheServer() {
        let emitter = FakeEmitter()
        let center = makeCenter(emitter)
        center.receive(invited())

        center.decline()

        XCTAssertNil(center.state.invitation)
        XCTAssertEqual(emitter.leaves, [Self.sessionId])
        center.receive(invited())
        XCTAssertNil(center.state.invitation, "une invitation refusée ne se représente pas")
    }

    func test_anInvitationSent_waits_thenTheStartedEventOpensTheSessionForTheHost() async {
        let emitter = FakeEmitter()
        emitter.inviteOutcome = .invited(sessionId: Self.sessionId, media: .video)
        let center = makeCenter(emitter)

        let outcome = await center.invite(toUserId: "proche", conversationId: "c", attachmentId: "a")

        XCTAssertEqual(outcome, .invited(sessionId: Self.sessionId, media: .video))
        XCTAssertEqual(center.state.outgoing?.toUserId, "proche")
        center.receive(started(host: "me", guest: "proche"))
        XCTAssertNil(center.state.outgoing)
        XCTAssertEqual(center.state.session?.partnerId, "proche")
    }

    func test_aRefusedInvitation_opensNothing() async {
        let emitter = FakeEmitter()
        emitter.inviteOutcome = .notAllowed
        let center = makeCenter(emitter)

        let outcome = await center.invite(toUserId: "ami", conversationId: "c", attachmentId: "a")

        XCTAssertEqual(outcome, .notAllowed)
        XCTAssertNil(center.state.outgoing)
    }

    func test_aLocalGesture_isSent_andTheServedStateIsApplied() async {
        let emitter = FakeEmitter()
        emitter.syncResult = playback(playing: false, rev: 2)
        let center = makeCenter(emitter)
        center.receive(started())

        await center.sync(playing: false, positionMs: 4_200)

        XCTAssertEqual(emitter.syncs.first?.positionMs, 4_200)
        XCTAssertEqual(center.state.session?.playback.rev, 2)
        XCTAssertEqual(center.state.session?.playback.playing, false)
    }

    func test_anEnd_closesTheSession_saysSo_andALateEventDoesNotReopenIt() {
        let center = makeCenter(FakeEmitter())
        center.receive(started())

        center.receive(TogetherEnded(sessionId: Self.sessionId, reason: .left, endedAt: "x"))

        XCTAssertNil(center.state.session)
        XCTAssertEqual(center.notice, .ended)
        center.receive(started())
        XCTAssertNil(center.state.session)
    }

    func test_leaving_closesHereFirst_thenTellsTheOther() {
        let emitter = FakeEmitter()
        let center = makeCenter(emitter)
        center.receive(started())

        center.leave()

        XCTAssertNil(center.state.session)
        XCTAssertEqual(emitter.leaves, [Self.sessionId])
    }

    func test_myOwnInvitation_fromAnotherOfMyDevices_isNeverOffered() {
        let center = makeCenter(FakeEmitter(), viewer: "proche")

        center.receive(invited(from: "proche"))

        XCTAssertNil(center.state.invitation)
    }

    func test_anUnknownPerson_isSomeone_neverInvented() {
        let center = makeCenter(FakeEmitter())

        XCTAssertFalse(center.name(of: "inconnu").isEmpty)
        XCTAssertNotEqual(center.name(of: "inconnu"), "inconnu")
    }
}
