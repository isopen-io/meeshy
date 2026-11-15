import Foundation
import MeeshyE2EE
import MeeshySDK
import XCTest
@testable import Meeshy

/// Les gestes d'une conversation chiffrée partent en signaux chiffrés (#13142),
/// jamais par une route en clair ; une suppression pour tous ne vide le coffre
/// de cet appareil qu'une fois le signal accepté (#13060).
@MainActor
final class EndToEndSignalCommandsTests: XCTestCase {
    nonisolated final class SignalingSpy: EndToEndSignalingProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var sentSignals: [(E2EESignal, Bool)] = []
        var failure: (any Error)?

        func send(_ signal: E2EESignal, from userId: String, to peerUserId: String, wake: Bool) async throws -> E2EESignalReceipt {
            let failure = lock.withLock { () -> (any Error)? in
                sentSignals.append((signal, wake))
                return self.failure
            }
            if let failure { throw failure }
            return E2EESignalReceipt(signalId: "sig", envelopes: 2)
        }

        func pendingSignals(as account: String) async -> [E2EEReceivedSignal] { [] }
        func settleSignals(_ signalIds: [String], as account: String) async {}

        var actions: [E2EESignalAction] { lock.withLock { sentSignals.map(\.0.action) } }
        var wakes: [Bool] { lock.withLock { sentSignals.map(\.1) } }
    }

    private func commands(
        _ signaling: SignalingSpy, persistence: MockConversationCommandPersistence, online: Bool = true
    ) -> EndToEndSignalCommands {
        EndToEndSignalCommands(
            conversationId: "c1", peerUserId: "u-peer", senderUserId: "u-me",
            signaling: signaling, persistence: persistence, isOnline: { online }
        )
    }

    func test_deleteForEveryone_leavesAsASignedSignal_thenConfirmsTheErasure() async {
        let signaling = SignalingSpy()
        let persistence = MockConversationCommandPersistence()

        let failure = await commands(signaling, persistence: persistence).deleteForEveryone(messageId: "cid_1", serverId: "srv_1")

        XCTAssertNil(failure)
        XCTAssertEqual(signaling.actions, [.deleteForEveryone(target: "srv_1")])
        XCTAssertEqual(signaling.wakes, [true])
        let awaiting = await persistence.awaitingConfirmation
        let confirmed = await persistence.confirmedDeletions
        XCTAssertEqual(awaiting, ["cid_1"])
        XCTAssertEqual(confirmed, ["cid_1"])
    }

    func test_aRefusedDeletion_restoresTheMessage_andKeepsItsPlaintext() async {
        let signaling = SignalingSpy()
        signaling.failure = URLError(.notConnectedToInternet)
        let persistence = MockConversationCommandPersistence()

        let failure = await commands(signaling, persistence: persistence).deleteForEveryone(messageId: "cid_1", serverId: "srv_1")

        XCTAssertNotNil(failure)
        let calls = await persistence.calls
        let confirmed = await persistence.confirmedDeletions
        XCTAssertEqual(calls, [.markDeleted(localId: "cid_1"), .markUndeleted(localId: "cid_1")])
        XCTAssertEqual(confirmed, [], "refusée, la suppression ne vide pas le coffre")
    }

    func test_offline_nothingLeavesNorWaits() async {
        let signaling = SignalingSpy()
        let persistence = MockConversationCommandPersistence()

        let failure = await commands(signaling, persistence: persistence, online: false).deleteForEveryone(messageId: "cid_1", serverId: "srv_1")

        XCTAssertEqual(failure, EndToEndSignalCommands.offlineRefusal)
        XCTAssertEqual(signaling.actions, [])
        let calls = await persistence.calls
        XCTAssertEqual(calls, [])
    }

    func test_aRefusedReaction_isTakenBack() async {
        let signaling = SignalingSpy()
        signaling.failure = URLError(.timedOut)
        let persistence = MockConversationCommandPersistence()

        await commands(signaling, persistence: persistence).react(localId: "m1", serverId: "srv_1", participantId: "u-me", emoji: "👍", removed: false)

        XCTAssertEqual(signaling.actions, [.reaction(target: "srv_1", emoji: "👍", removed: false)])
        XCTAssertEqual(signaling.wakes, [true], "un geste réveille, quel qu'il soit : le réveil ne dit pas lequel")
        let calls = await persistence.calls
        XCTAssertEqual(calls, [.removeReaction(localId: "m1", emoji: "👍", participantId: "u-me")])
    }

    func test_viewOnceAndPinAndTyping_leaveAsSignals() async {
        let signaling = SignalingSpy()
        let persistence = MockConversationCommandPersistence()
        let sut = commands(signaling, persistence: persistence)

        _ = await sut.viewOnceOpened(serverId: "srv_1")
        _ = await sut.togglePin(messageId: "m2", serverId: "srv_2", previous: MessagePinState(pinnedAt: nil, pinnedBy: nil))
        await sut.typing(active: true)

        XCTAssertEqual(signaling.actions, [.viewOnceOpened(target: "srv_1"), .pin(target: "srv_2", pinned: true), .typing(active: true)])
        XCTAssertEqual(signaling.wakes, [true, true, false], "seule la frappe, éphémère, ne réveille pas")
    }

    func test_erasureFollowsTheMessageLine_likeTheGateway() {
        let clear = MeeshyMessage(id: "m-old", conversationId: "c1", content: "d'avant")
        let sealed = MeeshyMessage(id: "m-sealed", conversationId: "c1", content: "", isEncrypted: true, encryptionMode: "e2ee")
        let encryptedWithoutMode = MeeshyMessage(id: "m-unknown", conversationId: "c1", content: "", isEncrypted: true)
        let hybrid = MeeshyMessage(id: "m-hybrid", conversationId: "c1", content: "lu", isEncrypted: true, encryptionMode: "hybrid")

        XCTAssertFalse(EndToEndSignalCommands.erasureTravelsAsSignal(clear), "le serveur lit déjà ce message : sa route en clair le supprime")
        XCTAssertFalse(EndToEndSignalCommands.erasureTravelsAsSignal(hybrid))
        XCTAssertTrue(EndToEndSignalCommands.erasureTravelsAsSignal(sealed))
        XCTAssertTrue(EndToEndSignalCommands.erasureTravelsAsSignal(encryptedWithoutMode), "chiffré sans mode : fail-closed, comme la passerelle")
        XCTAssertTrue(EndToEndSignalCommands.erasureTravelsAsSignal(nil), "introuvable : fail-closed")
    }
}
