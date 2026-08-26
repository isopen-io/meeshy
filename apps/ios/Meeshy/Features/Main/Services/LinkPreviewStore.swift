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
    private let fileName = "link_preview_cache.json"
    private let maxAge: TimeInterval = 7 * 24 * 3600
    /// Negative cache: URLs we've tried and failed (404 / non-HTML / empty OG)
    /// are remembered briefly so we don't hammer the same host over and over.
    private let negativeCacheDuration: TimeInterval = 30 * 60

    @Published private(set) var cache: [String: LinkMetadata] = [:]
    private var negativeCache: [String: Date] = [:]
    private var pendingKeys: Set<String> = []
    private var cancellables = Set<AnyCancellable>()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init() {
        self.cache = Self.loadFromDisk(fileName: fileName, decoder: decoder, maxAge: maxAge)
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

    /// Kick off a fetch for this URL if we don't already have fresh data and
    /// we haven't recently failed. No-op on repeat calls — `LinkPreviewFetcher`
    /// dedupes in-flight requests, and our `pendingKeys` set prevents
    /// duplicate VM-level refreshes during the same scroll frame.
    func requestMetadata(for urlString: String) {
        if cache[urlString] != nil { return }
        if let failedAt = negativeCache[urlString],
           Date().timeIntervalSince(failedAt) < negativeCacheDuration {
            return
        }
        if pendingKeys.contains(urlString) { return }
        pendingKeys.insert(urlString)

        Task { [weak self] in
            let metadata = await LinkPreviewFetcher.shared.metadata(for: urlString)
            await MainActor.run { [weak self] in
                guard let self else { return }
                self.pendingKeys.remove(urlString)
                if let metadata {
                    self.cache[urlString] = metadata
                    self.persist()
                } else {
                    self.negativeCache[urlString] = Date()
                }
            }
        }
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
            cache[urlString] = metadata
            persist()
        } else {
            negativeCache[urlString] = Date()
        }
        return metadata
    }

    func clearAll() {
        cache.removeAll()
        negativeCache.removeAll()
        pendingKeys.removeAll()
        FileManager.default.removeItemLogging(at: Self.fileURL(fileName), context: "link preview cache reset", logger: Logger.linkPreview)
    }

    // MARK: - Persistence

    private func persist() {
        let snapshot = cache
        let encoder = self.encoder
        let fileName = self.fileName
        Task.detached(priority: .utility) {
            guard let data = encoder.encodeOrLog(snapshot, field: "link previews", logger: Logger.linkPreview) else { return }
            do {
                try data.write(to: Self.fileURL(fileName), options: .atomic)
            } catch {
                Logger.linkPreview.error("Link preview cache not written, previews will be refetched: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private nonisolated static func fileURL(_ fileName: String) -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            FileManager.default.createDirectoryLogging(at: cacheDir, context: "link preview cache dir", logger: Logger.linkPreview)
        }
        return cacheDir.appendingPathComponent(fileName)
    }

    private static func loadFromDisk(fileName: String, decoder: JSONDecoder, maxAge: TimeInterval) -> [String: LinkMetadata] {
        let url = fileURL(fileName)
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
        return decoded.filter { _, metadata in metadata.fetchedAt >= cutoff }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let linkPreview = Logger(subsystem: "me.meeshy.app", category: "link-preview")
}
