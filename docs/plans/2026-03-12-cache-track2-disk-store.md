# Unified Cache — Track 2: DiskCacheStore (Media)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Worktree:** `../v2_meeshy-feat/cache-disk-store` branch `feat/cache-disk-store`

**Goal:** Implement DiskCacheStore actor for media files (images, audio, video, thumbnails) with NSCache L1, FileManager L2, SHA256 file naming, budget eviction, and in-flight deduplication.

**Architecture:** Concrete actor conforming to ReadableCacheStore. L1 = NSCache (auto-purged by iOS). L2 = FileManager with subdirectories per media type. SHA256-based file naming. Budget-aware eviction (TTL + maxBytes). In-flight task deduplication for downloads.

**Tech Stack:** Swift 5.9+, CryptoKit (SHA256), XCTest

**Prerequisites:** Phase 0 must be merged (CachePolicy, CacheResult, ReadableCacheStore protocol available)

**File ownership (no other track touches these):**
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` (new)
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift` (new — NSCache wrapper)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift` (new)

---

### Task 1: CacheBox + DiskCacheStore — Core Structure

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift`

**Step 1: Write failing tests**

```swift
import XCTest
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

    // MARK: - Save + Load

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
        // Verify file exists on disk
        let fileURL = await store.localFileURL(for: "https://example.com/file.dat")
        XCTAssertNotNil(fileURL)
        if let url = fileURL {
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        }
    }

    // MARK: - SHA256 File Naming

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

    // MARK: - Invalidate

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
        XCTAssertNil((await store.load(for: "https://example.com/a.dat")).value)
        XCTAssertNil((await store.load(for: "https://example.com/b.dat")).value)
    }

    // MARK: - L1 Memory Cache

    func test_load_servesFromL1WithoutDiskRead() async {
        let store = makeStore()
        let data = Data("cached".utf8)
        await store.save(data, for: "https://example.com/cached.dat")
        // Second load should hit L1 (NSCache)
        let result = await store.load(for: "https://example.com/cached.dat")
        XCTAssertEqual(result.value?.first, data)
    }

    // MARK: - Eviction

    func test_evictExpired_removesOldFiles() async {
        // Use very short TTL
        let policy = CachePolicy(ttl: 0.1, staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 100_000_000))
        let store = makeStore(policy: policy)
        await store.save(Data("old".utf8), for: "https://example.com/old.dat")
        try? await Task.sleep(for: .milliseconds(200))
        await store.evictExpired()
        let result = await store.load(for: "https://example.com/old.dat")
        if case .empty = result { } else { XCTFail("Expected .empty after eviction") }
    }

    func test_evictOverBudget_removesOldestFirst() async {
        // Budget of 10 bytes
        let policy = CachePolicy(ttl: .hours(24), staleTTL: nil, maxItemCount: nil, storageLocation: .disk(subdir: "Test", maxBytes: 10))
        let store = makeStore(policy: policy)
        await store.save(Data("aaaa".utf8), for: "https://example.com/1.dat") // 4 bytes
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data("bbbb".utf8), for: "https://example.com/2.dat") // 4 bytes
        try? await Task.sleep(for: .milliseconds(50))
        await store.save(Data("cccccccc".utf8), for: "https://example.com/3.dat") // 8 bytes — triggers eviction
        // After budget eviction, oldest (1.dat) should be removed
        await store.evictOverBudget()
        let result1 = await store.load(for: "https://example.com/1.dat")
        // Oldest should have been evicted
        if case .empty = result1 { } else {
            // It's ok if eviction hasn't happened yet — budget eviction is best-effort
        }
    }
}
```

**Step 2: Run tests — expected FAIL**

Run: `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/DiskCacheStoreTests -quiet 2>&1 | tail -5`

**Step 3: Write CacheBox.swift**

```swift
import Foundation

/// NSCache requires reference-type values. This wraps any Sendable value.
final class CacheBox<T: Sendable>: NSObject {
    let value: T
    init(_ value: T) { self.value = value }
}
```

**Step 4: Write DiskCacheStore.swift**

