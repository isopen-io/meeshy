import Combine
import MeeshySDK
import XCTest
@testable import Meeshy

// #8433 · #8438 · #8439 — les contrôles d'un appel en cours, côté app :
// l'invitation se montre tout de suite et se retire si la passerelle refuse ;
// l'admin seul modère, jamais soi-même ; un micro coupé par l'admin se coupe
// ici ; une réaction s'affiche d'abord chez soi, au plus cinq par seconde.
@MainActor
final class CallControlsControllerTests: XCTestCase {

    private final class MockSocket: CallControlsSocketProviding, @unchecked Sendable {
        var inviteError: Error?
        var muteError: Error?
        var invites: [(callId: String, userId: String)] = []
        var mutes: [(callId: String, targetUserId: String)] = []
        var reactions: [CallReactionEmoji] = []

        var callControlEvents: AnyPublisher<CallControlSocketEvent, Never> { Empty().eraseToAnyPublisher() }

        func inviteCallParticipant(callId: String, userId: String) async throws {
            invites.append((callId, userId))
            if let inviteError { throw inviteError }
        }

        func muteCallParticipant(callId: String, targetUserId: String) async throws {
            mutes.append((callId, targetUserId))
            if let muteError { throw muteError }
        }

        func sendCallReaction(callId: String, emoji: CallReactionEmoji) async throws {
            reactions.append(emoji)
        }
    }

    private final class MockRemote: CallModerationRemoteServiceProviding, @unchecked Sendable {
        var removals: [(callId: String, participantId: String)] = []

        func removeParticipant(callId: String, participantId: String) async throws {
            removals.append((callId, participantId))
        }
    }

    private final class MockHost: CallControlsHosting {
        var controlsCallId: String? = "call-1"
        var moderatorMutes = 0

        func applyModeratorMute() { moderatorMutes += 1 }
        func participantName(for userId: String) -> String {
            switch userId {
            case "u-admin": return "Sam"
            case "u-ghost": return ""
            default: return userId
            }
        }
    }

    private struct Env {
        let sut: CallControlsController
        let socket: MockSocket
        let remote: MockRemote
        let host: MockHost
        let clock: Clock
    }

    private final class Clock {
        var now = Date(timeIntervalSince1970: 1_000)
    }

    private func makeEnv() -> Env {
        let socket = MockSocket()
        let remote = MockRemote()
        let host = MockHost()
        let clock = Clock()
        let sut = CallControlsController(
            socket: socket,
            remote: remote,
            viewerId: { "u-me" },
            now: { clock.now },
            wait: { _ in },
            events: Empty().eraseToAnyPublisher()
        )
        sut.host = host
        return Env(sut: sut, socket: socket, remote: remote, host: host, clock: clock)
    }

    private let lea = CallInvitedUser(userId: "u-lea", username: "lea", displayName: "Léa", avatar: nil)

    // MARK: - Invitation (#8433)

    func test_invite_showsTheRingingTileAtOnce_andAsksTheGateway() async {
        let env = makeEnv()

        let task = env.sut.invite(lea)

        XCTAssertEqual(env.sut.invites.map(\.userId), ["u-lea"])
        await task?.value
        XCTAssertEqual(env.socket.invites.map(\.userId), ["u-lea"])
        XCTAssertEqual(env.sut.invites.map(\.userId), ["u-lea"])
    }

    func test_invite_refused_removesTheTile_andSaysWhy() async {
        let env = makeEnv()
        env.socket.inviteError = CallControlRefusal(code: "MAX_PARTICIPANTS_REACHED")

        await env.sut.invite(lea)?.value

        XCTAssertTrue(env.sut.invites.isEmpty)
        XCTAssertEqual(env.sut.notice, .inviteFailed(code: "MAX_PARTICIPANTS_REACHED"))
    }

    func test_invite_twice_asksOnce() async {
        let env = makeEnv()
        await env.sut.invite(lea)?.value

        XCTAssertNil(env.sut.invite(lea))
        XCTAssertEqual(env.socket.invites.count, 1)
    }

    func test_participantInvited_byAnother_showsTheTileToEveryone() {
        let env = makeEnv()

        env.sut.receive(.participantInvited(CallParticipantInvitedEvent(callId: "call-1", invitedBy: "u-admin", invitee: lea, participantCount: 3)))

        XCTAssertEqual(env.sut.invites.map(\.userId), ["u-lea"])
    }

    func test_eventOfAnotherCall_isIgnored() {
        let env = makeEnv()

        env.sut.receive(.participantInvited(CallParticipantInvitedEvent(callId: "call-2", invitedBy: "u-admin", invitee: lea, participantCount: 3)))

        XCTAssertTrue(env.sut.invites.isEmpty)
    }

    func test_invitee_whoJoined_leavesTheRingingTiles() async {
        let env = makeEnv()
        await env.sut.invite(lea)?.value

        env.sut.rosterChanged(memberIds: ["u-lea"])

        XCTAssertTrue(env.sut.invites.isEmpty)
    }

    // MARK: - Modération (#8438)

    func test_moderation_initiator_moderatesOthers_neverHimself() {
        let rule = CallModerationRule(isActiveInitiator: true, conversationRole: nil)

        XCTAssertTrue(rule.mayModerate(targetUserId: "u-lea", viewerId: "u-me"))
        XCTAssertFalse(rule.mayModerate(targetUserId: "u-me", viewerId: "u-me"))
    }

