import Foundation
import Combine
import MeeshySDK
import os

/// In-memory + disk cache of `LinkMetadata` keyed by canonical URL.
/// Lives in the app target (not the SDK) because it binds `LinkPreviewFetcher`
/// to the persistence layer with a concrete TTL strategy — the SDK stays
/// dependency-minimal and the app decides retention.
///
/// Entries older than `maxAge` are evicted at load time so the cache never
/// serves metadata that predates a site redesign by more than a week.
@MainActor
final class LinkPreviewStore: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = LinkPreviewStore()

    private let fetcher: LinkPreviewFetcher = .shared
    private let maxAge: TimeInterval = 7 * 24 * 3600
    /// Negative cache: URLs we've tried and failed (404 / non-HTML / empty OG)
    /// are remembered briefly so we don't hammer the same host over and over.
    private let negativeCacheDuration: TimeInterval = 30 * 60

    @Published private(set) var cache: [String: LinkMetadata] = [:]
    private var negativeCache: [String: Date] = [:]
    private var pendingKeys: Set<String> = []
    private var cancellables = Set<AnyCancellable>()

    private let encoder: JSONEncoder = {
        let e = MeeshyCoders.encoder(.persistence)
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = MeeshyCoders.decoder(.persistence)
        return d
    }()

    init() {
        Self.removeLegacyBackedUpCache(inDocuments: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0])
        self.cache = Self.loadFromDisk(decoder: decoder, maxAge: maxAge)
        wireAuthLogoutHook()
    }

    // MARK: - Session quiesce (P1, Q2 — logout)

    /// Q2 — privacy : un link preview révèle les sites partagés (potentiellement
    /// des URLs privées Notion / Google Doc / Slack). Au logout, purge le cache
    /// disque pour qu'un user B sur le même device ne puisse pas lire les
    /// previews du user A via dump / forensic. Pattern calqué sur
    /// `ConversationAudioCoordinator.wireAuthLogoutHook`.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clearAll() }
            .store(in: &cancellables)
    }

    func metadata(for urlString: String) -> LinkMetadata? {
        cache[urlString]
    }

    /// Awaitable resolution driving `LinkPreviewCard`'s LOCAL `@State` so the
    /// card does NOT observe the global `@Published cache` — otherwise EVERY
    /// link card in the conversation re-evaluates its body each time ANY URL's
    /// metadata lands (the "recompute every time" the user reported; the
    /// network fetch itself is already cached + deduped here). Returns the
    /// cached metadata immediately, a known-failed `nil` without re-hitting the
    /// network (30-min negative window), else fetches ONCE (the SDK fetcher
    /// dedupes concurrent in-flight requests for the same URL) and records the
    /// success on disk or the failure in the negative cache.
    func resolvedMetadata(for urlString: String) async -> LinkMetadata? {
        if let cached = cache[urlString] { return cached }
        if let failedAt = negativeCache[urlString],
           Date().timeIntervalSince(failedAt) < negativeCacheDuration {
            return nil
        }
        let metadata = await fetcher.metadata(for: urlString)
        if let metadata {
            cache = Self.bounded(cache.merging([urlString: metadata]) { _, new in new }, limit: Self.maxEntries)
            persist()
        } else {
            let now = Date()
            // Les échecs expirés partent à chaque nouvel échec : sans ce ménage, l'ensemble ne faisait que grossir.
            negativeCache = negativeCache.filter { now.timeIntervalSince($0.value) < negativeCacheDuration }
            negativeCache[urlString] = now
        }
        return metadata
    }

    /// Plafond des aperçus gardés : chaque lien distinct s'ajoutait, et chaque ajout ré-encodait tout le fichier.
    static let maxEntries = 500

    /// Les `limit` aperçus les plus récents (`fetchedAt`).
    nonisolated static func bounded(_ entries: [String: LinkMetadata], limit: Int) -> [String: LinkMetadata] {
        guard entries.count > limit else { return entries }
        let kept = entries.sorted { $0.value.fetchedAt > $1.value.fetchedAt }.prefix(limit)
        return Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) })
    }

    func clearAll() {
        cache.removeAll()
        negativeCache.removeAll()
        pendingKeys.removeAll()
        FileManager.default.removeItemLogging(at: Self.cacheFileURL(), context: "link preview cache reset", logger: Logger.linkPreview)
    }

    // MARK: - Persistence

    private func persist() {
        let snapshot = cache
        let encoder = self.encoder
        Task.detached(priority: .utility) {
            guard let data = encoder.encodeOrLog(snapshot, field: "link previews", logger: Logger.linkPreview) else { return }
            do {
                let file = Self.cacheFileURL()
                try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: file, options: .atomic)
            } catch {
                Logger.linkPreview.error("Link preview cache not written, previews will be refetched: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Le cache vit dans `Library/Caches` : un cache, purgeable par le système,
    /// jamais sauvegardé. Il a vécu dans `Documents/meeshy_cache/`, que iCloud et
    /// Finder SAUVEGARDENT : l'adresse d'une page lue dans une conversation —
    /// chiffrée comprise —, son titre et sa description partaient dans la
    /// sauvegarde, hors de l'appareil (#12768).
    nonisolated static let fileName = "link_preview_cache.json"

    nonisolated static func cacheFileURL(fileManager: FileManager = .default) -> URL {
        fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("link_previews", isDirectory: true)
            .appendingPathComponent(fileName)
    }

    /// La copie que les versions précédentes laissaient dans `Documents/`.
    nonisolated static func legacyBackedUpCacheFile(inDocuments documents: URL) -> URL {
        documents.appendingPathComponent("meeshy_cache", isDirectory: true).appendingPathComponent(fileName)
    }

    /// Efface cette copie : la sauvegarde suivante ne la porte plus.
    nonisolated static func removeLegacyBackedUpCache(inDocuments documents: URL) {
        let legacy = legacyBackedUpCacheFile(inDocuments: documents)
        guard FileManager.default.fileExists(atPath: legacy.path) else { return }
        FileManager.default.removeItemLogging(at: legacy, context: "link preview cache left in Documents", logger: Logger.linkPreview)
    }

    private static func loadFromDisk(decoder: JSONDecoder, maxAge: TimeInterval) -> [String: LinkMetadata] {
        let url = cacheFileURL()
        // Le `fileExists` ci-dessus filtre le cas « pas encore de cache » :
        // un échec de lecture ici est une vraie I/O.
        guard FileManager.default.fileExists(atPath: url.path) else { return [:] }
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            Logger.linkPreview.error("Link preview cache present but unreadable: \(error.localizedDescription, privacy: .public)")
            return [:]
        }
        guard let decoded = decoder.decodeOrLog([String: LinkMetadata].self, from: data, field: "link previews", logger: Logger.linkPreview) else {
            return [:]
        }
        let cutoff = Date().addingTimeInterval(-maxAge)
        return bounded(decoded.filter { _, metadata in metadata.fetchedAt >= cutoff }, limit: maxEntries)
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let linkPreview = MeeshyLog.logger(.linkPreview)
}
