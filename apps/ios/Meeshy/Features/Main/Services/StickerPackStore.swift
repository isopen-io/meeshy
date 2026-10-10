import Foundation
import os
import MeeshySDK

// MARK: - Les packs de stickers, côté app (#9190)

/// Ce que le cache retient : les packs installés (la feuille) et la boutique
/// (résumés) — `nil` tant que la boutique n'a jamais été ouverte.
nonisolated struct StickerPackSnapshot: Codable, Sendable, Equatable {
    let installed: [StickerPack]
    let catalogue: [StickerPack]?
}

/// **L'état de l'étagère, et ses trois transitions PURES** : basculer à
/// l'instant (optimiste), confirmer, revenir en arrière.
///
/// `installed == nil` veut dire « on ne sait pas encore » — la feuille sert
/// alors les trois packs intégrés, installés par défaut. Une bascule optimiste
/// ne fabrique PAS une liste à partir de rien : écrire `[chats]` à la place de
/// `nil` retirerait Mee, Meo et leurs duos le temps d'un aller-retour.
nonisolated struct StickerPackShelfState: Equatable, Sendable {
    var installed: [StickerPack]?
    var catalogue: [StickerPack]?
    var pending: Set<String> = []
    /// Le dernier geste a été refusé et annulé — la Boutique le dit.
    var failed = false

    /// Bascule `pack` À L'INSTANT. `nil` si un geste sur ce pack est déjà en
    /// vol : deux requêtes contraires se croiseraient, et l'état final serait
    /// celui de la plus lente.
    func togglingInstall(of pack: StickerPack) -> StickerPackShelfState? {
        guard !pending.contains(pack.slug) else { return nil }
        let current = catalogue?.first { $0.slug == pack.slug } ?? pack
        var flipped = current
        flipped.installed.toggle()
        flipped.installCount = max(0, current.installCount + (flipped.installed ? 1 : -1))

        var next = self
        next.catalogue = catalogue?.map { $0.slug == pack.slug ? flipped : $0 }
        next.installed = installed.map { list in
            flipped.installed
                ? (list.contains { $0.slug == pack.slug } ? list : list + [flipped])
                : list.filter { $0.slug != pack.slug }
        }
        next.pending.insert(pack.slug)
        next.failed = false
        return next
    }

    /// La passerelle a confirmé : son compte d'installations fait foi.
    func settled(slug: String, confirmed: StickerPack) -> StickerPackShelfState {
        var next = self
        next.pending.remove(slug)
        next.catalogue = catalogue?.map { pack in
            guard pack.slug == slug else { return pack }
            var updated = pack
            updated.installed = confirmed.installed
            updated.installCount = confirmed.installCount
            return updated
        }
        return next
    }

    /// **Retour en arrière du SEUL pack refusé** : un autre geste en vol reste
    /// ce qu'il est.
    func rolledBack(slug: String, to previous: StickerPackShelfState) -> StickerPackShelfState {
        var next = self
        next.pending.remove(slug)
        next.failed = true
        if let before = previous.catalogue?.first(where: { $0.slug == slug }) {
            next.catalogue = catalogue?.map { $0.slug == slug ? before : $0 }
        }
        let wasInstalled = previous.installed?.first { $0.slug == slug }
        next.installed = installed.map { list in
            let without = list.filter { $0.slug != slug }
            return wasInstalled.map { without + [$0] } ?? without
        }
        return next
    }
}

// MARK: - Le cache

@MainActor
protocol StickerPackCaching: AnyObject {
    func load() async -> CacheResult<StickerPackSnapshot>
    func save(_ snapshot: StickerPackSnapshot) async
}

/// Un fichier JSON dans les caches de l'app : quelques ko, relus à
/// l'ouverture de la feuille. Frais une heure, servi périmé un mois — un pack
/// installé ne change presque jamais.
@MainActor
final class StickerPackDiskCache: StickerPackCaching {
    nonisolated deinit {}

    static let freshFor: TimeInterval = 3600
    static let servedStaleFor: TimeInterval = 30 * 24 * 3600

    private let file: StickerPackCacheFile
    private let now: () -> Date

    init(directory: URL? = nil, now: @escaping () -> Date = Date.init) {
        let root = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.file = StickerPackCacheFile(url: root.appendingPathComponent("sticker-packs.json"))
        self.now = now
    }

