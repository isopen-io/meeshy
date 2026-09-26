import XCTest
@testable import MeeshySDK

/// #8074 — les règles d'appel du SDK confrontées à
/// `packages/shared/types/call-rules.ts`, le jeu unique que la passerelle lit.
///
/// Une sonnerie iOS plus courte que celle du serveur fait raccrocher
/// l'appelant pendant que l'appelé sonne encore ; un plafond plus haut laisse
/// iOS proposer un appel que la passerelle refusera.
final class CallRulesContractTests: XCTestCase {

    func test_ringTimeout_matchesSharedRule() throws {
        XCTAssertEqual(CallRules.ringTimeout, try SharedCallRules.seconds("CALL_RING_TIMEOUT_MS"))
    }

    func test_ringGarbageCollection_matchesSharedRule() throws {
        XCTAssertEqual(CallRules.ringGarbageCollection, try SharedCallRules.seconds("CALL_RING_GC_MS"))
    }

    func test_offerTimeout_matchesSharedRule() throws {
        XCTAssertEqual(CallRules.offerTimeout, try SharedCallRules.seconds("CALL_OFFER_TIMEOUT_MS"))
    }

    func test_connectingGrace_matchesSharedRule() throws {
        XCTAssertEqual(CallRules.connectingGrace, try SharedCallRules.seconds("CALL_CONNECTING_GRACE_MS"))
    }

    func test_heartbeats_matchSharedRules() throws {
        XCTAssertEqual(CallRules.heartbeatInterval, try SharedCallRules.seconds("CALL_HEARTBEAT_INTERVAL_MS"))
        XCTAssertEqual(CallRules.heartbeatTimeout, try SharedCallRules.seconds("CALL_HEARTBEAT_TIMEOUT_MS"))
        XCTAssertEqual(
            CallRules.backgroundHeartbeatTimeout,
            try SharedCallRules.seconds("CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS")
        )
    }

    func test_pushTimeToLive_matchesSharedRule() throws {
        XCTAssertEqual(CallRules.pushTimeToLive, try SharedCallRules.seconds("CALL_PUSH_TTL_MS"))
    }

    func test_maxParticipants_matchesSharedRule() throws {
        XCTAssertEqual(Double(CallRules.maxParticipants), try SharedCallRules.value("CALL_MAX_PARTICIPANTS"))
    }

    func test_pushNeverOutlivesTheRing() {
        XCTAssertLessThanOrEqual(CallRules.pushTimeToLive, CallRules.ringTimeout)
    }

    func test_cleanupRunsAfterTheRing() {
        XCTAssertGreaterThan(CallRules.ringGarbageCollection, CallRules.ringTimeout)
    }
}

private enum SharedCallRules {
    static func seconds(_ name: String) throws -> TimeInterval {
        try value(name) / 1000
    }

    static func value(_ name: String) throws -> Double {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let pattern = "export const \(name) = ([0-9_]+);"
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..., in: source)
        let match = try XCTUnwrap(regex.firstMatch(in: source, range: range), "\(name) introuvable")
        let literal = try XCTUnwrap(Range(match.range(at: 1), in: source).map { String(source[$0]) })
        return try XCTUnwrap(Double(literal.replacingOccurrences(of: "_", with: "")))
    }

    private static var sourceURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/types/call-rules.ts")
    }
}
