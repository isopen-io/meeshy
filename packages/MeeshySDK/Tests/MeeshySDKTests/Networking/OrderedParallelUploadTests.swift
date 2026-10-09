import XCTest
@testable import MeeshySDK

/// #9776 — un envoi groupé part en parallèle, et les ids rejoignent la requête
/// de création dans l'ordre du composeur, quel que soit l'ordre de fin.
final class OrderedParallelUploadTests: XCTestCase {

    func test_run_uploadsFinishingInReverse_returnsInputOrder() async throws {
        let pieces = ["prisme", "bulle", "neon", "noir"]

        let ids = try await OrderedParallelUpload.run(pieces) { piece in
            let rank = pieces.firstIndex(of: piece) ?? 0
            try await Task.sleep(nanoseconds: UInt64(pieces.count - rank) * 20_000_000)
            return "id-\(piece)"
        }

        XCTAssertEqual(ids, ["id-prisme", "id-bulle", "id-neon", "id-noir"])
    }

    func test_run_firstFailure_throws() async {
        struct UploadFailed: Error {}

        do {
            _ = try await OrderedParallelUpload.run(["a", "b"]) { piece -> String in
                if piece == "b" { throw UploadFailed() }
                return piece
            }
            XCTFail("le lot devait échouer")
        } catch {
            XCTAssertTrue(error is UploadFailed)
        }
    }

    func test_run_emptyBatch_returnsEmpty() async throws {
        let ids = try await OrderedParallelUpload.run([String]()) { $0 }
        XCTAssertEqual(ids, [])
    }
}
