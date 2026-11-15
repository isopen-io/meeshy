import XCTest
import CallKit
@testable import Meeshy

/// What CallKit shows for an incoming call, built once for the VoIP push and
/// the socket notification (#11522).
@MainActor
final class IncomingCallUpdateTests: XCTestCase {

    func test_incoming_usesTheCallerUserIdAsTheStableHandle() {
        let update = CXCallUpdate.incoming(callerUserId: "u1", callerName: "Ada", isVideo: true)
        XCTAssertEqual(update.remoteHandle?.value, "u1")
        XCTAssertEqual(update.remoteHandle?.type, .generic)
        XCTAssertEqual(update.localizedCallerName, "Ada")
        XCTAssertTrue(update.hasVideo)
        XCTAssertFalse(update.supportsGrouping)
        XCTAssertFalse(update.supportsHolding)
    }

    func test_incoming_withoutACallerUserId_fallsBackToTheName() {
        let update = CXCallUpdate.incoming(callerUserId: "", callerName: "Ada", isVideo: false)
        XCTAssertEqual(update.remoteHandle?.value, "Ada")
        XCTAssertFalse(update.hasVideo)
    }
}
