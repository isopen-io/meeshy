import Combine
import Foundation
import MediaPlayer
import MeeshySDK

/// Le CHOIX de partager mon écoute depuis CET iPhone, par compte (#16803). Éteint par défaut : il s'allume au premier
/// partage accordé à un Proche, avec l'autorisation Médiathèque demandée à ce moment-là — jamais avant. Retirer
/// l'accès à la Médiathèque dans Réglages l'éteint de fait (la source se tait).
@MainActor
final class ListeningSharePreference {

    @Published private(set) var enabled = false

    private let defaults: UserDefaults
    private let userId: () -> String?
    private let requestAuthorization: @MainActor () async -> Bool

    nonisolated deinit {}

    init(
        defaults: UserDefaults = .standard,
        userId: @escaping () -> String?,
        requestAuthorization: @escaping @MainActor () async -> Bool
    ) {
        self.defaults = defaults
        self.userId = userId
        self.requestAuthorization = requestAuthorization
        refresh()
    }

    static func key(for userId: String) -> String { "me.meeshy.listening.share.appleMusic.\(userId)" }

    /// Relire le choix du compte courant (connexion, changement de compte).
    func refresh() {
        enabled = userId().map { defaults.bool(forKey: Self.key(for: $0)) } ?? false
    }

    /// Allumer le partage, après l'autorisation. `false` ⇒ l'accès est refusé : rien ne partira, et l'écran le dit.
    @discardableResult
    func optIn() async -> Bool {
        guard let userId = userId() else { return false }
        guard await requestAuthorization() else { return false }
        defaults.set(true, forKey: Self.key(for: userId))
        enabled = true
        return true
    }

    func optOut() {
        guard let userId = userId() else { return }
        defaults.removeObject(forKey: Self.key(for: userId))
        enabled = false
    }

    /// La demande d'autorisation Médiathèque du système : rien n'est redemandé quand la réponse est déjà donnée.
    nonisolated static func requestMediaLibrary() async -> Bool {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return true
        case .denied, .restricted: return false
        case .notDetermined:
            let status = await withCheckedContinuation { continuation in
                MPMediaLibrary.requestAuthorization { continuation.resume(returning: $0) }
            }
            return status == .authorized
        @unknown default: return false
        }
    }
}
