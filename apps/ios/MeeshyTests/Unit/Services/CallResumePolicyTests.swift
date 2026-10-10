import XCTest
import MeeshySDK
@testable import Meeshy

/// #9111 — un appel décroché qu'on perd n'est jamais terminé POUR TOUS par
/// cet appareil : la passerelle tient la place du partant pendant la grâce de
/// reprise, et l'appel reprend s'il revient.
@MainActor
final class CallResumePolicyTests: XCTestCase {

    // MARK: - Ce que la passerelle apprend

    func test_teardownSignal_neverAnswered_endsTheRingForEveryone() {
        for cause in [CallTeardownCause.failure, .resumeFailure, .systemReset, .reconnectCeiling] {
            XCTAssertEqual(CallResumePolicy.teardownSignal(for: cause, wasAnswered: false, isGroup: false), .end)
        }
    }

    func test_teardownSignal_answeredCallFailingLocally_leavesWithoutEndingForOthers() {
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .failure, wasAnswered: true, isGroup: false), .leave)
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .failure, wasAnswered: true, isGroup: true), .leave)
    }

    func test_teardownSignal_failedResume_staysSilentSoTheServerGraceDecides() {
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .resumeFailure, wasAnswered: true, isGroup: false), .none)
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .systemReset, wasAnswered: true, isGroup: true), .none)
    }

    func test_teardownSignal_groupReconnectCeiling_leavesInsteadOfEndingTheGroup() {
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .reconnectCeiling, wasAnswered: true, isGroup: true), .leave)
        XCTAssertEqual(CallResumePolicy.teardownSignal(for: .reconnectCeiling, wasAnswered: true, isGroup: false), .none)
    }

    func test_teardownSignal_answered_isNeverEnd() {
        for cause in [CallTeardownCause.failure, .resumeFailure, .systemReset, .reconnectCeiling] {
            for isGroup in [true, false] {
                XCTAssertNotEqual(CallResumePolicy.teardownSignal(for: cause, wasAnswered: true, isGroup: isGroup), .end)
            }
        }
    }

    // MARK: - Les erreurs qui ne condamnent pas une reprise

    func test_isTransientDuringResume_notAParticipantOrConflict_whileResuming_isNotFatal() {
        XCTAssertTrue(CallResumePolicy.isTransientDuringResume(code: "NOT_A_PARTICIPANT", isResuming: true))
        XCTAssertTrue(CallResumePolicy.isTransientDuringResume(code: "CALL_STATE_CONFLICT", isResuming: true))
    }

    func test_isTransientDuringResume_callEndedOrOutsideResume_staysFatal() {
        XCTAssertFalse(CallResumePolicy.isTransientDuringResume(code: "CALL_ENDED", isResuming: true))
        XCTAssertFalse(CallResumePolicy.isTransientDuringResume(code: "NOT_A_PARTICIPANT", isResuming: false))
        XCTAssertFalse(CallResumePolicy.isTransientDuringResume(code: nil, isResuming: true))
    }

    // MARK: - Le budget local couvre la grâce du serveur

    func test_minimumReconnectWindow_coversServerGracePlusOneBeat() {
        XCTAssertEqual(CallResumePolicy.minimumReconnectWindow, CallRules.rejoinGrace + CallRules.heartbeatInterval)
    }

    func test_reconnectAttempts_spanAtLeastTheServerGrace_andEndBeforeHeartbeatTimeout() {
        let attempts = TimeInterval(QualityThresholds.maxReconnectAttempts) * QualityThresholds.reconnectAttemptBudgetSeconds
        let worstBackoff = (1...QualityThresholds.maxReconnectAttempts).reduce(0.0) { total, attempt in
            total + CallReliabilityPolicy.reconnectBackoffSeconds(attempt: attempt, unitRandom: 1.0)
        }
        XCTAssertGreaterThanOrEqual(attempts, CallResumePolicy.minimumReconnectWindow)
        XCTAssertLessThanOrEqual(attempts + worstBackoff, CallRules.heartbeatTimeout)
    }

    // MARK: - Rejoindre plutôt que recommencer

    private func session(conversationId: String = "conv-1", rows: [(String, Bool)]) -> ActiveCallSession {
        ActiveCallSession(
            id: "call-1", conversationId: conversationId, mode: "p2p", status: "active",
            participants: rows.map { ActiveCallParticipant(userId: $0.0, leftAt: $0.1 ? "2026-10-02T10:00:00.000Z" : nil) }
        )
    }

    func test_shouldJoin_callWithSomeoneElseStillIn_isJoined() {
        XCTAssertTrue(CallResumePolicy.shouldJoin(session(rows: [("me", true), ("bob", false)]), conversationId: "conv-1", currentUserId: "me"))
    }

    func test_shouldJoin_nobodyElseLeft_orOtherConversation_startsANewCall() {
        XCTAssertFalse(CallResumePolicy.shouldJoin(session(rows: [("me", false), ("bob", true)]), conversationId: "conv-1", currentUserId: "me"))
        XCTAssertFalse(CallResumePolicy.shouldJoin(session(conversationId: "conv-2", rows: [("bob", false)]), conversationId: "conv-1", currentUserId: "me"))
        XCTAssertFalse(CallResumePolicy.shouldJoin(nil, conversationId: "conv-1", currentUserId: "me"))
    }

    func test_shouldResumeOnLaunch_myLineStillHeld_andSomeoneWaiting_resumes() {
        XCTAssertTrue(CallResumePolicy.shouldResumeOnLaunch(session(rows: [("me", false), ("bob", false)]), currentUserId: "me"))
    }

    func test_shouldResumeOnLaunch_myLineLeft_orAlone_doesNothing() {
        XCTAssertFalse(CallResumePolicy.shouldResumeOnLaunch(session(rows: [("me", true), ("bob", false)]), currentUserId: "me"))
        XCTAssertFalse(CallResumePolicy.shouldResumeOnLaunch(session(rows: [("me", false), ("bob", true)]), currentUserId: "me"))
        XCTAssertFalse(CallResumePolicy.shouldResumeOnLaunch(nil, currentUserId: "me"))
    }

    // MARK: - L'en-tête relit l'appel en cours quand l'appel local change

    func test_headerReconcileKey_changesWhenTheLocalCallStartsOrStops() {
        let during = HeaderCallReconcileKey(conversationId: "conv-1", isLocalCallActive: true)
        let after = HeaderCallReconcileKey(conversationId: "conv-1", isLocalCallActive: false)
        XCTAssertNotEqual(during, after)
        XCTAssertEqual(after, HeaderCallReconcileKey(conversationId: "conv-1", isLocalCallActive: false))
    }

    // MARK: - Les compteurs de négociation convergent quand un pair revient

    func test_isStaleNegotiation_freshLinkOffer_convergesInsteadOfBeingDropped() {
        XCTAssertFalse(CallManager.isStaleNegotiation(incoming: 1, highWaterMark: 5, isOffer: true))
        XCTAssertTrue(CallManager.isFreshLinkOffer(incoming: 1, highWaterMark: 5, isOffer: true))
    }

    func test_isStaleNegotiation_oldRenegotiationOrLateAnswer_staysStale() {
        XCTAssertTrue(CallManager.isStaleNegotiation(incoming: 3, highWaterMark: 5, isOffer: true))
        XCTAssertTrue(CallManager.isStaleNegotiation(incoming: 1, highWaterMark: 5, isOffer: false))
        XCTAssertFalse(CallManager.isFreshLinkOffer(incoming: 1, highWaterMark: 1, isOffer: true))
    }

    // MARK: - Le pair d'un duo revient pendant la reprise

    func test_shouldReofferToReturningPeer_duoReconnecting_peerBack_reoffers() {
        XCTAssertTrue(CallResumePolicy.shouldReofferToReturningPeer(
            eventCallId: "call-1", eventUserId: "bob", currentCallId: "call-1", primaryUserId: "bob", isGroupMesh: false, isReconnecting: true
        ))
    }

    func test_shouldReofferToReturningPeer_healthyLink_group_orOtherCall_doesNothing() {
        XCTAssertFalse(CallResumePolicy.shouldReofferToReturningPeer(
            eventCallId: "call-1", eventUserId: "bob", currentCallId: "call-1", primaryUserId: "bob", isGroupMesh: false, isReconnecting: false
        ))
        XCTAssertFalse(CallResumePolicy.shouldReofferToReturningPeer(
            eventCallId: "call-1", eventUserId: "bob", currentCallId: "call-1", primaryUserId: "bob", isGroupMesh: true, isReconnecting: true
        ))
        XCTAssertFalse(CallResumePolicy.shouldReofferToReturningPeer(
            eventCallId: "call-2", eventUserId: "bob", currentCallId: "call-1", primaryUserId: "bob", isGroupMesh: false, isReconnecting: true
        ))
    }
}
