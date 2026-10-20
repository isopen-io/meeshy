import Combine
import Foundation
import os
import MeeshySDK

// MARK: - Les packs, côté app, pour n'importe quel domaine (#9190, #10150)

/// Ce que le cache retient pour UN compte : les packs installés (l'étagère) et
/// la boutique (résumés) — `nil` tant que la boutique n'a jamais été ouverte.
nonisolated struct PackSnapshot<Pack: InstallablePack>: Codable, Sendable, Equatable {
    let installed: [Pack]
    let catalogue: [Pack]?
}

/// **L'état de l'étagère, et ses trois transitions PURES** : basculer à
/// l'instant (optimiste), confirmer, revenir en arrière.
///
/// `installed == nil` veut dire « on ne sait pas encore » — la feuille de
/// stickers sert alors les trois packs intégrés, installés par défaut. Une
/// bascule optimiste ne fabrique PAS une liste à partir de rien : écrire
/// `[chats]` à la place de `nil` retirerait Mee, Meo et leurs duos le temps
/// d'un aller-retour.
nonisolated struct PackShelfState<Pack: InstallablePack>: Equatable, Sendable {
    var installed: [Pack]?
    var catalogue: [Pack]?
    var pending: Set<String> = []
    /// Le dernier geste a été refusé et annulé — la Boutique le dit.
    var failed = false

    /// Bascule `pack` À L'INSTANT. `nil` si un geste sur ce pack est déjà en
    /// vol : deux requêtes contraires se croiseraient, et l'état final serait
    /// celui de la plus lente.
    func togglingInstall(of pack: Pack) -> PackShelfState? {
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
    func settled(slug: String, confirmed: Pack) -> PackShelfState {
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
    func rolledBack(slug: String, to previous: PackShelfState) -> PackShelfState {
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

// MARK: - Le cache, un fichier par domaine ET par compte

@MainActor
protocol PackCaching<Pack>: AnyObject {
    associatedtype Pack: InstallablePack
    func load(account: String) async -> CacheResult<PackSnapshot<Pack>>
    func save(_ snapshot: PackSnapshot<Pack>, account: String) async
}

/// Un fichier JSON par domaine et par compte dans les caches de l'app :
/// quelques ko, relus à l'ouverture. Frais une heure, servi périmé un mois —
/// et revalidé à chaque apparition de l'étagère. Deux comptes sur un même
/// appareil ont deux étagères : le fichier de l'un n'est jamais servi à l'autre.
@MainActor
final class PackDiskCache<Pack: InstallablePack>: PackCaching {
    nonisolated deinit {}

    static var freshFor: TimeInterval { 3600 }
    static var servedStaleFor: TimeInterval { 30 * 24 * 3600 }

    private let domain: PackDomain
    private let root: URL
    private let now: () -> Date

    init(domain: PackDomain, directory: URL? = nil, now: @escaping () -> Date = Date.init) {
        self.domain = domain
        self.root = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.now = now
        if domain == .sticker { Self.removeLegacyStickerCache(in: root) }
    }

    /// L'ancien `sticker-packs.json`, non cloisonné, montrait au compte B les
    /// packs du compte A : supprimé, jamais migré (§ 5.10.6).
    private static func removeLegacyStickerCache(in root: URL) {
        try? FileManager.default.removeItem(at: root.appendingPathComponent("sticker-packs.json"))
    }

    func load(account: String) async -> CacheResult<PackSnapshot<Pack>> {
        guard let stored = await file(account).read() else { return .empty }
        let age = now().timeIntervalSince(stored.savedAt)
        if age < Self.freshFor { return .fresh(stored.snapshot, age: age) }
        if age < Self.servedStaleFor { return .stale(stored.snapshot, age: age) }
        return .expired
    }

    func save(_ snapshot: PackSnapshot<Pack>, account: String) async {
        await file(account).write(PackCacheFile<Pack>.Stored(savedAt: now(), snapshot: snapshot))
    }

    /// **L'union des étagères des comptes connus sur l'appareil** (D-P4) : les
    /// packs installés que retient chaque fichier de cache du domaine. `nil` si
    /// l'un d'eux ne se relit pas — l'élagage, dans le doute, n'efface rien.
    nonisolated static func installedSlugsOfEveryAccount(domain: PackDomain, directory: URL? = nil) async -> Set<String>? {
        let root = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let prefix = "packs-\(domain.rawValue)-"
        let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        var slugs: Set<String> = []
        for name in names where name.hasPrefix(prefix) && name.hasSuffix(".json") {
            guard let stored = await PackCacheFile<Pack>(url: root.appendingPathComponent(name)).read() else { return nil }
            slugs.formUnion(stored.snapshot.installed.map(\.slug))
        }
        return slugs
    }

    private func file(_ account: String) -> PackCacheFile<Pack> {
        let safe = account.filter { $0.isLetter || $0.isNumber }
        return PackCacheFile(url: root.appendingPathComponent("packs-\(domain.rawValue)-\(safe).json"))
    }
}

/// La lecture et l'écriture du fichier, HORS du fil principal.
actor PackCacheFile<Pack: InstallablePack> {
    nonisolated struct Stored: Codable, Sendable {
        let savedAt: Date
        let snapshot: PackSnapshot<Pack>
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

/// **Les packs installés et la Boutique d'un domaine, cache d'abord** (#9190,
/// #10150).
///
/// - `loadInstalled()` sert le cache du compte sans attendre, puis revalide
///   À CHAQUE APPARITION : un pack installé ailleurs (le web, un autre
///   appareil) rejoint l'étagère dès la prochaine ouverture. Un échec réseau
///   ne vide rien.
/// - `toggle(_:)` bascule à l'instant, puis confirme ou revient en arrière en
///   le disant. Un pack non intégré installé relit les packs installés : ses
///   octets n'arrivent qu'avec eux.
/// - Changer de compte vide l'étagère et sert le cache de l'autre compte ; une
///   réponse partie pour l'ancien compte ne s'écrit pas dans le nouveau.
@MainActor
final class PackStore<Pack: InstallablePack>: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var state = PackShelfState<Pack>()

    var installed: [Pack]? { state.installed }

    private let service: any PackServiceProviding<Pack>
    private let cache: any PackCaching<Pack>
    private let account: @MainActor () -> String?
    /// Un pack a quitté l'étagère (retiré ici, ou ailleurs et vu à la
    /// revalidation) : ses fichiers peuvent être élagués (§ 5.10.6).
    private let onShelfShrank: (@MainActor () async -> Void)?
    private var shelfAccount: String?
    private var syncedAccount = false
    private var readCache = false
    private var refreshingInstalled = false
    private let logger = MeeshyLog.logger(.packs)

    init(service: any PackServiceProviding<Pack>,
         cache: (any PackCaching<Pack>)? = nil,
         account: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
         onShelfShrank: (@MainActor () async -> Void)? = nil) {
        self.service = service
        self.cache = cache ?? PackDiskCache<Pack>(domain: service.domain)
        self.account = account
        self.onShelfShrank = onShelfShrank
    }

    func loadInstalled() async {
        syncAccount()
        await serveCache()
        await refreshInstalled()
    }

    func loadCatalogue() async {
        syncAccount()
        await serveCache()
        let owner = shelfAccount
        do {
            let catalogue = try await service.catalogue()
            guard owner == shelfAccount else { return }
            state.catalogue = catalogue
            await remember()
        } catch {
            logger.error("Pack shop failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func toggle(slug: String) async {
        guard let pack = state.catalogue?.first(where: { $0.slug == slug })
                ?? state.installed?.first(where: { $0.slug == slug }) else { return }
        await toggle(pack)
    }

    func toggle(_ pack: Pack) async {
        syncAccount()
        guard let next = state.togglingInstall(of: pack) else { return }
        let previous = state
        let owner = shelfAccount
        state = next
        let wantsInstalled = next.catalogue?.first { $0.slug == pack.slug }?.installed ?? !pack.installed
        do {
            let confirmed = try await service.setInstalled(wantsInstalled, slug: pack.slug)
            guard owner == shelfAccount else { return }
            state = state.settled(slug: pack.slug, confirmed: confirmed)
            if (wantsInstalled && !pack.isBundled) || state.installed == nil {
                await refreshInstalled()
            } else {
                await remember()
            }
            if !wantsInstalled { await onShelfShrank?() }
        } catch {
            logger.error("Pack toggle refused: \(error.localizedDescription, privacy: .public)")
            guard owner == shelfAccount else { return }
            state = state.rolledBack(slug: pack.slug, to: previous)
        }
    }

    // MARK: - Interne

    /// Un autre compte : une autre étagère, servie depuis SON cache.
    private func syncAccount() {
        let current = account()
        guard !syncedAccount || current != shelfAccount else { return }
        syncedAccount = true
        shelfAccount = current
        state = PackShelfState()
        readCache = false
        refreshingInstalled = false
    }

    /// Sert le cache du compte une fois par vie de l'étagère.
    private func serveCache() async {
        guard !readCache, let owner = shelfAccount else { return }
        readCache = true
        let result = await cache.load(account: owner)
        guard owner == shelfAccount else { return }
        switch result {
        case .fresh(let snapshot, _), .stale(let snapshot, _):
            if state.installed == nil { state.installed = snapshot.installed }
            if state.catalogue == nil { state.catalogue = snapshot.catalogue }
        case .expired, .empty:
            break
        }
    }

    private func refreshInstalled() async {
        guard !refreshingInstalled else { return }
        refreshingInstalled = true
        let owner = shelfAccount
        defer { if owner == shelfAccount { refreshingInstalled = false } }
        do {
            let installed = try await service.installed()
            guard owner == shelfAccount else { return }
            let before = Set(state.installed?.map(\.slug) ?? [])
            state.installed = installed
            await remember()
            if !before.isSubset(of: Set(installed.map(\.slug))) { await onShelfShrank?() }
        } catch {
            logger.error("Installed packs failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func remember() async {
        guard let owner = shelfAccount, let installed = state.installed else { return }
        await cache.save(PackSnapshot(installed: installed, catalogue: state.catalogue), account: owner)
    }
}

// MARK: - Les magasins du produit

@MainActor
enum PackStores {
    static let stickers = PackStore<StickerPack>(service: StickerPackService.shared)
    static let frames = PackStore<FramePack>(service: FramePackService.shared,
                                             onShelfShrank: { await PackFilePruner.frames.requestPrune() })
}
