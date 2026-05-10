import XCTest
@testable import Meeshy

final class WebRTCErrorTests: XCTestCase {

    func test_simulatorVideoUnsupported_caseExists() {
        let error: WebRTCError = .simulatorVideoUnsupported
        XCTAssertNotNil(error.errorDescription)
        XCTAssertTrue(
            error.errorDescription?.lowercased().contains("simulator") ?? false,
            "Error description should mention simulator"
        )
    }
}
