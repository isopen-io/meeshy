import Foundation
import os

public enum SocketConfig {
    private static let transportSealLock = OSAllocatedUnfairLock(initialState: false)

    public static var baseURL: URL? {
        if let origin = loopbackOrigin, isLoopback(origin) { return origin }
        return baseURL(socketBaseURL: MeeshyConfig.shared.socketBaseURL, isTransportSealed: isTransportSealed)
    }

    /// Origine LOOPBACK liée à la tâche courante, prioritaire sur la
    /// configuration — sceau compris. Un test qui a besoin d'un objet socket
    /// le construit contre `127.0.0.1` : son sondage passe par une session
    /// `.default`, que `NetworkTransportSeal` refuse. Toute autre origine est
    /// ignorée : on ne contourne pas le sceau vers un serveur réel.
    @TaskLocal static var loopbackOrigin: URL?

    static func isLoopback(_ url: URL) -> Bool {
        ["127.0.0.1", "localhost", "::1"].contains(url.host?.lowercased() ?? "")
    }

    /// Les trois constructions de socket (`MessageSocketManager.connect`,
    /// `connectAnonymous`, `SocialSocketManager.connect`) passent par
    /// `baseURL` : une base absente laisse chaque connexion `.notArmed`, sans
    /// rien ouvrir. Le SDK ne décide pas QUAND sceller — l'app le fait (#10854).
    public static func baseURL(socketBaseURL: String, isTransportSealed: Bool) -> URL? {
        guard !isTransportSealed else { return nil }
        return URL(string: socketBaseURL)
    }

    /// Irréversible pour la vie du processus.
    public static func sealTransport() {
        transportSealLock.withLock { $0 = true }
    }

    public static var isTransportSealed: Bool {
        transportSealLock.withLock { $0 }
    }
}
