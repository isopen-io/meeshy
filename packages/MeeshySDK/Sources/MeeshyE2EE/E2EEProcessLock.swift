import Darwin
import Foundation
import os

/// L'exclusion entre l'app et l'extension de notification autour de tout ce qui
/// fait avancer un ratchet (spec § 4.4) : deux processus qui déchiffrent depuis
/// le même état feraient bifurquer la session, et des messages se perdraient.
public protocol E2EEProcessLockProviding: Sendable {
    func withLock<T>(_ body: () throws -> T) throws -> T
}

public enum E2EEProcessLockError: Error, Equatable {
    case cannotOpen(errno: Int32)
    case cannotLock(errno: Int32)
}

/// Un verrou `flock` exclusif sur un fichier du groupe d'apps. `flock` lie le
/// verrou à la description de fichier ouverte : deux instances, dans un même
/// processus ou dans deux, s'excluent. Le fichier est ouvert à chaque prise,
/// pour qu'aucun descripteur ne survive à une suspension du processus.
/// Un verrou intra-processus le double, `flock` ne garantissant rien entre deux
/// fils qui partageraient un descripteur.
public final class E2EEProcessLock: E2EEProcessLockProviding {
    private let path: String
    private let local = OSAllocatedUnfairLock()

    public init(path: String) {
        self.path = path
    }

    public static func shared(appGroup: String = "group.me.meeshy.apps") throws -> E2EEProcessLock {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            throw CocoaError(.fileNoSuchFile)
        }
        return E2EEProcessLock(path: container.appendingPathComponent("e2ee.lock").path)
    }

    public func withLock<T>(_ body: () throws -> T) throws -> T {
        try local.withLockUnchecked { () throws -> T in
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
}
