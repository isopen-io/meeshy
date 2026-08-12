import XCTest
@testable import Meeshy

/// P1 — regression coverage for three dead `catch let error as APIError`
/// sites in `SecurityView.swift`. `APIClient` only ever throws `MeeshyError`
/// (never the legacy `APIError`), so all three silently fell through to the
/// generic `catch` and lost the server's message — including the dedicated
/// "code incorrect" (400) branch in the phone-verification flow, which never
/// fired at all.
///
/// `SecurityView`'s action functions are private, inline `Task { do/catch }`
/// closures on a SwiftUI View with no injectable seam (same constraint as
/// `MeeshyAppLogoutTests`) — pinned via source inspection.
final class SecurityViewErrorMappingTests: XCTestCase {

    private func securityViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // SecurityViewErrorMappingTests.swift -> Services
            .deletingLastPathComponent() // Services -> Unit
            .deletingLastPathComponent() // Unit -> MeeshyTests
            .deletingLastPathComponent() // MeeshyTests -> apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/SecurityView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_noSiteCatchesTheDeadLegacyAPIErrorType() throws {
        let source = try securityViewSource()
        XCTAssertFalse(
            source.contains("catch let error as APIError"),
            "APIClient only ever throws MeeshyError — catching the legacy APIError type is dead code " +
            "that silently discards the server's message."
        )
    }

    func test_allThreeSitesCatchMeeshyErrorInstead() throws {
        let source = try securityViewSource()
        let occurrences = source.components(separatedBy: "catch let error as MeeshyError").count - 1
        XCTAssertEqual(occurrences, 3,
            "Expected all 3 former APIError sites (email change, phone change, phone code verify) " +
            "to now catch MeeshyError.")
    }

    func test_phoneCodeVerification_matchesRealMeeshyErrorServerCase_for400() throws {
        let source = try securityViewSource()
        XCTAssertTrue(
            source.contains("case .server(400, _):"),
            "The phone-code-invalid branch must switch on MeeshyError's real .server(statusCode:message:) " +
            "case, not the dead APIError.serverError shape, or the dedicated 'code incorrect' message never fires."
        )
        XCTAssertFalse(
            source.contains("case .serverError(400, _):"),
            "Must not still reference the old APIError.serverError case shape."
        )
    }
}
