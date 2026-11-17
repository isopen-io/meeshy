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

    /// `nil` sans compte, ou quand la charge nomme un AUTRE destinataire (push
    /// FCM du compte A touché pendant que B est actif) : la même loi que les
    /// actions de bannière, `NotificationReplyFailure.isAddressed`.
    static func resolve(userInfo: [AnyHashable: Any], currentUserId: String?) -> String? {
        guard let userId = currentUserId,
              NotificationReplyFailure.isAddressed(to: userId, userInfo: userInfo) else { return nil }
        return userId
    }
}