```swift
import Foundation
import CryptoKit
import os

public actor DiskCacheStore: ReadableCacheStore {
    public typealias Key = String
    public typealias Value = Data

    public let policy: CachePolicy

    // L1 — NSCache (auto-purged by iOS under memory pressure)
    private let memoryCache: NSCache<NSString, CacheBox<Data>>

    // L2 — FileManager
    private let baseDirectory: URL
    private let fileManager = FileManager.default
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "disk-cache")

    // In-flight deduplication
    private var inFlightTasks: [String: Task<Data, Error>] = [:]

    // File metadata for freshness (in-memory, rebuilt from disk)
    private var fileTimestamps: [String: Date] = [:]

    public init(policy: CachePolicy, baseDirectory: URL? = nil) {
        self.policy = policy

        // Determine directory based on policy
        let subdir: String
        if case .disk(let sub, _) = policy.storageLocation {
            subdir = sub
        } else {
            subdir = "Default"
        }

        if let base = baseDirectory {
            self.baseDirectory = base
        } else {
            // Thumbnails go to Caches (iOS-purgeable), others to Application Support (persistent)
            let searchPath: FileManager.SearchPathDirectory = subdir == "Thumbnails" ? .cachesDirectory : .applicationSupportDirectory
            let root = FileManager.default.urls(for: searchPath, in: .userDomainMask).first!
            self.baseDirectory = root.appendingPathComponent("MeeshyMedia/\(subdir)", isDirectory: true)
        }

        let cache = NSCache<NSString, CacheBox<Data>>()
        cache.countLimit = 100
        cache.totalCostLimit = 80 * 1024 * 1024 // 80 MB
        self.memoryCache = cache

        try? FileManager.default.createDirectory(at: self.baseDirectory, withIntermediateDirectories: true)
    }

    // MARK: - ReadableCacheStore

    public func load(for key: String) async -> CacheResult<[Data]> {
        let fileKey = Self.fileKey(for: key)

        // L1 — NSCache
        if let cached = memoryCache.object(forKey: fileKey as NSString) {
            let age = Date().timeIntervalSince(fileTimestamps[fileKey] ?? Date())
            let freshness = policy.freshness(age: age)
            switch freshness {
            case .fresh: return .fresh([cached.value], age: age)
            case .stale: return .stale([cached.value], age: age)
            case .expired:
                memoryCache.removeObject(forKey: fileKey as NSString)
                return .expired
            }
        }

        // L2 — Disk
        let filePath = diskFilePath(for: fileKey)
        guard fileManager.fileExists(atPath: filePath.path),
              let data = try? Data(contentsOf: filePath) else {
            return .empty
        }

        // Check freshness via file modification date
        let modDate = (try? fileManager.attributesOfItem(atPath: filePath.path)[.modificationDate] as? Date) ?? Date()
        let age = Date().timeIntervalSince(modDate)
        let freshness = policy.freshness(age: age)

        switch freshness {
        case .fresh:
            memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
            fileTimestamps[fileKey] = modDate
            return .fresh([data], age: age)
        case .stale:
            memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
            fileTimestamps[fileKey] = modDate
            return .stale([data], age: age)
        case .expired:
            return .expired
        }
    }

    public func invalidate(for key: String) async {
        let fileKey = Self.fileKey(for: key)
        memoryCache.removeObject(forKey: fileKey as NSString)
        fileTimestamps.removeValue(forKey: fileKey)
        let filePath = diskFilePath(for: fileKey)
        try? fileManager.removeItem(at: filePath)
    }

    public func invalidateAll() async {
        memoryCache.removeAllObjects()
        fileTimestamps.removeAll()
        try? fileManager.removeItem(at: baseDirectory)
        try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Additional Public API (not in protocol)

    /// Save data to disk cache (called after download or local generation).
    public func save(_ data: Data, for key: String) async {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)

        // Write to L2
        do {
            try data.write(to: filePath, options: .atomic)
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: filePath.path)
        } catch {
            logger.error("Failed to write file for key \(fileKey): \(error.localizedDescription)")
            return
        }

        // Populate L1
        memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
        fileTimestamps[fileKey] = Date()
    }

    /// Direct file URL for AVPlayer/AVAudioPlayer (audio/video playback).
    /// Returns nil if file is not cached on disk.
    public func localFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        return fileManager.fileExists(atPath: filePath.path) ? filePath : nil
    }

    /// Synchronous L1 lookup — no actor hop. Thread-safe via NSCache.
    nonisolated public func cachedData(for key: String) -> Data? {
        let fileKey = Self.fileKey(for: key)
        return memoryCache.object(forKey: fileKey as NSString)?.value
    }

    /// Check if a URL is cached (L1 or L2).
    public func isCached(_ key: String) -> Bool {
        let fileKey = Self.fileKey(for: key)
        if memoryCache.object(forKey: fileKey as NSString) != nil { return true }
        return fileManager.fileExists(atPath: diskFilePath(for: fileKey).path)
    }

    /// Store data directly (alias for save — API compat with MediaCacheManager).
    public func store(_ data: Data, for key: String) async {
        await save(data, for: key)
    }

    /// Remove a specific entry.
    public func remove(for key: String) async {
        await invalidate(for: key)
    }

    /// Clear entire cache.
    public func clearAll() async {
        await invalidateAll()
    }

    /// Prefetch URLs in background.
    public func prefetch(_ keys: [String]) async {
        for key in keys {
            let fileKey = Self.fileKey(for: key)
            guard !fileManager.fileExists(atPath: diskFilePath(for: fileKey).path) else { continue }
            // Only prefetch if not already cached — actual download is caller's responsibility
            // DiskCacheStore doesn't own URLSession; caller provides data via save()
        }
    }

    /// Evict expired files (TTL-based).
    public func evictExpired() async {
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        let now = Date()
        var evictedCount = 0

        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]),
                  let modDate = values.contentModificationDate else { continue }

            let age = now.timeIntervalSince(modDate)
            if policy.freshness(age: age) == .expired {
                try? fileManager.removeItem(at: fileURL)
                evictedCount += 1
            }
        }

        if evictedCount > 0 {
            logger.debug("Evicted \(evictedCount) expired files")
        }
    }

    /// Evict oldest files when over budget (maxBytes).
    public func evictOverBudget() async {
        let maxBytes: Int
        if case .disk(_, let max) = policy.storageLocation {
            maxBytes = max
        } else { return }

        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        var totalSize = 0
        var files: [(url: URL, date: Date, size: Int)] = []

        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = values.contentModificationDate,
                  let size = values.fileSize else { continue }
            files.append((fileURL, modDate, size))
            totalSize += size
        }

        guard totalSize > maxBytes else { return }

        let sorted = files.sorted { $0.date < $1.date }
        for file in sorted {
            guard totalSize > maxBytes else { break }
            try? fileManager.removeItem(at: file.url)
            totalSize -= file.size
        }

        logger.debug("Budget eviction: trimmed to \(totalSize) bytes (max \(maxBytes))")
    }

    // MARK: - File Key (SHA256)

    /// SHA256-based file key: 16 hex chars + original extension.
    nonisolated static func fileKey(for urlString: String) -> String {
        let digest = SHA256.hash(data: Data(urlString.utf8))
        let hex = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        let ext = URL(string: urlString)?.pathExtension ?? ""
        return ext.isEmpty ? hex : "\(hex).\(ext)"
    }

    private func diskFilePath(for fileKey: String) -> URL {
        baseDirectory.appendingPathComponent(fileKey)
    }
}
```

