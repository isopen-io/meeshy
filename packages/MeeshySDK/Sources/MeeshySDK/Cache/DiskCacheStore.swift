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

    /// Budget mémoire du L1 (Data brut par entrée). 80 MB par défaut — les
    /// stores audio/vidéo reçoivent un budget réduit du CacheCoordinator :
    /// leur consommation passe par des file URLs (players), pas par des Data
    /// résidents, et 4 × 80 MB de plafonds théoriques dépassaient à eux seuls
    /// la cible mémoire de l'app (150 MB).
    private let memoryBudgetBytes: Int

    /// Insertion L1 gardée : un payload unique dépassant la moitié du budget
    /// (ex. une vidéo de 40 MB dans un store à 8 MB) éjecterait tout le reste
    /// pour un blob que personne ne relit en Data — il reste servi par le
    /// disque.
    private func cacheInMemory(_ data: Data, fileKey: String) {
        guard data.count <= memoryBudgetBytes / 2 else { return }
        memoryCache.setObject(CacheBox(data), forKey: fileKey as NSString, cost: data.count)
    }

    public init(policy: CachePolicy, baseDirectory: URL? = nil, memoryBudgetBytes: Int = 80 * 1024 * 1024) {
        self.policy = policy
        self.memoryBudgetBytes = memoryBudgetBytes
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
        cache.totalCostLimit = memoryBudgetBytes
        self.memoryCache = cache
        FileManager.default.createDirectoryLogging(at: self.baseDirectory, context: "disk cache root", logger: logger)

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
        guard fileManager.fileExists(atPath: filePath.path) else { return .empty }
        let data: Data
        do {
            data = try Data(contentsOf: filePath)
        } catch {
            // Le fichier EXISTE mais est illisible : corruption ou I/O — c'est
            // un vrai incident, pas un cache miss.
            logger.error("Cached file present but unreadable for \(fileKey, privacy: .public), treated as a miss: \(error.localizedDescription, privacy: .public)")
            return .empty
        }
        // Un attribut illisible ferait passer l'entrée pour « écrite à
        // l'instant » : elle serait considérée fraîche à tort.
        let modDate: Date
        do {
            modDate = try (fileManager.attributesOfItem(atPath: filePath.path)[.modificationDate] as? Date) ?? Date()
        } catch {
            logger.error("Cache mtime unreadable for \(fileKey, privacy: .public), entry treated as fresh: \(error.localizedDescription, privacy: .public)")
            modDate = Date()
        }
        let age = Date().timeIntervalSince(modDate)
        let freshness = policy.freshness(age: age)
        switch freshness {
        case .fresh:
            cacheInMemory(data, fileKey: fileKey)
            fileTimestamps[fileKey] = modDate
            noteAccess(fileKey: fileKey, atPath: filePath.path, lastKnown: modDate)
            return .fresh([data], age: age)
        case .stale:
            cacheInMemory(data, fileKey: fileKey)
            fileTimestamps[fileKey] = modDate
            noteAccess(fileKey: fileKey, atPath: filePath.path, lastKnown: modDate)
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
        fileManager.removeItemLogging(at: filePath, context: "cache invalidate", logger: logger)
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
        fileManager.removeItemLogging(at: baseDirectory, context: "cache invalidateAll", logger: logger)
        fileManager.createDirectoryLogging(at: baseDirectory, context: "disk cache root (recreate)", logger: logger)
    }

    // MARK: - Write

    public func save(_ data: Data, for key: String) async {
        let fileKey = Self.fileKey(for: key)
        let filePath = diskFilePath(for: fileKey)
        do {
            try data.write(to: filePath, options: .atomic)
            touchModificationDate(atPath: filePath.path)
        } catch {
            logger.error("Failed to write file for key \(fileKey): \(error.localizedDescription)")
            return
        }
        cacheInMemory(data, fileKey: fileKey)
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
        touchModificationDate(atPath: destination.path)
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
                fileManager.removeItemLogging(at: localURL, context: "adopt source cleanup", logger: logger)
            } catch {
                logger.error("adopt failed for key \(key): \(error.localizedDescription)")
                return
            }
        }
        touchModificationDate(atPath: destination.path)
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

    /// Granularité de la date d'accès : au plus une écriture d'attribut par
    /// fichier et par jour. Une précision plus fine coûterait un `utimes` à
    /// chaque apparition de cellule pendant un défilement, pour un gain nul —
    /// l'éviction raisonne en semaines.
    static let accessTouchGranularity: TimeInterval = .days(1)

    /// Marque un ACCÈS en rafraîchissant la date de modification du fichier.
    ///
    /// Les deux passes d'éviction (`evictExpired`, `evictOverBudget`) trient sur
    /// `contentModificationDate`. Sans ce rafraîchissement, cette date reste
    /// celle du TÉLÉCHARGEMENT : un média rouvert chaque semaine se faisait
    /// évincer avant un média téléchargé la veille et jamais rouvert — l'inverse
    /// exact d'un LRU, et la façon la plus sûre de re-télécharger précisément ce
    /// qui sert le plus.
    ///
    /// Effet de bord ASSUMÉ : le TTL devient « temps depuis le dernier accès »
    /// et non « depuis le téléchargement ». C'est la bonne sémantique ici — ce
    /// store ne contient que des médias immuables à URL stable (images, audio,
    /// vidéo, vignettes), pour lesquels une entrée encore utilisée n'a aucune
    /// raison de périmer.
    private func noteAccess(fileKey: String, atPath path: String, lastKnown: Date) {
        guard Date().timeIntervalSince(lastKnown) >= Self.accessTouchGranularity else { return }
        touchModificationDate(atPath: path)
        fileTimestamps[fileKey] = Date()
    }

    /// Synchronous local file URL check — no actor hop needed.
    /// Returns the file URL if it exists on disk, nil otherwise.
    nonisolated public func cachedFileURL(for key: String) -> URL? {
        let fileKey = Self.fileKey(for: key)
        let filePath = baseDirectory.appendingPathComponent(fileKey)
        // `attributesOfItem` lève si le fichier n'existe pas : un seul `stat`
        // là où `fileExists` + lecture de la date en auraient fait deux.
        guard let modDate = (try? FileManager.default.attributesOfItem(atPath: filePath.path))?[.modificationDate] as? Date else {
            return FileManager.default.fileExists(atPath: filePath.path) ? filePath : nil
        }
        // Servir depuis le disque EST un accès. C'est même le chemin DOMINANT
        // pour l'audio et la vidéo (lecture directe du fichier, sans passer par
        // `load`) : l'oublier ici laisserait tout le média joué hors ligne
        // vieillir comme s'il n'avait jamais été rouvert.
        if Date().timeIntervalSince(modDate) >= Self.accessTouchGranularity {
            let path = filePath.path
            // On repasse la date LUE SUR LE FICHIER, jamais `fileTimestamps` :
            // c'est l'attribut du fichier que les deux passes d'éviction
            // trient. Décider sur le miroir mémoire ferait sauter la mise à
            // jour dès que les deux divergent, et c'est précisément alors que
            // l'éviction se tromperait de victime.
            Task.detached(priority: .utility) { [weak self] in
                await self?.noteAccess(fileKey: fileKey, atPath: path, lastKnown: modDate)
            }
        }
        return filePath
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
            // Média protégé même-origine (ex. audio de la bibliothèque de sons
            // servi par `/api/v1/static/:filename`, route JWT) : la requête nue
            // recevait 401 et la story jouait MUETTE, gelée sur le spinner de
            // stall (bug prod 2026-08-02, post 6a6ef0b44415c63ff8da7855).
            let request = Self.networkRequest(
                for: url,
                apiOrigin: MeeshyConfig.shared.serverOrigin,
                authToken: APIClient.shared.authToken,
                sessionToken: APIClient.shared.anonymousSessionToken
            )
            let (data, response) = try await URLSession.shared.data(for: request)
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

    /// Construit la requête du funnel réseau. Un média hébergé sur l'ORIGINE
    /// de l'API Meeshy (même scheme + host + port que `apiOrigin`) reçoit les
    /// en-têtes d'auth — `Authorization: Bearer` (prioritaire) ou
    /// `X-Session-Token` (session anonyme), même convention qu'`APIClient` —
    /// car certaines routes média sont protégées (`/api/v1/static/:filename`,
    /// audio de la bibliothèque de sons). Toute autre origine (CDN, hôte
    /// tiers) reste une requête NUE : un token ne doit jamais fuiter hors de
    /// l'API. Pure et nonisolated pour être testable sans réseau.
    nonisolated static func networkRequest(
        for url: URL,
        apiOrigin: String?,
        authToken: String?,
        sessionToken: String?
    ) -> URLRequest {
        var request = URLRequest(url: url)
        guard let apiOrigin,
              let origin = URL(string: apiOrigin),
              let originScheme = origin.scheme?.lowercased(),
              let originHost = origin.host?.lowercased(),
              let urlScheme = url.scheme?.lowercased(),
              let urlHost = url.host?.lowercased(),
              urlScheme == originScheme,
              urlHost == originHost,
              normalizedPort(url.port, scheme: urlScheme) == normalizedPort(origin.port, scheme: originScheme)
        else { return request }
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        } else if let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "X-Session-Token")
        }
        return request
    }

    /// `https://host` et `https://host:443` sont la même origine — replie le
    /// port implicite du scheme pour la comparaison.
    private nonisolated static func normalizedPort(_ port: Int?, scheme: String) -> Int? {
        if let port { return port }
        switch scheme {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
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
            // On n'attend ici que la FIN du téléchargement pour libérer le
            // slot ; le résultat (et son erreur) appartient à l'appelant qui
            // a créé la tâche.
            _ = await task.result
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
                fileManager.removeItemLogging(at: fileURL, context: "cache TTL eviction", logger: logger)
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
            fileManager.removeItemLogging(at: file.url, context: "cache budget eviction", logger: logger)
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
        // #3897 — `cacheIfWithinBudget`, pas une insertion `setObject`
        // sans coût : celle-ci comptait comme `cost: 0` auprès de
        // `_imageCache.totalCostLimit`, invisible à la comptabilité
        // d'éviction. Sans conséquence tant que cette voie ne servait que de
        // petites images ; le poster net (#3871) y fait désormais transiter
        // des bitmaps ~8 Mo (feature « plein écran net ») via
        // `CacheCoordinator.warmedImage`. Un poster oversize (> 50 Mo décodés)
        // est encore RENDU (retourné à l'appelant pour un affichage ponctuel)
        // mais plus jamais retenu — comportement déjà celui de tous les
        // autres chemins d'insertion (`cacheImageForPreview`, `image(for:
        // maxPixelSize:)`), dont le doc-comment de `cacheIfWithinBudget`
        // affirmait à tort que `warmedImage` le partageait déjà.
        Self.cacheIfWithinBudget(image, key: Self.fileKey(for: urlString))
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
        await image(for: urlString, maxPixelSize: Self.fullFormatPixelCap)
    }

    // MARK: - Sized decode buckets

    /// The canonical full-format decode cap. Requests at or above this share
    /// the bare (unsuffixed) NSCache slot — the one `cachedImage(for:)` and
    /// `warmedImage(for:)` have always used.
    public static let fullFormatPixelCap: CGFloat = 1200

    /// Quantized decode ceilings for below-full-format requests. Decoding at
    /// the bucket ceiling (never the exact requested size) bounds the number
    /// of resident variants per URL while never serving an under-resolved
    /// bitmap: the bucket is always >= the request.
    private static let pixelSizeBuckets: [CGFloat] = [128, 256, 512, 768, 1024]

    /// Bucket ceiling for a requested pixel size — `nil` when the request
    /// belongs to the canonical full-format slot.
    private static func pixelBucket(for maxPixelSize: CGFloat) -> CGFloat? {
        pixelSizeBuckets.first { $0 >= maxPixelSize }
    }

    /// NSCache key of a decoded variant. Sized variants are suffixed so a
    /// 128 px avatar decode can never occupy — nor be served from — the slot
    /// a full-screen surface reads. The bare key remains reserved for the
    /// full-format decode.
    private static func imageCacheKey(fileKey: String, bucket: CGFloat?) -> NSString {
        guard let bucket else { return fileKey as NSString }
        return "\(fileKey)#px\(Int(bucket))" as NSString
    }

    /// Sized-slot probe mirroring `cachedImage(for:)` — same bucketing as
    /// `image(for:maxPixelSize:)`, so a view that loads with a `targetSize`
    /// can find its own variant synchronously at init.
    nonisolated public static func cachedImage(for urlString: String, maxPixelSize: CGFloat) -> UIImage? {
        let key = imageCacheKey(fileKey: fileKey(for: urlString), bucket: pixelBucket(for: maxPixelSize))
        return _imageCache.object(forKey: key)
    }

    /// « Une variante décodée, n'importe laquelle, est-elle résidente ? » —
    /// probe de résidence (badge de téléchargement, gates) qui ne doit pas
    /// dépendre du bucket sous lequel la surface d'affichage a décodé.
    nonisolated public static func hasAnyCachedImageVariant(for urlString: String) -> Bool {
        let fileKey = fileKey(for: urlString)
        if _imageCache.object(forKey: fileKey as NSString) != nil { return true }
        return pixelSizeBuckets.contains { bucket in
            _imageCache.object(forKey: imageCacheKey(fileKey: fileKey, bucket: bucket)) != nil
        }
    }

    public func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? {
        let fileKey = Self.fileKey(for: urlString)
        let bucket = Self.pixelBucket(for: maxPixelSize)
        let cacheKey = Self.imageCacheKey(fileKey: fileKey, bucket: bucket)
        // Hors bucket (> 1024) : décoder à la taille DEMANDÉE, comme avant —
        // une bannière iPad full-bleed peut requérir 2048 px ; la rabattre au
        // cap 1200 la rendrait visiblement plus douce qu'avant ce changement.
        let decodePixelSize = bucket ?? maxPixelSize

        if let cached = Self._imageCache.object(forKey: cacheKey) {
            return cached
        }

        let result = await load(for: urlString)
        if let data = result.snapshot()?.first, let image = Self.downsampledImage(data: data, maxPixelSize: decodePixelSize) {
            Self.cacheIfWithinBudget(image, key: cacheKey as String)
            return image
        }

        guard let url = URL(string: urlString) else { return nil }

        // Local file:// URLs — load directly from filesystem
        if url.scheme == "file" {
            do {
                let data = try Data(contentsOf: url)
                if let image = Self.downsampledImage(data: data, maxPixelSize: decodePixelSize) {
                    Self.cacheIfWithinBudget(image, key: cacheKey as String)
                    return image
                }
            } catch {
                Logger.cache.error("Local file:// image unreadable, no thumbnail rendered: \(error.localizedDescription, privacy: .public)")
            }
            return nil
        }

        guard url.scheme == "https" || url.scheme == "http" else { return nil }
        do {
            // Shared network funnel — coalesces with any in-flight fetch for
            // the same key (prefetcher, CachedAsyncImage, another cell) and
            // persists to disk inside the task.
            let data = try await networkData(for: urlString, url: url)
            guard let image = Self.downsampledImage(data: data, maxPixelSize: decodePixelSize) else { return nil }
            Self.cacheIfWithinBudget(image, key: cacheKey as String)
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

    /// Refreshes the mtime used as the LRU key. A failure does not lose data
    /// but skews eviction order — the entry looks older than it is and gets
    /// evicted early, so it is worth a trace.
    private func touchModificationDate(atPath path: String) {
        do {
            try fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: path)
        } catch {
            logger.error("LRU touch failed, eviction order skewed for this entry: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func diskFilePath(for fileKey: String) -> URL {
        baseDirectory.appendingPathComponent(fileKey)
    }

    // MARK: - Purge sélective (mesure et destruction ciblées)
    //
    // Ajouts pour la purge par type × domaine des Réglages. Le store est
    // indexé par `SHA256(url)` et ne connaît aucun domaine métier : c'est
    // l'appelant qui fournit la liste d'URLs qu'il a su attribuer (cf.
    // `CacheMediaAttribution`). Ces primitives ne font donc que deux choses —
    // MESURER ce que pèsent des clés données, et les DÉTRUIRE.

    /// Octets réellement occupés sur disque par `urlStrings`.
    ///
    /// Mesuré fichier par fichier, jamais estimé : une URL dont le fichier
    /// n'est pas (ou plus) en cache compte pour zéro. C'est ce qui permet à
    /// l'UI d'annoncer une taille exacte avant purge plutôt qu'un ordre de
    /// grandeur.
    public func diskBytes(forURLs urlStrings: Set<String>) async -> Int {
        var total = 0
        for urlString in urlStrings {
            let path = diskFilePath(for: Self.fileKey(for: urlString)).path
            guard let size = (try? fileManager.attributesOfItem(atPath: path))?[.size] as? Int else { continue }
            total += size
        }
        return total
    }

    /// Octets occupés par les fichiers que `urlStrings` ne couvre PAS.
    ///
    /// C'est le résidu « non attribué » : des médias bien présents sur disque
    /// dont l'entité porteuse (post, story, message) a quitté le cache GRDB.
    /// Plus personne ne peut les rattacher à un domaine, mais ils occupent une
    /// place réelle — les taire donnerait une somme des cases inférieure à la
    /// taille du cache, ce que l'utilisateur constaterait immédiatement.
    ///
    /// Le sidecar `.pins.json` est exclu du décompte via `.skipsHiddenFiles`,
    /// comme dans `estimatedDiskBytes()`.
    public func unattributedDiskBytes(excluding urlStrings: Set<String>) async -> Int {
        let known = Set(urlStrings.map { Self.fileKey(for: $0) })
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        var total = 0
        while let fileURL = enumerator.nextObject() as? URL {
            guard !known.contains(fileURL.lastPathComponent) else { continue }
            if let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize {
                total += size
            }
        }
        return total
    }

    /// Détruit les entrées de `urlStrings`, en ANNULANT d'abord tout
    /// téléchargement en vol pour ces clés.
    ///
    /// Sans cette annulation, une purge lancée pendant qu'un média se
    /// télécharge est silencieusement défaite : la tâche réseau se termine
    /// après la suppression et son `save()` réécrit le fichier. L'utilisateur
    /// voit alors le cache regrossir tout seul juste après avoir vidé une
    /// case — le pire des symptômes, parce qu'il ressemble à un bug de mesure
    /// et non à une purge incomplète.
    ///
    /// L'annulation est coopérative : `URLSession.data(from:)` honore
    /// l'annulation de la `Task`, et le `save()` qui suit ne s'exécute pas.
    /// On retire l'entrée du registre AVANT d'annuler pour qu'un appelant
    /// concurrent ne récupère pas une tâche déjà condamnée.
    @discardableResult
    public func purge(urls urlStrings: Set<String>) async -> Int {
        var freed = 0
        for urlString in urlStrings {
            let fileKey = Self.fileKey(for: urlString)
            if let inFlight = inFlightTasks.removeValue(forKey: fileKey) {
                inFlight.task.cancel()
            }
            let filePath = diskFilePath(for: fileKey)
            if let size = (try? fileManager.attributesOfItem(atPath: filePath.path))?[.size] as? Int {
                freed += size
            }
            memoryCache.removeObject(forKey: fileKey as NSString)
            fileTimestamps.removeValue(forKey: fileKey)
            fileManager.removeItemLogging(at: filePath, context: "purge sélective", logger: logger)
            // Même raison que dans `invalidate(for:)` : un pin conservé
            // re-protégerait le futur re-téléchargement de la même clé.
            loadPinsIfNeeded()
            if pinExpiries.removeValue(forKey: fileKey) != nil { persistPins() }
        }
        return freed
    }

    /// Détruit tout ce que `urlStrings` ne couvre PAS (le résidu non attribué).
    @discardableResult
    public func purgeUnattributed(excluding urlStrings: Set<String>) async -> Int {
        let known = Set(urlStrings.map { Self.fileKey(for: $0) })
        guard let enumerator = fileManager.enumerator(
            at: baseDirectory,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        var victims: [(url: URL, size: Int)] = []
        while let fileURL = enumerator.nextObject() as? URL {
            guard !known.contains(fileURL.lastPathComponent) else { continue }
            let size = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            victims.append((fileURL, size))
        }
        var freed = 0
        for victim in victims {
            let fileKey = victim.url.lastPathComponent
            if let inFlight = inFlightTasks.removeValue(forKey: fileKey) {
                inFlight.task.cancel()
            }
            memoryCache.removeObject(forKey: fileKey as NSString)
            fileTimestamps.removeValue(forKey: fileKey)
            fileManager.removeItemLogging(at: victim.url, context: "purge résidu non attribué", logger: logger)
            freed += victim.size
        }
        return freed
    }

    /// `true` si un téléchargement est en vol pour cette URL. Exposé pour les
    /// tests de la purge concurrente.
    public func hasInFlightDownload(forURL urlString: String) -> Bool {
        inFlightTasks[Self.fileKey(for: urlString)] != nil
    }
}
