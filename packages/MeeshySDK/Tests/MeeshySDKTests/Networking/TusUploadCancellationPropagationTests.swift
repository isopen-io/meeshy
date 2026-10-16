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
}