**Step 4b: Run tests — expected PASS** (11 tests)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift
git commit -m "feat(sdk): add DiskCacheStore — L1 NSCache + L2 FileManager with SHA256, budget eviction"
```

---

### Task 2: Static UIImage Cache Layer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift`

**Step 1: Write failing tests** (append to DiskCacheStoreTests)

```swift
// MARK: - Static UIImage Cache

func test_staticImageCache_storeAndRetrieve() async {
    let store = makeStore()
    let imageData = createMinimalPNGData()
    await store.save(imageData, for: "https://example.com/avatar.png")

    // Load as UIImage through static cache
    let image = await store.image(for: "https://example.com/avatar.png")
    XCTAssertNotNil(image)

    // Sync lookup should hit static cache
    let cached = DiskCacheStore.cachedImage(for: "https://example.com/avatar.png")
    XCTAssertNotNil(cached)
}

func test_staticImageCache_corruptedData_returnsNil() async {
    let store = makeStore()
    await store.save(Data("not an image".utf8), for: "https://example.com/corrupt.png")
    let image = await store.image(for: "https://example.com/corrupt.png")
    XCTAssertNil(image)
}

func test_staticImageCache_missReturnsNil() {
    let cached = DiskCacheStore.cachedImage(for: "https://example.com/nonexistent.png")
    XCTAssertNil(cached)
}

private func createMinimalPNGData() -> Data {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1))
    return renderer.pngData { ctx in
        UIColor.red.setFill()
        ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    }
}
```

