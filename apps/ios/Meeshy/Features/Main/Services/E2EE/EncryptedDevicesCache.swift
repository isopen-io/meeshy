import Foundation
import MeeshySDK

/// La dernière liste connue de mes appareils chiffrés, par compte, le temps du
/// processus : l'écran rouvert s'affiche à l'instant (cache-first). Elle ne
/// porte aucune clé — des numéros, des noms de modèle, un état d'approbation.
@MainActor
final class EncryptedDevicesCache {
    nonisolated deinit {}

    static let shared = EncryptedDevicesCache()

    private var byUser: [String: [EndToEndOwnDevice]] = [:]

    func devices(for userId: String) -> [EndToEndOwnDevice] { byUser[userId] ?? [] }

    func store(_ devices: [EndToEndOwnDevice], for userId: String) { byUser[userId] = devices }
}

extension EncryptedDevicesViewModel {
    /// Le ViewModel de l'app : le runtime E2EE, le cache du processus, le
    /// moniteur réseau et le compte de la session.
    static func live() -> EncryptedDevicesViewModel {
        EncryptedDevicesViewModel(
            linking: EndToEndMessagingRuntime.shared,
            cache: .shared,
            networkMonitor: NetworkMonitor.shared,
            userId: { AuthManager.shared.currentUser?.id }
        )
    }
}
