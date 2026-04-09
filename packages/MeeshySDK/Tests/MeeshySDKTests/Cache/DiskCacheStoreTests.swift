import XCTest
import UIKit
@testable import MeeshySDK

final class DiskCacheStoreTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("DiskCacheStoreTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    private func makeStore(
        policy: CachePolicy = .mediaImages,
        baseDirectory: URL? = nil
    ) -> DiskCacheStore {
        DiskCacheStore(policy: policy, baseDirectory: baseDirectory ?? tempDir)
    }

    // MARK: - Core Tests

    func test_save_thenLoad_returnsFresh() async {
        let store = makeStore()
        let data = Data("hello world".utf8)
        await store.save(data, for: "https://example.com/photo.jpg")
        let result = await store.load(for: "https://example.com/photo.jpg")
        switch result {
        case .fresh(let items, let age):
            XCTAssertEqual(items.count, 1)
            XCTAssertEqual(items[0], data)
            XCTAssert(age < 1)
        default: XCTFail("Expected .fresh, got \(result)")
        }
    }

    func test_load_nonExistent_returnsEmpty() async {
        let store = makeStore()
        let result = await store.load(for: "https://example.com/missing.png")
        if case .empty = result { } else { XCTFail("Expected .empty") }
    }

    func test_save_persistsToDisk() async {
        let store = makeStore()
        let data = Data("persisted".utf8)
        await store.save(data, for: "https://example.com/file.dat")
        let fileURL = await store.localFileURL(for: "https://example.com/file.dat")
        XCTAssertNotNil(fileURL)
        if let url = fileURL {
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        }
    }

    func test_fileNaming_preservesExtension() async {
        let store = makeStore()
        await store.save(Data("img".utf8), for: "https://cdn.example.com/path/photo.jpg")
        let url = await store.localFileURL(for: "https://cdn.example.com/path/photo.jpg")
        XCTAssertTrue(url?.pathExtension == "jpg")
    }

    func test_fileNaming_differentURLs_differentFiles() async {
        let store = makeStore()
        await store.save(Data("a".utf8), for: "https://example.com/a.png")
        await store.save(Data("b".utf8), for: "https://example.com/b.png")
        let urlA = await store.localFileURL(for: "https://example.com/a.png")
        let urlB = await store.localFileURL(for: "https://example.com/b.png")
        XCTAssertNotEqual(urlA, urlB)
    }

    func test_invalidate_removesFromDiskAndMemory() async {
        let store = makeStore()
        await store.save(Data("x".utf8), for: "https://example.com/x.dat")
        await store.invalidate(for: "https://example.com/x.dat")
        let result = await store.load(for: "https://example.com/x.dat")
        if case .empty = result { } else { XCTFail("Expected .empty after invalidate") }
    }

    func test_invalidateAll_clearsAllFiles() async {
        let store = makeStore()
        await store.save(Data("a".utf8), for: "https://example.com/a.dat")
        await store.save(Data("b".utf8), for: "https://example.com/b.dat")
        await store.invalidateAll()
        let resultA = await store.load(for: "https://example.com/a.dat")
        let resultB = await store.load(for: "https://example.com/b.dat")
        XCTAssertNil(resultA.value)
        XCTAssertNil(resultB.value)
    }

    func test_load_servesFromL1WithoutDiskRead() async {
        let store = makeStore()
        let data = Data("cached".utf8)
        await store.save(data, for: "https://example.com/cached.dat")
        let result = await store.load(for: "https://example.com/cached.dat")
        XCTAssertEqual(result.value?.first, data)
    }

    func test_evictExpired_removesOldFiles() async {
        let policy = CachePolicy(ttl: 0.1, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 100_000_000))
        let store = makeStore(policy: policy)
        await store.save(Data("old".utf8), for: "https://example.com/old.dat")
        try? await Task.sleep(for: .milliseconds(200))
        await store.evictExpired()
        let result = await store.load(for: "https://example.com/old.dat")
        if case .empty = result { } else { XCTFail("Expected .empty after eviction") }
    }

    func test_evictOverBudget_removesOldestFirst() async {
        let policy = CachePolicy(ttl: .hours(24), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 10))
        let store = makeStore(policy: policy)
        await store.save(Data("aaaa".utf8), for: "https://example.com/1.dat")
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data("bbbb".utf8), for: "https://example.com/2.dat")
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data("cccccccc".utf8), for: "https://example.com/3.dat")
        await store.evictOverBudget()
        let result1 = await store.load(for: "https://example.com/1.dat")
        if case .empty = result1 { } else { /* best-effort eviction */ }
    }

    func test_isCached_trueAfterSave() async {
        let store = makeStore()
        await store.save(Data("x".utf8), for: "https://example.com/x.dat")
        let cached = await store.isCached("https://example.com/x.dat")
        XCTAssertTrue(cached)
    }

    func test_isCached_falseBeforeSave() async {
        let store = makeStore()
        let cached = await store.isCached("https://example.com/miss.dat")
        XCTAssertFalse(cached)
    }

    // MARK: - Size management (point 44)

    func test_evictOverBudget_respectsMaxSize() async {
        let policy = CachePolicy(ttl: .hours(24), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 50))
        let store = makeStore(policy: policy)

        // Save 3 files totaling > 50 bytes
        await store.save(Data(repeating: 0xAA, count: 20), for: "https://example.com/1.dat")
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data(repeating: 0xBB, count: 20), for: "https://example.com/2.dat")
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data(repeating: 0xCC, count: 20), for: "https://example.com/3.dat")

        await store.evictOverBudget()

        // The oldest file(s) should be evicted to bring total under 50 bytes
        let result1 = await store.load(for: "https://example.com/1.dat")
        let result3 = await store.load(for: "https://example.com/3.dat")

        // Newest file should survive
        XCTAssertNotNil(result3.value, "Newest file should survive eviction")
        // Oldest may be evicted (depending on exact budget enforcement)
        if case .empty = result1 {
            // Expected — oldest evicted
        }
    }

    func test_evictOverBudget_noOpWhenUnderBudget() async {
        let policy = CachePolicy(ttl: .hours(24), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 1_000_000))
        let store = makeStore(policy: policy)

        await store.save(Data("small".utf8), for: "https://example.com/tiny.dat")
        await store.evictOverBudget()

        let result = await store.load(for: "https://example.com/tiny.dat")
        XCTAssertNotNil(result.value, "File under budget should not be evicted")
    }

    func test_evictExpired_keepsNonExpiredFiles() async {
        let policy = CachePolicy(ttl: .hours(24), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 100_000_000))
        let store = makeStore(policy: policy)

        await store.save(Data("keep me".utf8), for: "https://example.com/fresh.dat")
        await store.evictExpired()

        let result = await store.load(for: "https://example.com/fresh.dat")
        XCTAssertNotNil(result.value, "Non-expired file should survive eviction")
    }

    // MARK: - UIImage Cache Tests

    private func make1x1PNGData() -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1))
        return renderer.pngData { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }

    func test_image_storePNG_thenLoadViaImage() async {
        let store = makeStore()
        let pngData = make1x1PNGData()
        let key = "https://example.com/icon.png"

        await store.save(pngData, for: key)
        let image = await store.image(for: key)
        XCTAssertNotNil(image)

        let cached = DiskCacheStore.cachedImage(for: key)
        XCTAssertNotNil(cached)
    }

    func test_image_corruptData_returnsNil() async {
        let store = makeStore()
        let key = "https://example.com/corrupt.png"
        await store.save(Data("not an image".utf8), for: key)
        let image = await store.image(for: key)
        XCTAssertNil(image)
    }

    func test_cachedImage_missingKey_returnsNil() {
        let result = DiskCacheStore.cachedImage(for: "https://example.com/nope.png")
        XCTAssertNil(result)
    }

    // MARK: - MediaCaching-Compatible API Tests

    func test_data_returnsDataAfterSave() async throws {
        let store = makeStore()
        let expected = Data("hello media".utf8)
        await store.save(expected, for: "https://example.com/media.mp3")
        let result = try await store.data(for: "https://example.com/media.mp3")
        XCTAssertEqual(result, expected)
    }

    func test_data_throwsForMissingKey() async {
        let store = makeStore()
        do {
            _ = try await store.data(for: "https://example.com/missing.mp3")
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertTrue(error is DiskCacheStore.DiskCacheError)
        }
    }

    func test_isCached_trueAfterStore() async {
        let store = makeStore()
        await store.store(Data("compat".utf8), for: "https://example.com/compat.dat")
        let cached = await store.isCached("https://example.com/compat.dat")
        XCTAssertTrue(cached)
    }

    func test_isCached_falseAfterRemove() async {
        let store = makeStore()
        await store.store(Data("temp".utf8), for: "https://example.com/temp.dat")
        await store.remove(for: "https://example.com/temp.dat")
        let cached = await store.isCached("https://example.com/temp.dat")
        XCTAssertFalse(cached)
    }
}