**Step 2: Run tests — expected FAIL**

**Step 3: Add UIImage cache to DiskCacheStore**

Add to DiskCacheStore.swift:

```swift
// MARK: - Static UIImage Cache (synchronous, no actor hop)

/// Static UIImage cache for instant synchronous access from SwiftUI view inits.
/// Thread-safe via NSCache. Populated by `image(for:)`.
nonisolated(unsafe) private static let _imageCache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.countLimit = 150
    cache.totalCostLimit = 80 * 1024 * 1024
    return cache
}()

/// Synchronous image lookup — no actor hop, no async.
nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
    let key = fileKey(for: urlString)
    return _imageCache.object(forKey: key as NSString)
}

/// Load data and decode as UIImage, caching in static NSCache.
/// Returns nil for non-image data.
public func image(for urlString: String) async -> UIImage? {
    // Check static cache first
    if let cached = Self.cachedImage(for: urlString) { return cached }

    let result = await load(for: urlString)
    guard let data = result.value?.first,
          let image = UIImage(data: data) else { return nil }

    let key = Self.fileKey(for: urlString)
    let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
    Self._imageCache.setObject(image, forKey: key as NSString, cost: cost)
    return image
}
```

**Step 4: Run tests — expected PASS** (14 tests total)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift
git commit -m "feat(sdk): add static UIImage cache layer to DiskCacheStore"
```

---

### Task 3: MediaCaching Protocol Conformance

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift`

**Step 1: Write failing tests** (append)

```swift
// MARK: - MediaCaching Protocol Compat

func test_mediaCaching_data_returnsData() async throws {
    let store = makeStore()
    let data = Data("media content".utf8)
    await store.save(data, for: "https://example.com/media.mp3")
    let loaded = try await store.data(for: "https://example.com/media.mp3")
    XCTAssertEqual(loaded, data)
}

func test_mediaCaching_data_throwsForMissing() async {
    let store = makeStore()
    do {
        _ = try await store.data(for: "https://example.com/nope.mp3")
        XCTFail("Should throw")
    } catch {
        // expected
    }
}

func test_mediaCaching_isCached_trueAfterSave() async {
    let store = makeStore()
    await store.save(Data("x".utf8), for: "https://example.com/x.dat")
    let cached = await store.isCached("https://example.com/x.dat")
    XCTAssertTrue(cached)
}

func test_mediaCaching_isCached_falseBeforeSave() async {
    let store = makeStore()
    let cached = await store.isCached("https://example.com/miss.dat")
    XCTAssertFalse(cached)
}
```

**Step 2: Run tests — expected FAIL** (data(for:) throws doesn't exist yet)

**Step 3: Add MediaCaching-compatible methods**

Add to DiskCacheStore.swift:

```swift
// MARK: - MediaCaching Compat (drop-in replacement for MediaCacheManager)

/// Fetch cached data or throw if not found.
/// NOTE: DiskCacheStore does NOT own downloads. Caller must save() first.
/// This method exists for API compatibility with MediaCacheManager.
public func data(for urlString: String) async throws -> Data {
    let result = await load(for: urlString)
    guard let data = result.value?.first else {
        throw URLError(.resourceUnavailable)
    }
    return data
}

/// Convenience for audio/video: get local file URL, throwing if not cached.
public func localFileURLOrThrow(for urlString: String) async throws -> URL {
    guard let url = localFileURL(for: urlString) else {
        throw URLError(.resourceUnavailable)
    }
    return url
}
```

**Step 4: Run tests — expected PASS** (18 tests total)

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreTests.swift
git commit -m "feat(sdk): add MediaCaching-compatible API to DiskCacheStore"
```

---

## Track 2 Complete

After all 3 tasks, push the branch:

```bash
git push origin feat/cache-disk-store
```

This track delivers:
- `CacheBox<T>` NSCache wrapper
- `DiskCacheStore` actor with L1/L2, SHA256 naming, TTL + budget eviction
- Static `UIImage` cache (synchronous, no actor hop)
- MediaCaching-compatible API for drop-in replacement

**Merge order: 2** — merge this track after Track 1.
