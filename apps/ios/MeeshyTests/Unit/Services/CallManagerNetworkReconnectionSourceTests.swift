import XCTest
@testable import Meeshy

/// Calling-stack audit (2026-08-22) — network handoff during the negotiating
/// window silently dropped ICE restarts.
///
/// `startNetworkMonitoring()`'s `pathUpdateHandler` gated every reaction
/// (path lost, path recovered, interface handoff) behind a local
/// `isInActiveCall` flag that only recognized `.connected`/`.reconnecting`.
/// `.connecting` — answer received, ICE actively negotiating — was excluded,
/// even though `CallReliabilityPolicy.reconnectingAllowed(from:)` (the FSM's
/// own source of truth, consulted by `attemptReconnection` itself) has
/// whitelisted `.connecting` since the §3.2 redesign: an ICE restart is
/// perfectly legal once the answer/remote-description has landed.
///
/// Concretely: answering a call while walking out of WiFi range (or the
/// handoff a call itself provokes) changed the active interface mid-answer.
/// Nothing reacted for up to `connectingRestartSeconds` (12s) — the network
/// monitor's own reconnection trigger and its `analyticsNetworkTransitions`
/// counter were both skipped — because the local predicate disagreed with
/// the policy it is supposed to defer to.
final class CallManagerNetworkReconnectionSourceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `.connecting` is the answer-received/ICE-negotiating window — the FSM's
    /// own `CallReliabilityPolicy.reconnectingAllowed(from:)` already treats it
    /// as reconnect-eligible alongside `.connected`/`.reconnecting`. The network
    /// monitor's local `isInActiveCall` switch must agree, or a WiFi↔cellular
    /// handoff mid-answer goes unhandled for the full `connectingRestartSeconds`
    /// watchdog window instead of triggering an immediate reconnect attempt.
    func test_networkMonitor_isInActiveCall_includesConnectingState() throws {
        let source = try callManagerSource()
        guard let body = DeclarationBodyScanner.body(containing: "private func startNetworkMonitoring() {", in: source) else {
            XCTFail("startNetworkMonitoring not found"); return
        }

        XCTAssertTrue(
            body.contains("case .connected, .reconnecting, .connecting: isInActiveCall = true"),
            "startNetworkMonitoring's isInActiveCall switch must include .connecting — " +
            "matching CallReliabilityPolicy.reconnectingAllowed(from:), which already " +
            "whitelists it. Excluding it drops network-handoff reconnection during the " +
            "answer/ICE-negotiating window."
        )
    }
}
