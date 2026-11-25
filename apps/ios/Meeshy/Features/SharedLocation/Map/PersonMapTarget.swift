import SwiftUI
import MeeshySDK

/// La carte d'UNE personne, demandée hors de sa fiche (#20540) : « Lina est tout près » ouvre la carte de Lina, centrée
/// sur les deux, depuis le push, la bannière in-app et la liste des notifications. La racine la présente en plein écran
/// (`PersonMapCover`), le routeur la pose (`Router.presentPersonMap`).
struct PersonMapTarget: Identifiable, Equatable {
    let userId: String
    let displayName: String

    var id: String { userId }

    /// La carte qu'une notification touchée ouvre, `nil` pour tout ce qui n'est pas l'approche d'un Sang. L'autre Sang
    /// est `userId` (métadonnée ou clé du push) ; à défaut, l'expéditeur, que la passerelle pose au même id.
    static func forNotification(type: MeeshyNotificationType, subjectUserId: String?, senderId: String?,
                                displayName: String?) -> PersonMapTarget? {
        guard type == .bloodProximity,
              let userId = [subjectUserId, senderId].compactMap({ $0 }).first(where: { !$0.isEmpty }) else { return nil }
        return PersonMapTarget(userId: userId, displayName: displayName ?? "")
    }
}

/// Le plein écran de la carte d'une personne, posé par la racine (iPhone et iPad) sur `Router.presentedPersonMap`.
struct PersonMapCover: ViewModifier {
    @ObservedObject var router: Router

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $router.presentedPersonMap) { target in
            PersonLocationMapScreen(userId: target.userId, displayName: target.displayName)
        }
    }
}
