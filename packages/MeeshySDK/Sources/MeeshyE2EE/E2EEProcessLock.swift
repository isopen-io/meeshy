import Darwin
import Foundation
import os

/// L'exclusion entre l'app et l'extension de notification autour de tout ce qui
/// fait avancer un ratchet (spec § 4.4) : deux processus qui déchiffrent depuis
/// le même état feraient bifurquer la session, et des messages se perdraient.
///
/// **Le verrou n'est PAS réentrant.** Un `body` ne reprend jamais un verrou du
/// même fichier, ni par la même instance ni par une autre : la prise imbriquée
/// lève `E2EEProcessLockError.reentrant` sans exécuter son `body`, au lieu de
/// bloquer pour toujours sur `flock`. Un `body` qui attend, de façon
/// synchrone, un autre fil qui prend le même verrou n'est pas détectable : il
/// bloque, et c'est à l'appelant de ne jamais l'écrire.
///
/// **Le verrou ne se tient que sous un bail d'exécution** (#12668) : iOS
/// termine (0xdead10cc) un processus suspendu qui tient un verrou de fichier
/// dans un conteneur partagé. Sans bail accordé, ou bail expiré avant que le
/// corps ne démarre, la prise lève `E2EEExecutionLeaseError` sans exécuter
/// `body` : l'opération est reportée, jamais faite à moitié.
public protocol E2EEProcessLockProviding: Sendable {
    func withLock<T>(_ body: () throws -> T) throws -> T
}

public extension E2EEProcessLockProviding {
    /// Un lot long, découpé : chaque tranche sous SA prise (donc son bail et
    /// sa transaction). Dès qu'une prise est refusée faute de bail, aucune
    /// tranche ne démarre plus, et celles déjà faites — persistées — sont
    /// rendues. Si aucune ne l'a été, le refus remonte.
    func withLockInSlices<Slice, T>(_ slices: [Slice], _ body: (Slice) throws -> T) throws -> [T] {
        var done: [T] = []
        for slice in slices {
            do {
                done.append(try withLock { try body(slice) })
            } catch let refusal as E2EEExecutionLeaseError {
                guard !done.isEmpty else { throw refusal }
                return done
            }
        }
        return done
    }
}

public enum E2EEProcessLockError: Error, Equatable {
    case cannotOpen(errno: Int32)
    case cannotLock(errno: Int32)
    case reentrant
}

/// Le verrou du FICHIER : ce qui exclut deux processus. Séparé pour que le
/// verrou intra-processus se prouve seul.
protocol E2EEFileLocking: Sendable {
    func hold<T>(_ path: String, _ body: () throws -> T) throws -> T
}

/// Un `flock` exclusif. `flock` lie le verrou à la description de fichier
/// ouverte : deux ouvertures, dans un même processus ou dans deux, s'excluent.
/// Le fichier est ouvert à chaque prise, pour qu'aucun descripteur ne survive à
/// une suspension du processus.
struct E2EEFlock: E2EEFileLocking {
    func hold<T>(_ path: String, _ body: () throws -> T) throws -> T {
        let descriptor = open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw E2EEProcessLockError.cannotOpen(errno: errno) }
        defer { close(descriptor) }
        while flock(descriptor, LOCK_EX) != 0 {
            guard errno == EINTR else { throw E2EEProcessLockError.cannotLock(errno: errno) }
        }
        defer { flock(descriptor, LOCK_UN) }
        return try body()
    }
}

/// Un verrou `flock` exclusif sur un fichier du groupe d'apps, doublé d'un
/// verrou intra-processus : `flock` ne garantit rien entre deux fils qui
/// partageraient un descripteur. `shared` sert UNE instance par fichier et par
/// processus, pour que tous les fils passent par le même verrou local.
public final class E2EEProcessLock: E2EEProcessLockProviding {
    private static let instances = OSAllocatedUnfairLock<[String: E2EEProcessLock]>(initialState: [:])

    private let path: String
    private let leasing: any E2EEExecutionLeasing
    private let fileLock: any E2EEFileLocking
    private let local = OSAllocatedUnfairLock()

    /// `leasing` est le bail du processus qui construit le verrou :
    /// `beginBackgroundTask` dans l'app, `E2EEExpiringActivityLeasing` dans la NSE.
    public convenience init(path: String, leasing: any E2EEExecutionLeasing) {
        self.init(path: path, leasing: leasing, fileLock: E2EEFlock())
    }

    /// Sans bail : les témoins seulement.
    @_spi(Testing) public convenience init(path: String) {
        self.init(path: path, leasing: E2EEUnguardedExecutionLeasing())
    }

    convenience init(path: String, fileLock: any E2EEFileLocking) {
        self.init(path: path, leasing: E2EEUnguardedExecutionLeasing(), fileLock: fileLock)
    }

    init(path: String, leasing: any E2EEExecutionLeasing, fileLock: any E2EEFileLocking) {
        self.path = path
        self.leasing = leasing
        self.fileLock = fileLock
    }

    /// Le verrou du groupe d'apps, une instance par fichier et par processus :
    /// le bail de la PREMIÈRE construction est celui de l'instance.
    public static func shared(appGroup: String = "group.me.meeshy.apps", leasing: any E2EEExecutionLeasing) throws -> E2EEProcessLock {
        try shared(appGroup: appGroup, leasing: leasing) { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
    }

    static func shared(
        appGroup: String,
        leasing: any E2EEExecutionLeasing = E2EEUnguardedExecutionLeasing(),
        container: (String) -> URL?
    ) throws -> E2EEProcessLock {
        guard let directory = container(appGroup) else { throw CocoaError(.fileNoSuchFile) }
        return shared(path: directory.appendingPathComponent("e2ee.lock").path, leasing: leasing)
    }

    static func shared(path: String, leasing: any E2EEExecutionLeasing) -> E2EEProcessLock {
        instances.withLock { cache in
            if let existing = cache[path] { return existing }
            let created = E2EEProcessLock(path: path, leasing: leasing)
            cache[path] = created
            return created
        }
    }

    /// Réentrance d'abord (aucun bail pour une prise imbriquée), puis le bail,
    /// puis le verrou local et le `flock` — que la prise peut attendre : le
    /// bail se relit une fois le verrou obtenu, et un bail expiré pendant
    /// l'attente rend le verrou sans exécuter `body`.
    public func withLock<T>(_ body: () throws -> T) throws -> T {
        let marker = Self.heldMarker(for: path)
        let thread = Thread.current.threadDictionary
        guard thread[marker] == nil else { throw E2EEProcessLockError.reentrant }
        return try leasing.withLease { lease in
            guard !lease.isExpired else { throw E2EEExecutionLeaseError.expired }
            return try local.withLockUnchecked { () throws -> T in
                try fileLock.hold(path) {
                    guard !lease.isExpired else { throw E2EEExecutionLeaseError.expired }
                    thread[marker] = true
                    defer { thread.removeObject(forKey: marker) }
                    return try body()
                }
            }
        }
    }

    private static func heldMarker(for path: String) -> String {
        "me.meeshy.e2ee.process-lock.held:" + path
    }
}
