import XCTest
@testable import MeeshySDK

/// Annuler un téléversement en cours l'arrête vraiment : le travail détaché
/// sous la tâche d'arrière-plan reçoit l'annulation de son appelant.
final class TusUploadCancellationPropagationTests: XCTestCase {

    func test_cancellingTheCaller_cancelsTheDetachedUpload() async {
        let work = Task<Int, Error> {
            try await Task.sleep(nanoseconds: 30_000_000_000)
            return 1
        }
        let caller = Task { try await TusUploadManager.awaitPropagatingCancellation(work) }
        caller.cancel()
        let result = try? await caller.value
        XCTAssertNil(result)
        XCTAssertTrue(work.isCancelled, "le PATCH en vol tombe : plus d'octets envoyés pour rien")
    }

    func test_anUncancelledUpload_returnsItsResult() async throws {
        let work = Task<Int, Error> { 42 }
        let value = try await TusUploadManager.awaitPropagatingCancellation(work)
        XCTAssertEqual(value, 42)
    }

    /// La pré-montée du composer puis la publication montent le MÊME fichier :
    /// chaque envoi écrit sa progression sur SA ligne, jamais sur celle de
    /// l'autre (qui restait sinon « en file » à vie).
    func test_eachUpload_writesItsOwnProgressRow() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Networking/TusUploadManager.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("progressFileId: fileId"), "la file remet sa ligne à l'envoi")
        XCTAssertFalse(code.contains("markFileFailed(fileName:"), "l'échec vise la ligne de l'envoi, pas un homonyme")
    }
}
