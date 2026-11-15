import XCTest
@testable import MeeshySDK

/// #9875 — l'empreinte d'un fichier inchangé ne se calcule qu'une fois.
///
/// `sha256Hex` relisait le fichier entier à chaque tentative de
/// téléversement : un vocal ou une vidéo rejoué par la file durable se
/// relisait autant de fois qu'il était retenté.
final class FileDigestMemoTests: XCTestCase {

    private var createdFiles: [URL] = []

    override func tearDown() {
        for url in createdFiles { try? FileManager.default.removeItem(at: url) }
        createdFiles.removeAll()
        super.tearDown()
    }

    private func writeFile(_ contents: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("digest-memo-\(UUID().uuidString).bin")
        try Data(contents.utf8).write(to: url)
        createdFiles.append(url)
        return url
    }

    private final class CountingHasher: @unchecked Sendable {
        private(set) var calls = 0
        func hash(_ url: URL) throws -> String {
            calls += 1
            return try TusUploadManager.sha256Hex(of: url)
        }
    }

    func test_digest_sameUnchangedFile_isComputedOnce() throws {
        let file = try writeFile("une seule lecture")
        let memo = FileDigestMemo(capacity: 4)
        let hasher = CountingHasher()

        let first = try memo.digest(of: file, computing: hasher.hash)
        let second = try memo.digest(of: file, computing: hasher.hash)

        XCTAssertEqual(hasher.calls, 1)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first, try TusUploadManager.sha256Hex(of: file))
    }

    func test_digest_fileRewrittenAtTheSamePath_isRecomputed() throws {
        let file = try writeFile("avant")
        let memo = FileDigestMemo(capacity: 4)
        let hasher = CountingHasher()
        let before = try memo.digest(of: file, computing: hasher.hash)

        try Data("après, plus long".utf8).write(to: file)
        let after = try memo.digest(of: file, computing: hasher.hash)

        XCTAssertEqual(hasher.calls, 2)
        XCTAssertNotEqual(before, after)
        XCTAssertEqual(after, try TusUploadManager.sha256Hex(of: file))
    }

    func test_digest_beyondCapacity_forgetsTheOldestFile() throws {
        let oldest = try writeFile("un")
        let middle = try writeFile("deux")
        let newest = try writeFile("trois")
        let memo = FileDigestMemo(capacity: 2)
        let hasher = CountingHasher()

        _ = try memo.digest(of: oldest, computing: hasher.hash)
        _ = try memo.digest(of: middle, computing: hasher.hash)
        _ = try memo.digest(of: newest, computing: hasher.hash)
        XCTAssertEqual(memo.count, 2, "La mémoire reste bornée")

        _ = try memo.digest(of: newest, computing: hasher.hash)
        XCTAssertEqual(hasher.calls, 3, "Le plus récent est encore connu")
        _ = try memo.digest(of: oldest, computing: hasher.hash)
        XCTAssertEqual(hasher.calls, 4, "Le plus ancien a cédé sa place et se rehache")
    }

    func test_digest_missingFile_propagatesTheReadError() throws {
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("digest-memo-absent-\(UUID().uuidString).bin")
        let memo = FileDigestMemo(capacity: 4)

        XCTAssertThrowsError(try memo.digest(of: missing, computing: TusUploadManager.sha256Hex(of:)))
        XCTAssertEqual(memo.count, 0)
    }
}
