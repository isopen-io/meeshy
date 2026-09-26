import Foundation

// Les appels POSIX du socket Unix de partage d'écran (#8063), partagés par
// l'émetteur (extension) et le récepteur (app). Compilé dans les deux cibles
// avec `ScreenShareWire.swift`.

nonisolated enum ScreenShareUnixSocket {
    /// `sockaddr_un.sun_path` fait 104 octets sur Darwin, terminateur compris.
    static let maxPathLength = 103

    static func isUsablePath(_ path: String) -> Bool {
        !path.isEmpty && path.utf8.count <= maxPathLength
    }

    static func makeStreamSocket() -> Int32? {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var one: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
        return fd
    }

    static func connect(_ fd: Int32, path: String) -> Bool {
        withAddress(path: path) { address, length in Darwin.connect(fd, address, length) == 0 } ?? false
    }

    static func bindAndListen(_ fd: Int32, path: String) -> Bool {
        unlink(path)
        let bound = withAddress(path: path) { address, length in Darwin.bind(fd, address, length) == 0 } ?? false
        return bound && listen(fd, 1) == 0
    }

    static func setSendTimeout(_ fd: Int32, seconds: Int) {
        var timeout = timeval(tv_sec: seconds, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    }

    /// Écrit TOUT le tampon ou rend `false` : une trame à moitié écrite
    /// désaligne le flux pour de bon.
    static func writeAll(_ fd: Int32, data: Data) -> Bool {
        data.withUnsafeBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return true }
            var offset = 0
            while offset < raw.count {
                let written = write(fd, base.advanced(by: offset), raw.count - offset)
                if written < 0, errno == EINTR { continue }
                guard written > 0 else { return false }
                offset += written
            }
            return true
        }
    }

    private static func withAddress<T>(path: String, _ body: (UnsafePointer<sockaddr>, socklen_t) -> T) -> T? {
        guard isUsablePath(path) else { return nil }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let capacity = MemoryLayout.size(ofValue: address.sun_path)
        withUnsafeMutablePointer(to: &address.sun_path) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: capacity) { cPath in
                _ = path.withCString { strncpy(cPath, $0, capacity - 1) }
            }
        }
        return withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                body($0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
    }
}

/// Les notifications Darwin — sans charge utile, elles ne portent qu'un NOM,
/// et c'est tout ce qu'il faut pour dire « commencé / fini / arrête ».
nonisolated enum ScreenShareDarwinNotifications {
    static func post(_ name: String) {
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(name as CFString),
            nil,
            nil,
            true
        )
    }
}

/// Un abonnement à UNE notification Darwin, retiré à la désallocation. Le
/// rappel arrive sur un fil quelconque : c'est au propriétaire de sauter
/// sur sa file.
nonisolated final class ScreenShareDarwinObserver: @unchecked Sendable {
    private let name: String
    private let handler: @Sendable () -> Void

    init(name: String, handler: @escaping @Sendable () -> Void) {
        self.name = name
        self.handler = handler
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            { _, observer, _, _, _ in
                guard let observer else { return }
                Unmanaged<ScreenShareDarwinObserver>.fromOpaque(observer).takeUnretainedValue().handler()
            },
            name as CFString,
            nil,
            .deliverImmediately
        )
    }

    deinit {
        CFNotificationCenterRemoveObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            CFNotificationName(name as CFString),
            nil
        )
    }
}
