import XCTest
@testable import Meeshy

@MainActor
final class WebRTCErrorTests: XCTestCase {

    func test_simulatorVideoUnsupported_mentionsSimulator() {
        let error: WebRTCError = .simulatorVideoUnsupported
        XCTAssertTrue(
            error.errorDescription?.lowercased().contains("simulator") ?? false,
            "Error description should mention simulator"
        )
    }

    func test_noPeerConnection_hasDescription() {
        XCTAssertNotNil(WebRTCError.noPeerConnection.errorDescription)
    }

    func test_failedToCreatePeerConnection_hasDescription() {
        XCTAssertNotNil(WebRTCError.failedToCreatePeerConnection.errorDescription)
    }

    func test_failedToCreateSDP_hasDescription() {
        XCTAssertNotNil(WebRTCError.failedToCreateSDP.errorDescription)
    }

    func test_noCameraAvailable_hasDescription() {
        XCTAssertNotNil(WebRTCError.noCameraAvailable.errorDescription)
    }

    func test_noCameraFormatAvailable_hasDescription() {
        XCTAssertNotNil(WebRTCError.noCameraFormatAvailable.errorDescription)
    }

    func test_notSupported_hasDescription() {
        XCTAssertNotNil(WebRTCError.notSupported.errorDescription)
    }

    func test_offerIgnored_mentionsPerfectNegotiation() {
        let error: WebRTCError = .offerIgnored
        let desc = error.errorDescription ?? ""
        XCTAssertFalse(desc.isEmpty)
        XCTAssertTrue(
            desc.lowercased().contains("glare") || desc.lowercased().contains("negotiation"),
            "offerIgnored description should reference perfect-negotiation / glare: '\(desc)'"
        )
    }

    func test_allCases_haveNonEmptyDescriptions() {
        let cases: [WebRTCError] = [
            .noPeerConnection,
            .failedToCreatePeerConnection,
            .failedToCreateSDP,
            .noCameraAvailable,
            .noCameraFormatAvailable,
            .notSupported,
            .simulatorVideoUnsupported,
            .offerIgnored
        ]
        for error in cases {
            XCTAssertFalse(
                error.errorDescription?.isEmpty ?? true,
                "\(error) has empty or nil errorDescription"
            )
        }
    }
}
