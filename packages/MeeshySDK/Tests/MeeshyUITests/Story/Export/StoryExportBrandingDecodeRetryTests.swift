import XCTest
import AVFoundation
@testable import MeeshyUI

/// Un décodeur qui lâche une fois ne fait plus partir la story nue (#14495).
///
/// `AVFoundationErrorDomain -11821` (« Cannot Decode ») vient du service de
/// décodage, pas de la composition : le même export, relancé avec une session
/// neuve, aboutit. Toute autre erreur reste déterministe et n'est pas rejouée.
@MainActor
final class StoryExportBrandingDecodeRetryTests: XCTestCase {

    private final class Attempts {
        var count = 0
    }

    private static let delivered = URL(fileURLWithPath: "/tmp/meeshy-story-delivered.mp4")

    private static func decodeFailure() -> Error {
        StoryExportBranding.BrandingError.encodingFailed(
            NSError(domain: AVFoundationErrorDomain, code: AVError.decodeFailed.rawValue))
    }

    private static func otherFailure() -> Error {
        StoryExportBranding.BrandingError.encodingFailed(
            NSError(domain: AVFoundationErrorDomain, code: AVError.diskFull.rawValue))
    }

    func test_exportRetryingDecodeFailure_decodeFailsOnce_deliversTheSecondExport() async throws {
        let attempts = Attempts()

        let url = try await StoryExportBranding.exportRetryingDecodeFailure {
            attempts.count += 1
            if attempts.count == 1 { throw Self.decodeFailure() }
            return Self.delivered
        }

        XCTAssertEqual(url, Self.delivered)
        XCTAssertEqual(attempts.count, 2)
    }

    func test_exportRetryingDecodeFailure_decodeFailsTwice_throwsAfterTwoAttempts() async {
        let attempts = Attempts()

        do {
            _ = try await StoryExportBranding.exportRetryingDecodeFailure {
                attempts.count += 1
                throw Self.decodeFailure()
            }
            XCTFail("un décodeur qui lâche deux fois fait échouer l'emballage")
        } catch {
            XCTAssertEqual(attempts.count, 2, "une seule reprise, jamais une boucle")
        }
    }

    func test_exportRetryingDecodeFailure_anotherFailure_isNotReplayed() async {
        let attempts = Attempts()

        do {
            _ = try await StoryExportBranding.exportRetryingDecodeFailure {
                attempts.count += 1
                throw Self.otherFailure()
            }
            XCTFail("l'erreur doit remonter")
        } catch {
            XCTAssertEqual(attempts.count, 1, "une erreur déterministe ne se rejoue pas")
        }
    }

    func test_exportRetryingDecodeFailure_success_exportsOnce() async throws {
        let attempts = Attempts()

        let url = try await StoryExportBranding.exportRetryingDecodeFailure {
            attempts.count += 1
            return Self.delivered
        }

        XCTAssertEqual(url, Self.delivered)
        XCTAssertEqual(attempts.count, 1)
    }
}
