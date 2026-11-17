import Foundation
import MeeshySDK

/// Le compte qu'un toucher de bannière vise (#18911, ios-systeme-6) : celui que
/// l'appareil désigne au moment du toucher, jamais déduit plus tard.
@MainActor
enum PushTapAddressee {
    /// `currentUser` est vide app tuée, avant la restauration de session : le
    /// compte actif tel que le trousseau le garde fait alors foi (`nil` après
    /// une déconnexion).
    static func currentUserId() -> String? {
        AuthManager.shared.currentUser?.id ?? AuthManager.shared.persistedActiveUserId
    }

    /// `nil` sans compte, ou quand la charge nomme un AUTRE destinataire : la même
    /// loi que les actions de bannière, `NotificationReplyFailure.isAddressed`.
    /// Une charge APNs ne nomme pas encore son destinataire (#8668) : sous une
    /// session ouverte, c'est le compte actif qui fait foi.
    static func resolve(userInfo: [AnyHashable: Any], currentUserId: String?) -> String? {
        guard let userId = currentUserId,
              NotificationReplyFailure.isAddressed(to: userId, userInfo: userInfo) else { return nil }
        return userId
    }

    /// Le défaut d'ouverture d'un toucher : la charge publiée porte le compte
    /// désigné AU toucher. Une charge non marquée serait effacée par la porte.
    static func publishTap(
        _ userInfo: [AnyHashable: Any],
        currentUserId: String?,
        publish: (_ userInfo: [AnyHashable: Any], _ addressedTo: String?) -> Void
    ) {
        publish(userInfo, resolve(userInfo: userInfo, currentUserId: currentUserId))
    }

    /// La porte de consommation, montée par la racine : sans session, la charge
    /// attend (le démarrage à froid publie avant la restauration) ; sous une
    /// session, elle navigue si elle vise ce compte, et s'efface dans tous les cas.
    static func consume(
        _ payload: NotificationPayload?,
        isAuthenticated: Bool,
        currentUserId: String?,
        navigate: (NotificationPayload) -> Void,
        clear: () -> Void
    ) {
        guard let payload, isAuthenticated else { return }
        if PushTapConsumption.decide(payload: payload, currentUserId: currentUserId) == .navigate {
            navigate(payload)
        }
        clear()
    }
}
