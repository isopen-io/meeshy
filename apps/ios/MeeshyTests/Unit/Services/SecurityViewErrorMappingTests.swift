import XCTest
@testable import Meeshy

/// P1 — regression coverage for three dead `catch let error as APIError`
/// sites in `SecurityView.swift`. `APIClient` only ever throws `MeeshyError`
/// (never the legacy `APIError`), so all three silently fell through to the
/// generic `catch` and lost the server's message — including the dedicated
/// "code incorrect" (400) branch in the phone-verification flow, which never
/// fired at all.
///
/// The email-change site is a private, inline `Task { do/catch }` closure on a
/// SwiftUI View with no injectable seam (same constraint as
/// `MeeshyAppLogoutTests`) — pinned via source inspection. The two phone sites
/// moved to `PhoneChangeFlowModel` (#8843), shared with the phone prompt shown
/// before a contact search; its behaviour is covered by
/// `PhoneChangeFlowModelTests`, and the source pin follows the code there.
final class SecurityViewErrorMappingTests: XCTestCase {

    private static let files = [
        "Meeshy/Features/Main/Views/SecurityView.swift",
        "Meeshy/Features/Main/ViewModels/PhoneChangeFlowModel.swift",
    ]

    private func securityFlowSource() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // SecurityViewErrorMappingTests.swift -> Services
            .deletingLastPathComponent() // Services -> Unit
            .deletingLastPathComponent() // Unit -> MeeshyTests
            .deletingLastPathComponent() // MeeshyTests -> apps/ios
        return try Self.files
            .map { try String(contentsOf: root.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
    }

    func test_noSiteCatchesTheDeadLegacyAPIErrorType() throws {
        let source = try securityFlowSource()
        XCTAssertFalse(
            source.contains("as APIError"),
            "APIClient only ever throws MeeshyError — catching the legacy APIError type is dead code " +
            "that silently discards the server's message."
        )
    }

    func test_allThreeSitesCatchMeeshyErrorInstead() throws {
        let source = try securityFlowSource()
        let occurrences = source.components(separatedBy: " as MeeshyError {").count - 1
        XCTAssertEqual(occurrences, 3,
            "Expected all 3 former APIError sites (email change, phone change, phone code verify) " +
            "to now catch MeeshyError.")
    }

    func test_phoneCodeVerification_matchesRealMeeshyErrorServerCase_for400() throws {
        let source = try securityFlowSource()
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
