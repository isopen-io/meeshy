import Foundation
import GRDB
import os

private let accountCacheLogger = Logger(subsystem: "com.meeshy.sdk", category: "cache-accounts")

/// Le compte à qui appartient le cache VIVANT (`meeshy.sqlite`) (#8674).
///
/// Le cache n'a aucune colonne propriétaire : un seul compte y vit à la fois.
/// Ce marqueur dit lequel, et survit au processus — c'est ce qui permet à un
/// démarrage à froid de savoir si le fichier appartient bien au compte qui
/// s'ouvre.
public enum CacheLiveOwner: Equatable, Sendable {
    /// Aucun marqueur : un cache d'avant #8674, attribué au premier compte qui
    /// s'y lie (comme l'ancienne base partagée des messages, #8656).
    case unrecorded
    /// Personne : le cache vivant est vide.
    case nobody
    /// Une bascule a été interrompue : le contenu n'appartient à personne
    /// qu'on puisse nommer, il sera effacé.
    case interrupted
    case account(MessageStoreAccountKey)
}

/// Ce qu'une liaison de compte a fait du cache (#8674).
public struct CacheAccountBinding: Equatable, Sendable {
    /// Le compte quitté dont le cache a été mis de côté.
    public var archived: MessageStoreAccountKey?
    /// Le compte quitté dont le cache a été effacé (déconnecté, retiré).
    public var dropped: MessageStoreAccountKey?
    /// Le compte arrivé dont le cache mis de côté a été rendu.
    public var restored: MessageStoreAccountKey?
    /// `false` quand le cache vivant appartenait déjà au compte demandé.
    public var ownerChanged: Bool

    public init(
        archived: MessageStoreAccountKey? = nil,
        dropped: MessageStoreAccountKey? = nil,
        restored: MessageStoreAccountKey? = nil,
        ownerChanged: Bool
    ) {
        self.archived = archived
        self.dropped = dropped
        self.restored = restored
        self.ownerChanged = ownerChanged
    }
}

// MARK: - Un cache par compte gardé sur l'appareil

extension CacheCoordinator {

    static let liveOwnerDefaultsKey = "meeshy.cache.liveOwner"
    private static let nobodyMarker = ""
    private static let interruptedMarker = "~"

    nonisolated public var liveOwner: CacheLiveOwner {
        guard let raw = ownerDefaults.string(forKey: Self.liveOwnerDefaultsKey) else { return .unrecorded }
        switch raw {
        case Self.nobodyMarker: return .nobody
        case Self.interruptedMarker: return .interrupted
        default:
            let parts = raw.split(separator: "\n", maxSplits: 1).map(String.init)
            guard parts.count == 2, !parts[1].isEmpty else { return .interrupted }
            return .account(MessageStoreAccountKey(userId: parts[1], environmentHost: parts[0]))
        }
    }

    nonisolated func markLiveOwner(_ owner: CacheLiveOwner) {
        switch owner {
        case .unrecorded: ownerDefaults.removeObject(forKey: Self.liveOwnerDefaultsKey)
        case .nobody: ownerDefaults.set(Self.nobodyMarker, forKey: Self.liveOwnerDefaultsKey)
        case .interrupted: ownerDefaults.set(Self.interruptedMarker, forKey: Self.liveOwnerDefaultsKey)
        case .account(let key):
            ownerDefaults.set("\(key.environmentHost)\n\(key.userId)", forKey: Self.liveOwnerDefaultsKey)
        }
    }

    nonisolated func archiveURL(for key: MessageStoreAccountKey) -> URL {
        accountArchiveDirectory.appendingPathComponent(key.cacheArchiveFileName)
    }

    nonisolated public func hasArchive(for key: MessageStoreAccountKey) -> Bool {
        FileManager.default.fileExists(atPath: archiveURL(for: key).path)
    }

