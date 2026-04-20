import Foundation
import Combine
import MeeshySDK

/// In-memory + disk cache of `LinkMetadata` keyed by canonical URL.
/// Lives in the app target (not the SDK) because it binds `LinkPreviewFetcher`
/// to the persistence layer with a concrete TTL strategy — the SDK stays
/// dependency-minimal and the app decides retention.
///
/// Entries older than `maxAge` are evicted at load time so the cache never
/// serves metadata that predates a site redesign by more than a week.
@MainActor
final class LinkPreviewStore: ObservableObject {
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

    func clearAll() {
        cache.removeAll()
        negativeCache.removeAll()
        pendingKeys.removeAll()
        try? FileManager.default.removeItem(at: Self.fileURL(fileName))
    }

    // MARK: - Persistence

    private func persist() {
        let snapshot = cache
        let encoder = self.encoder
        let fileName = self.fileName
        Task.detached(priority: .utility) {
            guard let data = try? encoder.encode(snapshot) else { return }
            try? data.write(to: Self.fileURL(fileName), options: .atomic)
        }
    }

    private static func fileURL(_ fileName: String) -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let cacheDir = documents.appendingPathComponent("meeshy_cache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        return cacheDir.appendingPathComponent(fileName)
    }

    private static func loadFromDisk(fileName: String, decoder: JSONDecoder, maxAge: TimeInterval) -> [String: LinkMetadata] {
        let url = fileURL(fileName)
        guard FileManager.default.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url),
              let decoded = try? decoder.decode([String: LinkMetadata].self, from: data) else {
            return [:]
        }
        let cutoff = Date().addingTimeInterval(-maxAge)
        return decoded.filter { _, metadata in metadata.fetchedAt >= cutoff }
    }
}
