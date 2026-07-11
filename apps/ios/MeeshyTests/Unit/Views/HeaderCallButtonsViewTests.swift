import XCTest
@testable import Meeshy

/// Source-level guards for `HeaderCallButtonsView`'s server-reconciled
/// "rejoin call" indicator — user-requested 2026-07-11: when this device's
/// own `CallManager` session was lost (app relaunch, crash) while the server
/// still considers the call active, the header must offer a way to rejoin
/// instead of silently falling back to the normal "start a new call" button.
@MainActor
final class HeaderCallButtonsViewTests: XCTestCase {

    private func headerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+Header.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_body_showsRejoinIndicator_whenReconciledActiveCallIsSet() throws {
        let source = try headerSource()
        guard let range = source.range(of: "var body: some View {") else {
            XCTFail("HeaderCallButtonsView must define body"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("reconciledActiveCall"),
            "body must branch on reconciledActiveCall to show the rejoin indicator " +
            "when the server reports an active call this device's CallManager doesn't know about."
        )
        XCTAssertTrue(
            body.contains("rejoinCallIndicator(activeCall)"),
            "body must render rejoinCallIndicator when reconciledActiveCall is set."
        )
    }

    func test_rejoinIndicator_clearsWhenCallEndedArrivesForThatCall() throws {
        // Le gateway fanout `call:ended` jusqu'aux user-rooms de TOUS les
        // membres de la conversation (resolveCallEndedRooms) — un viewer
        // non-participant le reçoit donc aussi. Sans invalidation temps réel,
        // la pill « Rejoindre » resterait affichée après la fin de l'appel
        // (reconciledActiveCall n'est posé qu'au .task(id:)) et un tap
        // lancerait un rejoin vers un appel mort (« already ended »).
        let source = try headerSource()
        guard let range = source.range(of: ".onReceive(MessageSocketManager.shared.callEnded") else {
            XCTFail("HeaderCallButtonsView must subscribe to MessageSocketManager.callEnded to invalidate the rejoin pill"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains(".receive(on: DispatchQueue.main)"),
            "callEnded fires from the socket queue — the subscription must hop to the main " +
            "thread before touching @State (known SIGTRAP class on call surfaces)."
        )
        XCTAssertTrue(
            body.contains("reconciledActiveCall?.id == event.callId"),
            "The invalidation must match by callId — a call ending in ANOTHER conversation " +
            "must not clear this conversation's rejoin pill."
        )
        XCTAssertTrue(
            body.contains("reconciledActiveCall = nil"),
            "On a matching call:ended, the rejoin pill must be cleared (back to startCallButtons)."
        )
    }

    func test_reconcileActiveCall_skipsNetworkCall_whenCallManagerAlreadyActive() throws {
        let source = try headerSource()
        guard let range = source.range(of: "private func reconcileActiveCall() async {") else {
            XCTFail("reconcileActiveCall not found"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let opening = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            opening.contains("guard !callManager.callState.isActive else { return }"),
            "reconcileActiveCall must skip the network call when CallManager already knows " +
            "locally — no need to hit the server, and it avoids a race with local state."
        )
    }

    func test_reconcileActiveCall_usesActiveCallServiceSDK() throws {
        let source = try headerSource()
        guard let range = source.range(of: "private func reconcileActiveCall() async {") else {
            XCTFail("reconcileActiveCall not found"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("ActiveCallService.shared.activeCall(conversationId: conversationId)"),
            "reconcileActiveCall must delegate the REST fetch to the SDK's ActiveCallService " +
            "(SDK purity: the app only decides WHEN to call it)."
        )
    }

    func test_rejoinCallIndicator_callsCallManagerRejoinActiveCall() throws {
        let source = try headerSource()
        guard let range = source.range(of: "private func rejoinCallIndicator(") else {
            XCTFail("rejoinCallIndicator not found"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("callManager.rejoinActiveCall("),
            "Tapping the rejoin indicator must call CallManager.rejoinActiveCall — a bare " +
            "displayMode flip (like returnToCallIndicator) would do nothing since this device " +
            "was never actually in the call session to return to."
        )
    }

    func test_body_reconcilesOnConversationChange() throws {
        let source = try headerSource()
        guard let range = source.range(of: "var body: some View {") else {
            XCTFail("HeaderCallButtonsView must define body"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains(".task(id: conversationId)") && body.contains("await reconcileActiveCall()"),
            "body must reconcile on every conversation change (task id), not on every re-render."
        )
    }
}