    /// Fait du cache vivant celui de `key` (celui de personne pour `nil`).
    ///
    /// Le compte QUITTÉ garde son cache s'il reste gardé sur l'appareil
    /// (`isPreserved`, lu au moment de la bascule) : il est mis de côté dans
    /// un fichier à son empreinte. Sinon — déconnexion, session révoquée,
    /// compte retiré — il est effacé, avec ce qui en dormait de côté.
    /// Le compte ARRIVÉ retrouve le sien s'il en avait un.
    ///
    /// Le cache vivant n'appartient jamais qu'à UN compte : il est vidé avant
    /// que celui du compte arrivé n'y soit rendu, et le marqueur passe par
    /// `interrupted` pendant la bascule — un processus tué au milieu repart
    /// d'un cache effacé, jamais d'un mélange.
    public func bindAccount(
        _ key: MessageStoreAccountKey?,
        isPreserved: @Sendable @concurrent (String) async -> Bool
    ) async -> CacheAccountBinding {
        let owner = liveOwner
        if let key, owner == .account(key) { return CacheAccountBinding(ownerChanged: false) }
        if key == nil, owner == .nobody { return CacheAccountBinding(ownerChanged: false) }
        if let key, owner == .unrecorded {
            markLiveOwner(.account(key))
            return CacheAccountBinding(ownerChanged: false)
        }

        var binding = CacheAccountBinding(ownerChanged: true)
        if case .account(let leaving) = owner {
            if await isPreserved(leaving.userId), await archiveLiveContent(as: leaving) {
                binding.archived = leaving
            } else {
                discardArchive(of: leaving)
                binding.dropped = leaving
            }
        }

        let incomingArchive = key.flatMap { hasArchive(for: $0) ? $0 : nil }
        if owner != .nobody || incomingArchive != nil {
            markLiveOwner(.interrupted)
            await wipeLiveContent()
        }
        markLiveOwner(.nobody)

        guard let key else { return binding }
        if let incomingArchive, restoreArchive(of: incomingArchive) {
            binding.restored = key
        }
        markLiveOwner(.account(key))
        return binding
    }

    /// Efface le cache mis de côté d'un compte retiré de l'appareil.
    public func discardArchive(of key: MessageStoreAccountKey) {
        Self.removeSQLiteFiles(at: archiveURL(for: key))
    }

    /// Efface les caches mis de côté des comptes qui ne sont plus sur
    /// l'appareil — un compte absent du sélecteur n'a plus rien à y garder.
    public func sweepArchives(keeping keys: Set<MessageStoreAccountKey>) {
        let kept = Set(keys.map(\.cacheArchiveFileName))
        let names: [String]
        do {
            names = try FileManager.default.contentsOfDirectory(atPath: accountArchiveDirectory.path)
        } catch {
            return
        }
        names
            .filter { MessageStoreAccountKey.isCacheArchiveFileName($0) && !kept.contains($0) }
            .forEach { Self.removeSQLiteFiles(at: accountArchiveDirectory.appendingPathComponent($0)) }
    }

    private func archiveLiveContent(as key: MessageStoreAccountKey) async -> Bool {
        for store in allGRDBStores {
            await store.flushDirtyKeys()
        }
        let url = archiveURL(for: key)
        Self.removeSQLiteFiles(at: url)
        do {
            try FileManager.default.createDirectory(at: accountArchiveDirectory, withIntermediateDirectories: true)
            let destination = try DatabaseQueue(path: url.path)
            try db.backup(to: destination)
            try destination.close()
            Self.protect(url)
            return true
        } catch {
            accountCacheLogger.error("Cache archive failed: \(error.localizedDescription, privacy: .public)")
            Self.removeSQLiteFiles(at: url)
            return false
        }
    }

    private func restoreArchive(of key: MessageStoreAccountKey) -> Bool {
        let url = archiveURL(for: key)
        defer { Self.removeSQLiteFiles(at: url) }
        do {
            let source = try DatabaseQueue(path: url.path)
            try source.backup(to: db)
            try source.close()
            try AppDatabase.runMigrations(on: db)
        } catch {
            accountCacheLogger.error("Cache restore failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
        hydrateTranslationCachesFromDisk()
        return true
    }

    private nonisolated static func protect(_ url: URL) {
        for suffix in ["", "-wal", "-shm"] {
            let path = url.path + suffix
            guard FileManager.default.fileExists(atPath: path) else { continue }
            do {
                try FileManager.default.setAttributes(
                    [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                    ofItemAtPath: path
                )
            } catch {
                accountCacheLogger.error("Cache archive protection failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    nonisolated static func removeSQLiteFiles(at url: URL) {
        for suffix in ["", "-wal", "-shm"] {
            let path = url.path + suffix
            guard FileManager.default.fileExists(atPath: path) else { continue }
            do {
                try FileManager.default.removeItem(atPath: path)
            } catch {
                accountCacheLogger.error("Cache archive removal failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
