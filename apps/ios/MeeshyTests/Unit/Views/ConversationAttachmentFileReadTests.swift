import XCTest
@testable import Meeshy

/// `ConversationView.readAttachmentFileBytes` hops a synchronous
/// `Data(contentsOf:)` disk read off the MainActor (2026-07-21) — sending a
/// multi-attachment batch (e.g. a few dozen-MB videos) previously read every
/// file's bytes inline on the MainActor inside the send `Task`, freezing the
/// UI proportional to file size. Behavior contract: same bytes back for a
/// real file, `nil` (never a thrown error) for a missing one.
final class ConversationAttachmentFileReadTests: XCTestCase {

    func test_readAttachmentFileBytes_existingFile_returnsExactBytes() async {
        let payload = Data("meeshy-attachment-payload".utf8)
        let url = makeTempFile(contents: payload)
        defer { try? FileManager.default.removeItem(at: url) }

        let result = await ConversationView.readAttachmentFileBytes(url)

        XCTAssertEqual(result, payload)
    }

    func test_readAttachmentFileBytes_missingFile_returnsNil() async {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("does-not-exist-\(UUID().uuidString)")

        let result = await ConversationView.readAttachmentFileBytes(url)

        XCTAssertNil(result)
    }

    // MARK: - Factory Helpers

    private func makeTempFile(contents: Data) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("attachment-read-test-\(UUID().uuidString)")
        try? contents.write(to: url)
        return url
    }
}