    func test_moderation_plainMember_moderatesNobody() {
        let rule = CallModerationRule(isActiveInitiator: false, conversationRole: "member")

        XCTAssertFalse(rule.mayModerate(targetUserId: "u-lea", viewerId: "u-me"))
    }

    func test_moderation_conversationModerator_mayModerate() {
        let rule = CallModerationRule(isActiveInitiator: false, conversationRole: "moderator")

        XCTAssertTrue(rule.mayModerate(targetUserId: "u-lea", viewerId: "u-me"))
    }

    func test_mute_asksTheGatewayForTheTarget() async {
        let env = makeEnv()

        await env.sut.mute(targetUserId: "u-lea")?.value

        XCTAssertEqual(env.socket.mutes.map(\.targetUserId), ["u-lea"])
        XCTAssertNil(env.sut.notice)
    }

    func test_mute_refused_saysWhy() async {
        let env = makeEnv()
        env.socket.muteError = CallControlRefusal(code: "PERMISSION_DENIED")

        await env.sut.mute(targetUserId: "u-lea")?.value

        XCTAssertEqual(env.sut.notice, .actionFailed(code: "PERMISSION_DENIED"))
    }

    func test_remove_deletesTheParticipantFromTheCall() async {
        let env = makeEnv()

        await env.sut.remove(participantId: "u-lea")?.value

        XCTAssertEqual(env.remote.removals.map(\.participantId), ["u-lea"])
    }

    func test_mutedByModerator_mutesMyMicrophone_andSaysWho() {
        let env = makeEnv()

        env.sut.receive(.mutedByModerator(CallMutedByModeratorEvent(callId: "call-1", byUserId: "u-admin")))

        XCTAssertEqual(env.host.moderatorMutes, 1)
        XCTAssertEqual(env.sut.notice, .mutedBy(name: "Sam"))
    }

    // MARK: - Réactions (#8439)

    func test_react_showsMyReactionAtOnce_andSendsIt() async {
        let env = makeEnv()

        let task = env.sut.react(.fire)

        XCTAssertEqual(env.sut.reactions.map(\.emoji), [.fire])
        await task?.value
        XCTAssertEqual(env.socket.reactions, [.fire])
    }

    func test_react_moreThanFivePerSecond_isHeldBack() {
        let env = makeEnv()

        let sent = (0..<7).compactMap { _ in env.sut.react(.clap) }

        XCTAssertEqual(sent.count, 5)
        env.clock.now = env.clock.now.addingTimeInterval(1.1)
        XCTAssertNotNil(env.sut.react(.clap))
    }

    func test_reactionReceived_isShownToo() {
        let env = makeEnv()

        env.sut.receive(.reactionReceived(CallReactionReceivedEvent(callId: "call-1", userId: "u-lea", emoji: .heart)))

        XCTAssertEqual(env.sut.reactions.map(\.emoji), [.heart])
    }

    func test_reactionReceived_carriesItsAuthorsName() {
        let env = makeEnv()

        env.sut.receive(.reactionReceived(CallReactionReceivedEvent(callId: "call-1", userId: "u-admin", emoji: .heart)))

        XCTAssertEqual(env.sut.reactions.map(\.author), [.peer(name: "Sam")])
    }

    func test_react_carriesMeAsItsAuthor() {
        let env = makeEnv()

        env.sut.react(.fire)

        XCTAssertEqual(env.sut.reactions.map(\.author), [.me])
    }

    func test_reactionReceived_fromMyOwnId_isMine() {
        let env = makeEnv()

        env.sut.receive(.reactionReceived(CallReactionReceivedEvent(callId: "call-1", userId: "u-me", emoji: .clap)))

        XCTAssertEqual(env.sut.reactions.map(\.author), [.me])
    }

    func test_reactionReceived_fromAnUnnamedParticipant_isSomeone() {
        let env = makeEnv()

        env.sut.receive(.reactionReceived(CallReactionReceivedEvent(callId: "call-1", userId: "u-ghost", emoji: .laugh)))

        XCTAssertEqual(env.sut.reactions.map(\.author), [.someone])
    }

    func test_reaction_fadesAwayAfterItsFlight() async {
        let env = makeEnv()

        let task = env.sut.react(.party)
        await task?.value
        await env.sut.pendingExpiry?.value

        XCTAssertTrue(env.sut.reactions.isEmpty)
    }

    func test_callEnded_forgetsEverything() async {
        let env = makeEnv()
        await env.sut.invite(lea)?.value

        env.sut.callEnded()

        XCTAssertTrue(env.sut.invites.isEmpty)
        XCTAssertTrue(env.sut.reactions.isEmpty)
    }

    // MARK: - Invitation reçue

    func test_incomingInvitation_namesTheInviter() {
        XCTAssertEqual(CallOfferPresentation.callerName(initiator: "Sam", inviter: "Léa"), String(format: CallControlsCopy.invitedFormat, "Léa"))
        XCTAssertEqual(CallOfferPresentation.callerName(initiator: "Sam", inviter: nil), "Sam")
    }
}
