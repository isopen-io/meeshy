import XCTest
import CryptoKit
@testable import MeeshySDK

/// Tests for `TusUploadManager.sha256Hex(of:)` — the streaming file-hash
/// helper that backs the bytewise-stable checkpoint key.
///
/// The previous implementation loaded the entire file into memory via
/// `Data(contentsOf:options: .mappedIfSafe)` + `SHA256.hash(data:)`, which
/// reliably OOM-killed background uploads of 200-500 MB videos on iOS.
/// The fix streams the file in 64 KiB chunks through a running `SHA256`
/// hasher wrapped in `autoreleasepool`. These tests pin the new behavior:
///   1. byte-equivalence with the direct one-shot hash (correctness),
///   2. survival on a 200 MB file without crashing or unbounded RSS growth,
///   3. correct digest for an empty file,
///   4. correct digest for a file smaller than the streaming buffer.
final class TusUploadManager_StreamingHashTests: XCTestCase {

    // MARK: - Fixtures

    /// Builds a deterministic pseudo-random byte buffer of the requested
    /// size by repeating a SHA-256-stretched seed. Avoids `/dev/urandom`
    /// and `arc4random_uniform` so the assertions can compare against a
    /// known one-shot hash in `test_sha256_matches_directHash`.
    private func makeDeterministicBytes(count: Int, seed: String = "meeshy-tus-stream-hash") -> Data {
        var output = Data(capacity: count)
        var block = Data(SHA256.hash(data: Data(seed.utf8)))
        while output.count < count {
            let take = min(block.count, count - output.count)
            output.append(block.prefix(take))
            block = Data(SHA256.hash(data: block))
        }
        return output
    }

    /// Writes `data` to a temp file and returns its URL. The file is
    /// deleted in `tearDown` via the tracking array.
    private func writeTempFile(data: Data, suffix: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tus-hash-\(UUID().uuidString)-\(suffix)")
        try data.write(to: url)
        createdFiles.append(url)
        return url
    }

    private var createdFiles: [URL] = []

    override func tearDown() {
        for url in createdFiles {
            try? FileManager.default.removeItem(at: url)
        }
        createdFiles.removeAll()
        super.tearDown()
    }

    // MARK: - Correctness

    /// 10 MB of deterministic pseudo-random data: the streaming hash MUST
    /// match the one-shot `SHA256.hash(data:)` byte-for-byte. This is the
    /// most important assertion — the OOM fix is worthless if it changes
    /// the digest and invalidates every persisted checkpoint.
    func test_sha256_matches_directHash() throws {
        let bytes = makeDeterministicBytes(count: 10 * 1024 * 1024)
        let url = try writeTempFile(data: bytes, suffix: "10mb")

        let streamed = try TusUploadManager.sha256Hex(of: url)
        let oneShot = SHA256.hash(data: bytes)
            .map { String(format: "%02x", $0) }
            .joined()

        XCTAssertEqual(streamed, oneShot,
            "Streaming SHA-256 must equal one-shot SHA-256 byte-for-byte; " +
            "a mismatch invalidates every previously-persisted TUS checkpoint key.")
    }

    // MARK: - Large file (memory budget)

    /// Streams a 200 MB file through the hasher and asserts it completes
    /// without crashing. We can't reliably assert peak RSS from XCTest
    /// (the process is the test runner, and `task_info` is racy), but if
    /// the autoreleasepool seam regresses the test will OOM on the
    /// simulator's 1.5 GB budget for the test-runner process. The
    /// "doesn't crash and produces a non-empty digest" contract is a
    /// strong-enough smoke against the original `Data(contentsOf:)` bug.
    func test_sha256_largeFile_doesNotExceedMemoryBudget() throws {
        // 200 MB. Writing it as a single Data would itself defeat the
        // memory-budget test, so we stream the write in 4 MB chunks.
        let totalSize = 200 * 1024 * 1024
        let chunkSize = 4 * 1024 * 1024
        let chunk = makeDeterministicBytes(count: chunkSize)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tus-hash-large-\(UUID().uuidString).bin")
        createdFiles.append(url)

        FileManager.default.createFile(atPath: url.path, contents: nil)
        let writeHandle = try FileHandle(forWritingTo: url)
        defer { try? writeHandle.close() }

        var written = 0
        while written < totalSize {
            let take = min(chunkSize, totalSize - written)
            try autoreleasepool {
                try writeHandle.write(contentsOf: chunk.prefix(take))
            }
            written += take
        }
        try writeHandle.close()

        let digest = try TusUploadManager.sha256Hex(of: url)
        let isLowercaseHex: (Character) -> Bool = { ch in
            ("0"..."9").contains(ch) || ("a"..."f").contains(ch)
        }
        XCTAssertEqual(digest.count, 64,
            "SHA-256 hex digest must be 64 chars regardless of input size")
        XCTAssertTrue(digest.allSatisfy(isLowercaseHex),
            "Digest must be lowercase hex; got: \(digest)")
    }

    // MARK: - Edge cases

    /// Empty file → SHA-256 of empty input is the well-known constant
    /// `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
    /// Pins the `read(upToCount:)` early-exit path when the very first
    /// chunk is empty.
    func test_sha256_emptyFile_returnsCorrectDigest() throws {
        let url = try writeTempFile(data: Data(), suffix: "empty")
        let digest = try TusUploadManager.sha256Hex(of: url)
        XCTAssertEqual(digest,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "SHA-256 of empty input must equal the canonical empty-input digest")
    }

    /// 100 bytes — strictly smaller than the 64 KiB streaming buffer.
    /// This pins the single-chunk path: the loop must hash the partial
    /// read, set up the next iteration, read 0 bytes, and finalize.
    func test_sha256_smallChunk_lessThanBufferSize() throws {
        let bytes = makeDeterministicBytes(count: 100)
        let url = try writeTempFile(data: bytes, suffix: "100b")

        let streamed = try TusUploadManager.sha256Hex(of: url)
        let oneShot = SHA256.hash(data: bytes)
            .map { String(format: "%02x", $0) }
            .joined()

        XCTAssertEqual(streamed, oneShot,
            "Files smaller than the streaming buffer (64 KiB) must still " +
            "produce the same digest as a one-shot hash.")
    }
}
