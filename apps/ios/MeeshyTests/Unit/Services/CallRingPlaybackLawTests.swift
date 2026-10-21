import XCTest
@testable import Meeshy

/// #11063, décision porteur h (2026-10-20) — un appel Meeshy entrant baisse
/// le son Meeshy pendant qu'il sonne ; décroché, il arrête la lecture (qui
/// reprendra au raccrochage) ; refusé, manqué ou annulé, il rend le volume.
final class CallRingPlaybackLawTests: XCTestCase {

    private typealias Law = CallRingPlaybackLaw

    func test_anIncomingCallThatRings_ducksMeeshy() {
        XCTAssertEqual(Law.effect(from: .idle, to: .ringing(isOutgoing: false)), .duck)
        XCTAssertEqual(Law.effect(from: .ended(reason: .remote), to: .ringing(isOutgoing: false)), .duck)
    }

    func test_answering_stopsThePlayback_andGivesTheVolumeBack() {
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .connecting), .interruptAndRestore)
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .connected), .interruptAndRestore)
    }

    func test_refusingMissingOrCancelling_givesTheVolumeBack() {
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .ended(reason: .rejected)), .restore)
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .ended(reason: .missed)), .restore)
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .idle), .restore)
    }

    func test_anOutgoingCall_stopsThePlaybackAtOnce() {
        XCTAssertEqual(Law.effect(from: .idle, to: .ringing(isOutgoing: true)), .interrupt)
        XCTAssertEqual(Law.effect(from: .idle, to: .offering), .interrupt)
    }

    func test_aCallAlreadyUnderway_changesNothing() {
        XCTAssertEqual(Law.effect(from: .ringing(isOutgoing: false), to: .ringing(isOutgoing: false)), .none)
        XCTAssertEqual(Law.effect(from: .connecting, to: .connected), .none)
        XCTAssertEqual(Law.effect(from: .connected, to: .reconnecting(attempt: 1)), .none)
        XCTAssertEqual(Law.effect(from: .connected, to: .ended(reason: .remote)), .none)
        XCTAssertEqual(Law.effect(from: .idle, to: .idle), .none)
    }

    /// La loi est BRANCHÉE sur la transition d'état de l'appel, et un appel
    /// qui commence ne détruit plus les lecteurs (`stopAll`) : il les
    /// interrompt, pour qu'ils reprennent au raccrochage.
    func test_theCallStateDrivesTheLaw() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")
        let start = try XCTUnwrap(source.range(of: "@Published var callState: CallState = .idle {"))
        let didSet = String(source[start.upperBound...].prefix(2_500))
        XCTAssertTrue(didSet.contains("CallRingPlayback.apply(CallRingPlaybackLaw.effect(from: oldValue, to: callState))"))
        XCTAssertFalse(didSet.contains("PlaybackCoordinator.shared.stopAll()"))
    }
}
