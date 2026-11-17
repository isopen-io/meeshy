import Combine
import MeeshySDK

/// Une session que le SERVEUR a close (mot de passe changé, « déconnecter tous
/// les appareils », action admin) ne passe pas par `leaveActiveSession` : ses
/// aperçus restaient dans le Centre de notifications et passaient sous le compte
/// suivant (#18911, audit du lot). Elle vide le Centre et oublie le jeton APNs de
/// la session, comme une déconnexion ; le jeton VoIP part avec le plan de
/// fermeture (`.unregisterVoIP`).
@MainActor
enum RevokedSessionPurge {
    private static var subscription: AnyCancellable?

    /// Branché une fois, depuis `MeeshyApp.init()`.
    static func install(
        sessionInvalidated: AnyPublisher<Void, Never> = AuthManager.shared.sessionInvalidated.eraseToAnyPublisher(),
        purge: @escaping @MainActor () -> Void = { RevokedSessionPurge.purgeRevokedSession() }
    ) {
        subscription = sessionInvalidated.sink { _ in purge() }
    }

    static func purgeRevokedSession() {
        NotificationCoordinator.shared.reset(purgingDeliveredNotifications: true)
        PushNotificationManager.shared.resetSession()
    }
}
