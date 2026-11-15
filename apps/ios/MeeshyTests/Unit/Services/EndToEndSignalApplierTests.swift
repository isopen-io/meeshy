import Foundation
import MeeshyE2EE
import MeeshySDK
import XCTest
@testable import Meeshy

/// **Un signal chiffré reçu ne s'applique que s'il est autorisé** (#13142, #13060) :
/// la suppression pour tous d'un message n'efface son clair que si elle vient
/// de son AUTEUR authentifié, la vue unique ne se consomme que depuis MES
/// appareils, et un signal qui devance son message attend.
final class EndToEndSignalApplierTests: XCTestCase {
    private let me = "u-me"
    private let peer = "u-peer"
    private let conversation = "c1"

    nonisolated final class SignalingStub: EndToEndSignalingProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var pending: [E2EEReceivedSignal]
        private(set) var settled: [String] = []

        init(_ pending: [E2EEReceivedSignal]) { self.pending = pending }

        func send(_ signal: E2EESignal, from userId: String, to peerUserId: String, wake: Bool) async throws -> E2EESignalReceipt {
            E2EESignalReceipt(signalId: "s", envelopes: 1)
        }

        func pendingSignals(as account: String) async -> [E2EEReceivedSignal] { lock.withLock { pending } }

        func settleSignals(_ signalIds: [String], as account: String) async {
            lock.withLock {
                settled += signalIds
                pending.removeAll { signalIds.contains($0.signalId) }
            }
        }

