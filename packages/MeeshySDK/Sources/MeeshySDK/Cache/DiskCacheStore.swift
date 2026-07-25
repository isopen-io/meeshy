import Foundation
import CryptoKit
import UIKit
import os

public actor DiskCacheStore: ReadableCacheStore {
    public typealias Key = String
    public typealias Value = Data

    public let policy: CachePolicy

    nonisolated(unsafe) private let memoryCache: NSCache<NSString, CacheBox>
    private let baseDirectory: URL
    private let fileManager = FileManager.default
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "disk-cache")
    private var inFlightTasks: [String: InFlightDownload] = [:]
    private var fileTimestamps: [String: Date] = [:]

    /// Pin registry (R5 offline replay) : fileKey → pin expiry. A file whose
    /// pin is still active is exempt from BOTH `evictOverBudget()` (LRU) and
    /// `evictExpired()` (TTL). Persisted to a hidden sidecar (`.pins.json`)
    /// so a boot-time sweep cannot evict media pinned in a previous launch —
    /// the eviction/sizing enumerators use `.skipsHiddenFiles`, so the sidecar
    /// itself is never a candidate. Loaded lazily on first pin/sweep access.
    private var pinExpiries: [String: Date] = [:]
    private var pinsLoaded = false

    /// Wraps an in-flight network task with an identity token so a stale
    /// completion never clears a NEWER entry registered under the same key.
    private struct InFlightDownload {
        let id = UUID()
        let task: Task<Data, Error>
    }

    public init(policy: CachePolicy, baseDirectory: URL? = nil) {
        self.policy = policy
        let subdir: String
        if case .disk(let sub, _) = policy.storageLocation {
            subdir = sub
        } else {
            subdir = "Default"
        }
        if let base = baseDirectory {
            self.baseDirectory = base
        } else {
            let searchPath: FileManager.SearchPathDirectory = subdir == "Thumbnails" ? .cachesDirectory : .applicationSupportDirectory
            let root = FileManager.default.urls(for: searchPath, in: .userDomainMask).first!
            self.baseDirectory = root.appendingPathComponent("MeeshyMedia/\(subdir)", isDirectory: true)
        }
        let cache = NSCache<NSString, CacheBox>()
        cache.countLimit = 100
        cache.totalCostLimit = 80 * 1024 * 1024
        self.memoryCache = cache
        try? FileManager.default.createDirectory(at: self.baseDirectory, withIntermediateDirectories: true)

        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task { @MainActor in
                DiskCacheStore.clearImageCache()
            }
            // Cannot easily clear memoryCache as it's not isolated(unsafe) for closure capture
            // but the static _imageCache is the main memory consumer.
        }
    }

    // MARK: - ReadableCacheStore

    public func load(for key: String) async -> CacheResult<[Data]> {
        let fileKey = Self.fileKey(for: key)
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
        let filePath = diskFilePath(for: fileKey)
        guard fileManager.fileExists(atPath: filePath.path),
              let data = try? Data(contentsOf: filePath) else {
            return .empty
        }
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
        // Une invalidation explicite prime sur la protection d'éviction : un
        // pin conservé re-protégerait un futur re-download de la même clé.
        loadPinsIfNeeded()
        if pinExpiries.removeValue(forKey: fileKey) != nil { persistPins() }
    }

    public func invalidateAll() async {
        memoryCache.removeAllObjects()
        fileTimestamps.removeAll()
        // Le sidecar `.pins.json` part avec le dossier — vider aussi le
        // registre en mémoire, sinon des pins fantômes seraient re-persistés
        // au prochain `pin()` (logout multi-compte).
        pinExpiries.removeAll()
        pinsLoaded = true
        try? fileManager.removeItem(at: baseDirectory)
        try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Write

    public func save(_ data: Data, for key: String) async {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        do {
            try data.write(to: filePath, options: .atomic)
            try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: filePath.path)
        } catch {
            logger.error("Failed to write file for key \(fileKey): \(error.localizedDescription)")
            return
        }
        memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
        fileTimestamps[fileKey] = Date()

        // E1 — auto-trigger eviction when the latest write may have
        // pushed the cache over `CachePolicy.storageLocation.maxBytes`.
        // Before this guard, `evictOverBudget()` was only callable from
        // outside (memory-warning, BGProcessingTask) so a heavy user
        // could grow the disk cache to 2GB+ before any cleanup fired.
        //
        // Cheap heuristic: skip the LRU scan when `data.count` alone is
        // well under the budget — most writes won't trip it. We still
        // tax once per N writes (`autoEvictionWriteCounter`) so even
        // small writes accumulating past budget eventually reconcile.
        await runBudgetEvictionIfNeeded(latestWriteSize: data.count)
    }

    /// E1 — bookkeeping counter so we don't scan the whole cache on
    /// every write. The scan still runs:
    /// - immediately when the latest write is itself > 1/10th of the
    ///   budget (one big video would otherwise blow past the cap before
    ///   the next checkpoint);
    /// - once every `Self.autoEvictionEveryNWrites` writes regardless.
    private var autoEvictionWriteCounter: Int = 0
    private static let autoEvictionEveryNWrites: Int = 32

    private func runBudgetEvictionIfNeeded(latestWriteSize: Int) async {
        guard case .disk(_, let maxBytes) = policy.storageLocation else { return }
        autoEvictionWriteCounter &+= 1
        let bigWrite = latestWriteSize > maxBytes / 10
        let periodic = autoEvictionWriteCounter % Self.autoEvictionEveryNWrites == 0
        guard bigWrite || periodic else { return }
        await evictOverBudget()
    }

    // MARK: - Adoption (PR B — optimistic local file → canonical cache key)

    /// Variante NON-DESTRUCTIVE d'`adopt` : COPIE le fichier local dans le cache
    /// sous `canonicalKey` et laisse la source en place. À utiliser quand le
    /// caller a encore besoin du fichier source (ex : un asset d'upload de story
    /// encore référencé par la preview live du composer). Idempotent : si la clé
    /// existe déjà, no-op. Seed l'auteur AU PUBLISH pour que ses propres stories
    /// jouent depuis le disque (offline) sans jamais re-télécharger ce qu'il
    /// possède déjà localement.
    public func seed(copyingLocalFile localURL: URL, for canonicalKey: String) async {
        guard fileManager.fileExists(atPath: localURL.path) else { return }
        let key = Self.fileKey(for: canonicalKey)
        let destination = diskFilePath(for: key)
        if fileManager.fileExists(atPath: destination.path) { return }
        do {
            try fileManager.copyItem(at: localURL, to: destination)
        } catch {
            logger.error("seed copy failed for key \(key): \(error.localizedDescription)")
            return
        }
        try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: destination.path)
        fileTimestamps[key] = Date()
    }

    /// Adopts an existing local file as the cached entry for `canonicalKey`.
    /// Move-if-same-volume (atomic), fallback copy + remove. Idempotent: if the
    /// key already exists on disk, the source is left alone (cached version wins).
    /// No memory-cache seeding: avoids blocking `Data(contentsOf:)` in the actor;
    /// audio/video will populate the NSCache on first `data(for:)` (disk hit).
    public func adopt(localFile localURL: URL, for canonicalKey: String) async {
        guard fileManager.fileExists(atPath: localURL.path) else { return }

        let key = Self.fileKey(for: canonicalKey)
        let destination = diskFilePath(for: key)

        if fileManager.fileExists(atPath: destination.path) {
            return
        }

        do {
            try fileManager.moveItem(at: localURL, to: destination)
        } catch {
            do {
                try fileManager.copyItem(at: localURL, to: destination)
                try? fileManager.removeItem(at: localURL)
            } catch {
                logger.error("adopt failed for key \(key): \(error.localizedDescription)")
                return
            }
        }
        try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: destination.path)
        fileTimestamps[key] = Date()
    }

    /// Image variant of `adopt`: also seeds the static UIImage cache via
    /// `cacheImageForPreview` so `ProgressiveCachedImage` renders instantly on
    /// the next display without round-tripping through downsampling.
    public func adoptImage(localFile localURL: URL, for canonicalKey: String) async {
        let alreadyCached = fileManager.fileExists(atPath: diskFilePath(for: Self.fileKey(for: canonicalKey)).path)
        await adopt(localFile: localURL, for: canonicalKey)
        guard !alreadyCached else { return }

        let key = Self.fileKey(for: canonicalKey)
        let destination = diskFilePath(for: key)
        guard let image = UIImage(contentsOfFile: destination.path) else { return }
        DiskCacheStore.cacheImageForPreview(image, key: canonicalKey)
    }

    // MARK: - Queries

    public func localFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        return fileManager.fileExists(atPath: filePath.path) ? filePath : nil
    }

    nonisolated public func cachedData(for key: String) -> Data? {
        let fileKey = Self.fileKey(for: key)
        return memoryCache.object(forKey: fileKey as NSString)?.value
    }

    /// Synchronous local file URL check — no actor hop needed.
    /// Returns the file URL if it exists on disk, nil otherwise.
    nonisolated public func cachedFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = baseDirectory.appendingPathComponent(fileKey)
        return FileManager.default.fileExists(atPath: filePath.path) ? filePath : nil
    }

    public func isCached(_ key: String) -> Bool {
        let fileKey = Self.fileKey(for: key)
        if memoryCache.object(forKey: fileKey as NSString) != nil { return true }
        return fileManager.fileExists(atPath: diskFilePath(for: fileKey).path)
    }

    // MARK: - MediaCaching-Compatible API

    public func data(for urlString: String) async throws -> Data {
        // 1. Check cache (memory + disk)
        let result = await load(for: urlString)
        if let data = result.snapshot()?.first { return data }

        // 2. Download from network (coalesced with any in-flight fetch) and cache
        guard let url = URL(string: urlString),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw DiskCacheError.notCached(urlString)
        }
        return try await networkData(for: urlString, url: url)
    }

    /// Single network funnel: every remote fetch for this store goes through
    /// here so concurrent callers (`data(for:)`, `image(for:)`, prefetchers)
    /// share ONE URLSession task per media key instead of opening duplicate
    /// connections. Observed on device: the same voice note fetched 2-3×
    /// concurrently by independent paths saturated a slow cellular link
    /// (NSURLError -1001 ×50 → HTTP/2 connection torn down).
    private func networkData(for urlString: String, url: URL) async throws -> Data {
        let fileKey = Self.fileKey(for: urlString)
        if let existing = inFlightTasks[fileKey] {
            return try await existing.task.value
        }

        let task = Task<Data, Error> {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                throw DiskCacheError.notCached(urlString)
            }
            await save(data, for: urlString)
            return data
        }

        let entry = InFlightDownload(task: task)
        inFlightTasks[fileKey] = entry
        defer {
            if inFlightTasks[fileKey]?.id == entry.id { inFlightTasks[fileKey] = nil }
        }
        return try await task.value
    }

    /// In-flight network download for `key`, if any. Lets an external
    /// progress-streaming downloader (e.g. the conversation bubble's manual /
    /// auto download) piggyback on a fetch already started by another path
    /// (prefetch, another surface) instead of issuing a duplicate request.
    public func inFlightDownload(for key: String) -> Task<Data, Error>? {
        inFlightTasks[Self.fileKey(for: key)]?.task
    }

    /// Registers an externally-driven download so `data(for:)` / `image(for:)`
    /// callers await it rather than re-fetching the same media. The registered
    /// task MUST persist its payload into this store (via `store(_:for:)`)
    /// before returning. The entry self-clears when the task finishes.
    /// Returns `false` (no-op) when a download for `key` is already tracked —
    /// the caller should then await `inFlightDownload(for:)` instead.
    @discardableResult
    public func registerInFlightDownload(_ task: Task<Data, Error>, for key: String) -> Bool {
        let fileKey = Self.fileKey(for: key)
        guard inFlightTasks[fileKey] == nil else { return false }
        let entry = InFlightDownload(task: task)
        inFlightTasks[fileKey] = entry
        Task {
            _ = try? await task.value
            if inFlightTasks[fileKey]?.id == entry.id { inFlightTasks[fileKey] = nil }
        }
        return true
    }

    public func localFileURLOrThrow(for urlString: String) async throws -> URL {
        guard let url = localFileURL(for: urlString) else {
            throw DiskCacheError.notCached(urlString)
        }
        return url
    }

    public func store(_ data: Data, for key: String) async {
        await save(data, for: key)
    }

    public func remove(for key: String) async {
        await invalidate(for: key)
    }

    public func clearAll() async {
        await invalidateAll()
    }

    public enum DiskCacheError: Error, LocalizedError {
        case notCached(String)

        public var errorDescription: String? {
            switch self {
            case .notCached(let key): return "No cached data for key: \(key)"
            }
        }
    }

    // MARK: - Eviction

    /// E1 — current on-disk byte total, scanned via the file manager.
    /// Exposed `public` for tests and for diagnostics surfaces (a future
    /// "Cache size: X MB" row in Settings). Synchronous filesystem walk
    /// inside the actor, so a no-op when called from outside the actor
    /// context.
    public func estimatedDiskBytes() async -> Int {
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        var total = 0
        while let fileURL = enumerator.nextObject() as? URL {
            if let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize {
                total += size
            }
        }
        return total
    }

    public func evictExpired() async {
        guard let enumerator = fileManager.enumerator(at: baseDirectory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return }
        let now = Date()
        purgeExpiredPins(now: now)
        var evictedCount = 0
        while let fileURL = enumerator.nextObject() as? URL {
            guard let values = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]),
                  let modDate = values.contentModificationDate else { continue }
            let age = now.timeIntervalSince(modDate)
            if policy.freshness(age: age) == .expired {
                let fileName = fileURL.lastPathComponent
                if isPinActive(fileKey: fileName, now: now) { continue }
                memoryCache.removeObject(forKey: fileName as NSString)
                fileTimestamps.removeValue(forKey: fileName)
                try? fileManager.removeItem(at: fileURL)
                evictedCount += 1
            }
        }
        if evictedCount > 0 { logger.debug("Evicted \(evictedCount) expired files") }
    }

    public func evictOverBudget() async {
        let maxBytes: Int
        if case .disk(_, let max) = policy.storageLocation {
            maxBytes = max
        } else { return }
        guard let enumerator = fileManager.enumerator(at: baseDirectory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return }
        let now = Date()
        purgeExpiredPins(now: now)
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
            let fileName = file.url.lastPathComponent
            // Un pin actif exempte le fichier du LRU. Borné dans le temps par
            // construction (`until` obligatoire) : si tout est pinné, la passe
            // ne libère rien MAINTENANT mais se résorbe à l'échéance des pins.
            if isPinActive(fileKey: fileName, now: now) { continue }
            memoryCache.removeObject(forKey: fileName as NSString)
            fileTimestamps.removeValue(forKey: fileName)
            try? fileManager.removeItem(at: file.url)
            totalSize -= file.size
        }
        logger.debug("Budget eviction: trimmed to \(totalSize) bytes (max \(maxBytes))")
    }

    // MARK: - Pinning (eviction exemption — R5 offline replay)

    /// Marks `key` as non-evictable until `until`. Building block only: the
    /// store never decides WHAT deserves a pin — the app-side policy does
    /// (e.g. "media of a viewed story until the story expires"). Pinning a
    /// key whose download has not landed yet is valid: the exemption applies
    /// as soon as the file exists.
    public func pin(_ key: String, until: Date) {
        loadPinsIfNeeded()
        pinExpiries[Self.fileKey(for: key)] = until
        persistPins()
    }

    public func unpin(_ key: String) {
        loadPinsIfNeeded()
        guard pinExpiries.removeValue(forKey: Self.fileKey(for: key)) != nil else { return }
        persistPins()
    }

    /// `true` while `key` holds a pin whose expiry is in the future.
    public func isPinned(_ key: String) -> Bool {
        loadPinsIfNeeded()
        return isPinActive(fileKey: Self.fileKey(for: key), now: Date())
    }

    private func isPinActive(fileKey: String, now: Date) -> Bool {
        loadPinsIfNeeded()
        guard let until = pinExpiries[fileKey] else { return false }
        return until > now
    }

    /// Drops pins past their expiry so the registry (and sidecar) cannot grow
    /// unbounded. Called by both eviction sweeps.
    private func purgeExpiredPins(now: Date) {
        loadPinsIfNeeded()
        let before = pinExpiries.count
        pinExpiries = pinExpiries.filter { $0.value > now }
        if pinExpiries.count != before { persistPins() }
    }

    private var pinsSidecarURL: URL {
        baseDirectory.appendingPathComponent(".pins.json")
    }

    private func loadPinsIfNeeded() {
        guard !pinsLoaded else { return }
        pinsLoaded = true
        guard fileManager.fileExists(atPath: pinsSidecarURL.path) else { return }
        do {
            let data = try Data(contentsOf: pinsSidecarURL)
            pinExpiries = try JSONDecoder().decode([String: Date].self, from: data)
        } catch {
            logger.error("Pin sidecar unreadable, starting empty: \(error.localizedDescription)")
        }
    }

    private func persistPins() {
        do {
            let data = try JSONEncoder().encode(pinExpiries)
            try data.write(to: pinsSidecarURL, options: .atomic)
        } catch {
            logger.error("Pin sidecar write failed: \(error.localizedDescription)")
        }
    }

    // MARK: - UIImage Cache

    nonisolated(unsafe) private static let _imageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 150
        cache.totalCostLimit = 80 * 1024 * 1024
        return cache
    }()

    @MainActor
    public static func clearImageCache() {
        _imageCache.removeAllObjects()
    }

    nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
        let key = fileKey(for: urlString) as NSString
        return _imageCache.object(forKey: key)
    }

    /// Cold-start synchronous warm : retourne l'image immediatement si elle
    /// est en NSCache, sinon va lire le fichier du disque (sans IO reseau),
    /// decode l'UIImage de maniere paresseuse via `contentsOfFile:`, store
    /// le resultat dans la NSCache et le retourne.
    ///
    /// Conçu pour `CachedAsyncImage.init` à l'ouverture froide d'une
    /// conversation : la NSCache est vide apres une liberation d'app, donc
    /// `cachedImage(for:)` retourne nil meme si l'image est presente sur
    /// disque. Sans `warmedImage`, la cellule rend d'abord son thumbHash
    /// puis bascule sur l'image apres un `task { await ... }` async — d'ou
    /// le flash "magenta/thumbhash → image" visible a chaque cold start.
    ///
    /// `UIImage(contentsOfFile:)` ne decompresse pas immediatement les
    /// pixels (lazy decode au premier draw), donc le cout en init reste
    /// minime. C'est le redraw initial qui paie le decodage — exactement
    /// ce qu'on veut : un cycle de render, l'image visible directement,
    /// pas de transition de placeholder.
    nonisolated public func warmedImage(for urlString: String) -> UIImage? {
        if let cached = Self.cachedImage(for: urlString) { return cached }
        guard let fileURL = cachedFileURL(for: urlString),
              let image = UIImage(contentsOfFile: fileURL.path) else {
            return nil
        }
        let key = Self.fileKey(for: urlString) as NSString
        Self._imageCache.setObject(image, forKey: key)
        return image
    }

    /// Hard cap for the decoded bitmap we will keep resident in the NSCache
    /// (in bytes). A malicious or accidentally-huge image (e.g. 20K×20K JPEG
    /// that decodes to >1 GB of pixel data) would otherwise blow the NSCache
    /// budget and trigger a memory warning, evicting everything else. We
    /// decode to check dimensions, then refuse to cache anything above the
    /// threshold — the `UIImage` still returns so the caller can display it
    /// once, but we won't hold onto it.
    private static let maxCacheableDecodedBytes: Int = 50 * 1024 * 1024 // 50 MB

    private static func downsampledImage(data: Data, maxPixelSize: CGFloat = 1200) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceShouldCache: false,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else { return UIImage(data: data) }
        return UIImage(cgImage: cgImage)
    }

    public func image(for urlString: String) async -> UIImage? {
        await image(for: urlString, maxPixelSize: 1200)
    }

    public func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? {
        let fileKey = Self.fileKey(for: urlString)

        if let cached = Self._imageCache.object(forKey: fileKey as NSString) {
            return cached
        }

        let result = await load(for: urlString)
        if let data = result.snapshot()?.first, let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) {
            Self.cacheIfWithinBudget(image, key: fileKey)
            return image
        }

        guard let url = URL(string: urlString) else { return nil }

        // Local file:// URLs — load directly from filesystem
        if url.scheme == "file" {
            if let data = try? Data(contentsOf: url), let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) {
                Self.cacheIfWithinBudget(image, key: fileKey)
                return image
            }
            return nil
        }

        guard url.scheme == "https" || url.scheme == "http" else { return nil }
        do {
            // Shared network funnel — coalesces with any in-flight fetch for
            // the same key (prefetcher, CachedAsyncImage, another cell) and
            // persists to disk inside the task.
            let data = try await networkData(for: urlString, url: url)
            guard let image = Self.downsampledImage(data: data, maxPixelSize: maxPixelSize) else { return nil }
            Self.cacheIfWithinBudget(image, key: fileKey)
            return image
        } catch {
            return nil
        }
    }

    /// Centralised NSCache insertion with a size guard so a single oversized
    /// image never evicts the rest of the in-memory cache. We compute the
    /// decoded cost once and skip caching when it blows past
    /// `maxCacheableDecodedBytes` — the caller still gets the `UIImage`, it
    /// just won't be kept around for the next scroll.
    private nonisolated static func cacheIfWithinBudget(_ image: UIImage, key: String) {
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        guard cost > 0, cost <= maxCacheableDecodedBytes else { return }
        // Insert synchronously. `NSCache` mutations are thread-safe, so the
        // previous `Task { @MainActor … }` deferral bought nothing and created a
        // race: the image wasn't resident yet when `image(for:)` returned, so a
        // synchronous `cachedImage(for:)` immediately after still missed (and
        // the UI showed a thumbHash flash for one extra frame). Matches the
        // direct insertion already used by `warmedImage(for:)`.
        Self._imageCache.setObject(image, forKey: key as NSString, cost: cost)
    }

    /// Configure the in-memory UIImage cache limits at app startup.
    /// Call once from `ImageDownsamplingConfig.applyGlobal()` before any image
    /// is loaded. Thread-safe: `NSCache` property writes are atomic.
    ///
    /// - Parameter memoryCostLimitBytes: Maximum total decoded-pixel cost kept
    ///   resident. Default at init-time is 80 MB; recommended app-level value
    ///   is 60 MB to leave headroom for UIKit/Metal allocations.
    public nonisolated static func configureImageCache(memoryCostLimitBytes: Int) {
        _imageCache.totalCostLimit = memoryCostLimitBytes
    }

    /// Pre-cache an image in the static UIImage NSCache for immediate display
    /// in ProgressiveCachedImage. Used for optimistic media messages where the
    /// local file URL is set as the attachment URL before upload.
    ///
    /// Inserts synchronously via `cacheIfWithinBudget` — matches the fix
    /// already applied to `image(for:)`/`warmedImage(for:)`: a
    /// `Task { @MainActor in … }` deferral here bought nothing (`NSCache` is
    /// thread-safe) and raced the very next synchronous `cachedImage(for:)`
    /// read on the optimistic-send path, plus skipped the oversized-bitmap
    /// budget guard entirely.
    public nonisolated static func cacheImageForPreview(_ image: UIImage, key: String) {
        Self.cacheIfWithinBudget(image, key: Self.fileKey(for: key))
    }

    // MARK: - File Key

    /// Memoises `urlString → fileKey`. `fileKey` runs a SHA-256 hash plus a URL
    /// parse on every call; during a scroll it is hit thousands of times for the
    /// same handful of avatar/media URLs (each visible cell re-resolves its
    /// warmed image on the main thread — device trace 2026-06-10 showed it as a
    /// notable main-thread cost). The map turns the repeat hashes into a lookup.
    /// `NSCache` is internally thread-safe, so the `nonisolated(unsafe)` static
    /// is sound from the `nonisolated` callers.
    nonisolated(unsafe) private static let fileKeyCache: NSCache<NSString, NSString> = {
        let cache = NSCache<NSString, NSString>()
        cache.countLimit = 4000
        return cache
    }()

    nonisolated static func fileKey(for urlString: String) -> String {
        let cacheKey = urlString as NSString
        if let cached = fileKeyCache.object(forKey: cacheKey) {
            return cached as String
        }
        let digest = SHA256.hash(data: Data(urlString.utf8))
        let hex = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        let ext = URL(string: urlString)?.pathExtension ?? ""
        let key = ext.isEmpty ? hex : "\(hex).\(ext)"
        fileKeyCache.setObject(key as NSString, forKey: cacheKey)
        return key
    }

    private func diskFilePath(for fileKey: String) -> URL {
        baseDirectory.appendingPathComponent(fileKey)
    }
}
