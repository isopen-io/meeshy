import Foundation

/// Les points de reprise des comptes quittés mais gardés (#8674).
///
/// Un point de reprise ne vaut qu'avec le cache qu'il décrit : il est mis de
/// côté quand ce cache l'est, rendu quand ce cache est rendu, et oublié dans
/// tous les autres cas — un point de reprise sans son cache ferait prendre une
/// liste vide pour une liste à jour.
public struct SyncCheckpointVault: @unchecked Sendable {
    private let defaults: UserDefaults
    private let captureLive: @Sendable () -> SyncCheckpoint
    private let applyLive: @Sendable (SyncCheckpoint?) -> Void

    public init(
        defaults: UserDefaults = .standard,
        captureLive: @escaping @Sendable () -> SyncCheckpoint = { ConversationSyncEngine.shared.currentSyncCheckpoint() },
        applyLive: @escaping @Sendable (SyncCheckpoint?) -> Void = { checkpoint in
            guard let checkpoint else {
                ConversationSyncEngine.shared.resetSyncCheckpoints()
                return
            }
            ConversationSyncEngine.shared.restoreSyncCheckpoint(checkpoint)
        }
    ) {
        self.defaults = defaults
        self.captureLive = captureLive
        self.applyLive = applyLive
    }

    private static let defaultsKeyPrefix = "me.meeshy.syncCheckpoint."

    static func defaultsKey(for key: MessageStoreAccountKey) -> String {
        defaultsKeyPrefix + key.fingerprint
    }

    func sweep(keeping keys: Set<MessageStoreAccountKey>) {
        let kept = Set(keys.map(Self.defaultsKey(for:)))
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.defaultsKeyPrefix) && !kept.contains($0) }
            .forEach(defaults.removeObject(forKey:))
    }

    func capture() -> SyncCheckpoint { captureLive() }

    func stash(_ checkpoint: SyncCheckpoint, for key: MessageStoreAccountKey) {
        do {
            defaults.set(try JSONEncoder().encode(checkpoint), forKey: Self.defaultsKey(for: key))
        } catch {
            discard(for: key)
        }
    }

    func take(for key: MessageStoreAccountKey) -> SyncCheckpoint? {
        defer { discard(for: key) }
        guard let data = defaults.data(forKey: Self.defaultsKey(for: key)) else { return nil }
        do {
            return try JSONDecoder().decode(SyncCheckpoint.self, from: data)
        } catch {
            return nil
        }
    }

    func discard(for key: MessageStoreAccountKey) {
        defaults.removeObject(forKey: Self.defaultsKey(for: key))
    }

    func apply(_ checkpoint: SyncCheckpoint?) { applyLive(checkpoint) }
}

/// Lie le cache (`CacheCoordinator`) au compte ACTIF, dans l'ORDRE des
/// demandes (#8674).
///
/// Chaque sortie et chaque entrée de session demande une liaison ; elles se
/// suivent sur une file sérielle, parce qu'une liaison déplace des fichiers et
/// qu'une liaison doublée par la suivante ferait vivre le cache d'un compte
/// sous un autre. Une liaison déjà faite ne refait rien : demander deux fois
/// le même compte est sans effet, ce qui permet de la demander partout où une
/// session commence ou finit sans compter qui l'a déjà fait.
@MainActor
public final class CacheAccountBinder {
    public static let shared = CacheAccountBinder()

    private let cache: CacheCoordinator
    private let vault: SyncCheckpointVault
    private let isPreserved: @Sendable @concurrent (String) async -> Bool
    private var tail: Task<Void, Never>?

    init(
        cache: CacheCoordinator = .shared,
        vault: SyncCheckpointVault = SyncCheckpointVault(),
        isPreserved: @escaping @Sendable @concurrent (String) async -> Bool = { userId in
            await MainActor.run { AuthManager.shared.hasPreservedSession(for: userId) }
        }
    ) {
        self.cache = cache
        self.vault = vault
        self.isPreserved = isPreserved
    }

    /// Fait du cache vivant celui de `key` — celui de personne pour `nil`.
    /// Le point de reprise suit son cache : mis de côté avec lui, rendu avec
    /// lui, oublié sinon.
    @discardableResult
    public func bind(_ key: MessageStoreAccountKey?) -> Task<Void, Never> {
        enqueue { [cache, vault, isPreserved] in
            let live = vault.capture()
            let binding = await cache.bindAccount(key, isPreserved: isPreserved)
            guard binding.ownerChanged else { return }
            if let archived = binding.archived { vault.stash(live, for: archived) }
            if let dropped = binding.dropped { vault.discard(for: dropped) }
            let returning = key.flatMap { vault.take(for: $0) }
            vault.apply(binding.restored == nil ? nil : returning)
        }
    }

    /// Oublie tout ce que l'appareil gardait d'un compte retiré.
    @discardableResult
    public func forget(_ key: MessageStoreAccountKey) -> Task<Void, Never> {
        enqueue { [cache, vault] in
            await cache.discardArchive(of: key)
            vault.discard(for: key)
        }
    }

    /// Efface les caches mis de côté des comptes absents de `keys`.
    @discardableResult
    public func sweep(keeping keys: Set<MessageStoreAccountKey>) -> Task<Void, Never> {
        enqueue { [cache, vault] in
            await cache.sweepArchives(keeping: keys)
            vault.sweep(keeping: keys)
        }
    }

    /// Rend la main quand toutes les liaisons demandées sont faites.
    public func settled() async {
        await tail?.value
    }

    private func enqueue(_ work: @escaping @Sendable @concurrent () async -> Void) -> Task<Void, Never> {
        let previous = tail
        let task = Task {
            await previous?.value
            await work()
        }
        tail = task
        return task
    }
}