        var settledIds: [String] { lock.withLock { settled } }
    }

    actor PersistenceSpy: EndToEndSignalPersisting {
        private(set) var calls: [String] = []
        var refuse = false

        func setRefuse(_ value: Bool) { refuse = value }

        private func record(_ call: String) throws {
            if refuse { throw CocoaError(.fileWriteUnknown) }
            calls.append(call)
        }

        func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool, expired: Bool, origin: PlaintextErasureOrigin) async throws {
            try record("deleted:\(localId):\(origin == .authenticated ? "auth" : "announced")")
        }

        func markViewOnceOpened(localId: String, at date: Date, origin: PlaintextErasureOrigin) async throws {
            try record("viewOnce:\(localId):\(origin == .authenticated ? "auth" : "announced")")
        }

        func appendReaction(
            localId: String, reactionId: String, messageId: String, participantId: String?,
            emoji: String, maxCount: Int?, ownerUserId: String?
        ) async throws {
            try record("react:\(localId):\(emoji):\(ownerUserId ?? "-")")
        }

        func removeReaction(
            localId: String, emoji: String, participantId: String?, ownerUserId: String?,
            aggregateCount: Int?, aggregateParticipantIds: [String]?
        ) async throws {
            try record("unreact:\(localId):\(emoji):\(ownerUserId ?? "-")")
        }

        func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) async throws {
            try record("pin:\(localId):\(pinnedAt == nil ? "off" : "on")")
        }

        /// Toutes les lignes `m…` sont dans `c1`, les lignes `x…` dans `c2`.
        func conversationIds(of messageIds: [String]) async throws -> [String: String] {
            messageIds.reduce(into: [:]) { rows, id in
                if id.hasPrefix("m") { rows[id] = "c1" } else if id.hasPrefix("x") { rows[id] = "c2" }
            }
        }
    }

    private func received(_ action: E2EESignalAction, from sender: String, id: String = "s1", sentAt: Date = Date()) -> E2EEReceivedSignal {
        E2EEReceivedSignal(
            signalId: id, conversationId: conversation, senderUserId: sender, senderDeviceId: 1,
            signal: E2EESignal(conversationId: conversation, sentAt: sentAt, action: action).authored(by: sender, deviceId: 1)
        )
    }

    private func message(by author: String) -> E2EEPlaintextEntry {
        .readable(E2EEContent(text: "bonjour", language: nil, replyTo: nil, conversationId: conversation, clientMessageId: nil, sentAt: Date()), senderUserId: author)
    }

    private func applier(
        _ signals: SignalingStub, vault: [String: E2EEPlaintextEntry], persistence: PersistenceSpy,
        typing: @escaping @MainActor @Sendable (EndToEndTypingSignal) -> Void = { _ in }
    ) -> EndToEndSignalApplier {
        let plaintexts = MockEndToEndMessaging()
        vault.forEach { plaintexts.store($0.value, for: $0.key) }
        return EndToEndSignalApplier(signaling: signals, plaintexts: plaintexts, persistence: { persistence }, typing: typing)
    }

    func test_theAuthorsDeletion_erasesTheMessage_authenticated() async {
        let signals = SignalingStub([received(.deleteForEveryone(target: "m1"), from: peer)])
        let spy = PersistenceSpy()

        await applier(signals, vault: ["m1": message(by: peer)], persistence: spy).drain(as: me)

        let calls = await spy.calls
        XCTAssertEqual(calls, ["deleted:m1:auth"])
        XCTAssertEqual(signals.settledIds, ["s1"])
    }

    func test_aDeletionSignedBySomeoneElse_touchesNothing_andIsSettled() async {
        let signals = SignalingStub([received(.deleteForEveryone(target: "m1"), from: peer)])
        let spy = PersistenceSpy()

        await applier(signals, vault: ["m1": message(by: me)], persistence: spy).drain(as: me)

        let calls = await spy.calls
        XCTAssertEqual(calls, [], "un pair ne supprime pas MON message")
        XCTAssertEqual(signals.settledIds, ["s1"])
    }

    func test_aViewOnceOpenedOnMyOtherDevice_isConsumedHere_butAPeerCannotConsumeIt() async {
        let signals = SignalingStub([
            received(.viewOnceOpened(target: "m1"), from: me, id: "s1"),
            received(.viewOnceOpened(target: "m2"), from: peer, id: "s2"),
        ])
        let spy = PersistenceSpy()

        await applier(signals, vault: ["m1": message(by: peer), "m2": message(by: peer)], persistence: spy).drain(as: me)

        let calls = await spy.calls
        XCTAssertEqual(calls, ["viewOnce:m1:auth"])
        XCTAssertEqual(signals.settledIds, ["s1", "s2"])
    }

    func test_aSignalAheadOfItsMessage_waits_andIsDroppedAfterTheRetention() async {
        let fresh = SignalingStub([received(.deleteForEveryone(target: "m9"), from: peer)])
        let stale = SignalingStub([received(.deleteForEveryone(target: "m9"), from: peer, sentAt: Date(timeIntervalSinceNow: -EndToEndSignalApplier.awaitLimit - 60))])
        let spy = PersistenceSpy()

        await applier(fresh, vault: [:], persistence: spy).drain(as: me)
        await applier(stale, vault: [:], persistence: spy).drain(as: me)

        XCTAssertEqual(fresh.settledIds, [], "il attend son message")
        XCTAssertEqual(stale.settledIds, ["s1"])
        let calls = await spy.calls
        XCTAssertEqual(calls, [])
    }

    func test_reactionsAndPins_applyUnderTheirAuthenticatedSender() async {
        let signals = SignalingStub([
            received(.reaction(target: "m1", emoji: "👍", removed: false), from: peer, id: "s1"),
            received(.reaction(target: "m1", emoji: "👍", removed: true), from: peer, id: "s2"),
            received(.pin(target: "m1", pinned: true), from: peer, id: "s3"),
        ])
        let spy = PersistenceSpy()

        await applier(signals, vault: ["m1": message(by: me)], persistence: spy).drain(as: me)

        let calls = await spy.calls
        XCTAssertEqual(calls, ["react:m1:👍:u-peer", "unreact:m1:👍:u-peer", "pin:m1:on"])
    }

    @MainActor
    func test_aPeersFreshTyping_isShown_aStaleOneIsNot() async {
        let shown = TypingBox()
        let signals = SignalingStub([
            received(.typing(active: true), from: peer, id: "s1"),
            received(.typing(active: true), from: peer, id: "s2", sentAt: Date(timeIntervalSinceNow: -120)),
        ])

        await applier(signals, vault: [:], persistence: PersistenceSpy(), typing: { shown.signals.append($0) }).drain(as: me)

        XCTAssertEqual(shown.signals, [EndToEndTypingSignal(conversationId: conversation, userId: peer, active: true)])
        XCTAssertEqual(signals.settledIds, ["s1", "s2"])
    }

    func test_aReactionOnAnUndecryptableMessageOfAnotherConversation_isRefused() async {
        let signals = SignalingStub([
            received(.reaction(target: "x1", emoji: "👍", removed: false), from: peer, id: "s1"),
            received(.reaction(target: "m1", emoji: "👍", removed: false), from: peer, id: "s2"),
        ])
        let spy = PersistenceSpy()

        await applier(signals, vault: ["x1": .undecryptable, "m1": .undecryptable], persistence: spy).drain(as: me)

        let calls = await spy.calls
        XCTAssertEqual(calls, ["react:m1:👍:u-peer"], "un serveur ne range pas un signal sur un message d'une autre conversation")
        XCTAssertEqual(signals.settledIds, ["s1", "s2"])
    }

    func test_aStorageRefusal_keepsTheSignalPending() async {
        let signals = SignalingStub([received(.deleteForEveryone(target: "m1"), from: peer)])
        let spy = PersistenceSpy()
        await spy.setRefuse(true)

        await applier(signals, vault: ["m1": message(by: peer)], persistence: spy).drain(as: me)

        XCTAssertEqual(signals.settledIds, [], "la base a refusé « pas maintenant » : il se rejouera")
    }
}

@MainActor
private final class TypingBox {
    var signals: [EndToEndTypingSignal] = []
}
