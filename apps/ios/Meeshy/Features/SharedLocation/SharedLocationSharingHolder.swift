import Combine
import Foundation
import MeeshySDK

/// Le centre du compte connecté : un autre compte sur le même appareil repart d'une liste vide.
enum SharedLocationSharingHolder {
    private static var current: (userId: String, center: SharedLocationSharingCenter)?
    private static var accountWatch: AnyCancellable?

    /// Le centre naît avec la session du compte, pas avec la première fiche ouverte : un retrait ou une échéance gardés
    /// d'un lancement précédent partent à la première socket accrochée, même si l'on n'ouvre aucun profil (#18204).
    static func followAccounts() {
        accountWatch = warmOnEachAccount(AuthManager.shared.$currentUser.map { $0?.id }.eraseToAnyPublisher()) { _ = center() }
    }

    /// Réveille `warm` une fois par compte connecté, jamais pour une session sans compte.
    static func warmOnEachAccount(_ accounts: AnyPublisher<String?, Never>, warm: @escaping () -> Void) -> AnyCancellable {
        accounts
            .compactMap { $0.flatMap { $0.isEmpty ? nil : $0 } }
            .removeDuplicates()
            .sink { _ in warm() }
    }

    /// La liste du compte, marquée par l'identifiant d'installation que le trousseau TIENT : un identifiant de passage
    /// ferait prendre cet appareil pour un autre et effacerait sa liste (#19929).
    static func rosterStore(
        userId: String,
        keychain: any KeychainStoring = KeychainManager.shared,
        defaults: UserDefaults = .standard
    ) -> UserDefaultsSharedLocationRosterStore {
        UserDefaultsSharedLocationRosterStore(
            userId: userId,
            deviceId: PushDeviceIdentity.settledInstallationId(keychain: keychain),
            defaults: defaults
        )
    }

    static func center() -> SharedLocationSharingCenter {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.center }
        current?.center.abandon()
        let center = SharedLocationSharingCenter(
            emitter: SharedLocationMotionTaggingEmitter(inner: SharedLocationSocketEmitter.shared, motion: SharedLocationMotionSource()),
            fixes: SharedLocationFixSource(),
            store: rosterStore(userId: userId),
            owner: userId,
            currentAccount: { AuthManager.shared.currentUser?.id },
            socketReady: MessageSocketManager.shared.$connectionState
                .map { $0 == .connected }
                .removeDuplicates()
                .filter { $0 }
                .map { _ in () }
                .eraseToAnyPublisher(),
            ownChanged: SharedLocationEvents.ownChanged,
            served: { try await SharedLocationServedRead.answer { try await RelationsService.shared.ownSharedLocation() } }
        )
        current = (userId, center)
        return center
    }
}