    func load() async -> CacheResult<StickerPackSnapshot> {
        guard let stored = await file.read() else { return .empty }
        let age = now().timeIntervalSince(stored.savedAt)
        if age < Self.freshFor { return .fresh(stored.snapshot, age: age) }
        if age < Self.servedStaleFor { return .stale(stored.snapshot, age: age) }
        return .expired
    }

    func save(_ snapshot: StickerPackSnapshot) async {
        await file.write(StickerPackCacheFile.Stored(savedAt: now(), snapshot: snapshot))
    }
}

/// La lecture et l'écriture du fichier, HORS du fil principal.
actor StickerPackCacheFile {
    nonisolated struct Stored: Codable, Sendable {
        let savedAt: Date
        let snapshot: StickerPackSnapshot
    }

    private let url: URL

    init(url: URL) {
        self.url = url
    }

    func read() -> Stored? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data)
    }

    func write(_ stored: Stored) {
        guard let data = try? JSONEncoder().encode(stored) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

// MARK: - Le magasin

/// **Les packs installés et la Boutique, cache d'abord** (#9190).
///
/// - `loadInstalled()` sert le cache sans attendre ; frais, il ne touche pas
///   au réseau ; périmé, il se revalide en silence ; un échec réseau ne vide
///   rien.
/// - `toggle(_:)` bascule à l'instant, puis confirme ou revient en arrière en
///   le disant. Un pack de tiers installé relit les packs installés : ses
///   stickers n'arrivent qu'avec eux.
@MainActor
final class StickerPackStore: ObservableObject {
    nonisolated deinit {}

    static let shared = StickerPackStore()

    @Published private(set) var state = StickerPackShelfState()

    var installed: [StickerPack]? { state.installed }

    private let service: StickerPackServiceProviding
    private let cache: StickerPackCaching
    private var readCache = false
    private var refreshingInstalled = false
    private let logger = Logger(subsystem: "me.meeshy.app", category: "sticker-packs")

    init(service: StickerPackServiceProviding = StickerPackService.shared,
         cache: StickerPackCaching? = nil) {
        self.service = service
        self.cache = cache ?? StickerPackDiskCache()
    }

    func loadInstalled() async {
        guard await serveCache() else { return }
        await refreshInstalled()
    }

    func loadCatalogue() async {
        _ = await serveCache()
        do {
            let catalogue = try await service.catalogue()
            state.catalogue = catalogue
            await remember()
        } catch {
            logger.error("Sticker pack shop failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func toggle(_ pack: StickerPack) async {
        guard let next = state.togglingInstall(of: pack) else { return }
        let previous = state
        state = next
        let wantsInstalled = next.catalogue?.first { $0.slug == pack.slug }?.installed ?? !pack.installed
        do {
            let confirmed = try await service.setInstalled(wantsInstalled, slug: pack.slug)
            state = state.settled(slug: pack.slug, confirmed: confirmed)
            if (wantsInstalled && BuiltinStickerPack(slug: pack.slug) == nil) || state.installed == nil {
                await refreshInstalled()
            } else {
                await remember()
            }
        } catch {
            logger.error("Sticker pack toggle refused: \(error.localizedDescription, privacy: .public)")
            state = state.rolledBack(slug: pack.slug, to: previous)
        }
    }

    // MARK: - Interne

    /// Sert le cache une fois par vie du magasin. `true` ⇔ il faut revalider.
    private func serveCache() async -> Bool {
        guard !readCache else { return state.installed == nil }
        readCache = true
        switch await cache.load() {
        case .fresh(let snapshot, _):
            apply(snapshot)
            return false
        case .stale(let snapshot, _):
            apply(snapshot)
            return true
        case .expired, .empty:
            return true
        }
    }

    private func apply(_ snapshot: StickerPackSnapshot) {
        if state.installed == nil { state.installed = snapshot.installed }
        if state.catalogue == nil { state.catalogue = snapshot.catalogue }
    }

    private func refreshInstalled() async {
        guard !refreshingInstalled else { return }
        refreshingInstalled = true
        defer { refreshingInstalled = false }
        do {
            state.installed = try await service.installed()
            await remember()
        } catch {
            logger.error("Installed sticker packs failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func remember() async {
        guard let installed = state.installed else { return }
        await cache.save(StickerPackSnapshot(installed: installed, catalogue: state.catalogue))
    }
}
