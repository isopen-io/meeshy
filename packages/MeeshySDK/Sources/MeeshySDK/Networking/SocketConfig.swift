import Foundation
import os

public enum SocketConfig {
    private static let transportSealLock = OSAllocatedUnfairLock(initialState: false)

    public static var baseURL: URL? {
        baseURL(socketBaseURL: MeeshyConfig.shared.socketBaseURL, isTransportSealed: isTransportSealed)
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
