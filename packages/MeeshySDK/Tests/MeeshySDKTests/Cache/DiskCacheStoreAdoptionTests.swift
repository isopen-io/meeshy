import XCTest
@testable import MeeshySDK

final class DiskCacheStoreAdoptionTests: XCTestCase {

    private var tempDir: URL!
    private var store: DiskCacheStore!

    override func setUp() async throws {
        try await super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("adoption-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        store = DiskCacheStore(policy: .mediaAudio, baseDirectory: tempDir)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: tempDir)
        store = nil
        tempDir = nil
        try await super.tearDown()
    }

    // MARK: - Basic adoption

    func test_adopt_existingLocalFile_makesKeyCached() async throws {
        let localURL = tempDir.appendingPathComponent("optimistic.m4a")
        try Data([0x01, 0x02, 0x03, 0x04]).write(to: localURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL.path))

        let canonicalKey = "https://media.meeshy.me/audio/test.m4a"
        await store.adopt(localFile: localURL, for: canonicalKey)

        let cached = await store.isCached(canonicalKey)
        XCTAssertTrue(cached, "isCached must be true after adopt")
    }

    func test_adopt_movesSourceFile() async throws {
        let localURL = tempDir.appendingPathComponent("source.m4a")
        try Data([0xAA, 0xBB]).write(to: localURL)

        let canonicalKey = "https://media.meeshy.me/audio/moved.m4a"
        await store.adopt(localFile: localURL, for: canonicalKey)

        XCTAssertFalse(FileManager.default.fileExists(atPath: localURL.path),
            "Source must be removed after move")
    }

    // MARK: - Non-destructive seed (local-first: author keeps the source file)

    func test_seed_existingLocalFile_makesKeyCached() async throws {
        let localURL = tempDir.appendingPathComponent("publish-source.m4a")
        try Data([0x01, 0x02, 0x03, 0x04]).write(to: localURL)

        let canonicalKey = "https://gate.meeshy.me/api/v1/attachments/file/story.m4a"
        await store.seed(copyingLocalFile: localURL, for: canonicalKey)

        let cached = await store.isCached(canonicalKey)
        XCTAssertTrue(cached, "isCached must be true after seed — la story de l'auteur joue depuis le disque")
    }

    func test_seed_preservesSourceFile() async throws {
        // Contrairement à `adopt` (move), `seed` COPIE : la source reste en place
        // car elle peut être encore référencée par la preview live du composer.
        let localURL = tempDir.appendingPathComponent("still-needed.m4a")
        try Data([0xAA, 0xBB, 0xCC]).write(to: localURL)

        let canonicalKey = "https://gate.meeshy.me/api/v1/attachments/file/kept.m4a"
        await store.seed(copyingLocalFile: localURL, for: canonicalKey)

        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL.path),
            "seed must NOT remove the source (non-destructive copy)")
        let cached = await store.isCached(canonicalKey)
        XCTAssertTrue(cached, "and the cache must still hold the copy")
    }

    func test_seed_calledTwice_isIdempotent_keepsFirst() async throws {
        let localURL1 = tempDir.appendingPathComponent("seed-v1.m4a")
        try Data([0x01]).write(to: localURL1)
        let canonicalKey = "https://gate.meeshy.me/api/v1/attachments/file/idem.m4a"
        await store.seed(copyingLocalFile: localURL1, for: canonicalKey)

        let localURL2 = tempDir.appendingPathComponent("seed-v2.m4a")
        try Data([0x02]).write(to: localURL2)
        await store.seed(copyingLocalFile: localURL2, for: canonicalKey)

        let data = try await store.data(for: canonicalKey)
        XCTAssertEqual(data, Data([0x01]), "first seeded version must win (idempotent)")
    }

    // MARK: - Idempotence

    func test_adopt_calledTwice_isIdempotent() async throws {
        let localURL1 = tempDir.appendingPathComponent("v1.m4a")
        try Data([0x01]).write(to: localURL1)

        let canonicalKey = "https://media.meeshy.me/audio/key.m4a"
        await store.adopt(localFile: localURL1, for: canonicalKey)

        let localURL2 = tempDir.appendingPathComponent("v2.m4a")
        try Data([0x02]).write(to: localURL2)
        await store.adopt(localFile: localURL2, for: canonicalKey)

        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL2.path),
            "Second source must NOT be moved (idempotent)")

        let data = try await store.data(for: canonicalKey)
        XCTAssertEqual(data, Data([0x01]), "First adopted version must be preserved")
    }

    // MARK: - Missing source

    func test_adopt_nonExistentSource_doesNotCrash() async {
        let localURL = tempDir.appendingPathComponent("missing.m4a")
        let canonicalKey = "https://media.meeshy.me/audio/missing.m4a"

        await store.adopt(localFile: localURL, for: canonicalKey)

        let cached = await store.isCached(canonicalKey)
        XCTAssertFalse(cached, "isCached must be false if source is absent")
    }

    // MARK: - adoptImage seeds memory image cache

    func test_adoptImage_seedsMemoryImageCache() async throws {
        let localURL = tempDir.appendingPathComponent("photo.jpg")
        // Minimal 1x1 PNG. UIImage(contentsOfFile:) on a malformed JPG returns nil,
        // so we use a real PNG bitstream here even though the extension says jpg.
        let pngData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=")!
        try pngData.write(to: localURL)

        let canonicalKey = "https://media.meeshy.me/images/photo.jpg"
        await store.adoptImage(localFile: localURL, for: canonicalKey)

        // cacheImageForPreview (2026-07-21) inserts synchronously — no
        // MainActor hop to await anymore.
        let cachedImage = DiskCacheStore.cachedImage(for: canonicalKey)
        XCTAssertNotNil(cachedImage,
            "adoptImage must seed DiskCacheStore.cachedImage(for:) for instant render")
    }
}
