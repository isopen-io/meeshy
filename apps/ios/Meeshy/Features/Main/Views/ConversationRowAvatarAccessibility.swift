import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'avatar d'une ligne, bouton à part pour VoiceOver (#15887)
//
// L'avatar était fondu dans l'élément combiné de la ligne : VoiceOver lisait
// « Conversation avec X… » et le double-toucher ouvrait le fil. Le profil, les
// détails, la story et le menu de l'avatar n'avaient aucun accès non visuel.
// L'avatar dessiné est désormais masqué à VoiceOver, et un élément frère —
// posé par `ConversationRowItem` sur la racine de la ligne — dit ce qu'il
// ouvre, porte le trait bouton et expose son menu en actions.

/// Une action VoiceOver de l'avatar : une entrée de son menu, ou sa story.
nonisolated enum ConversationAvatarA11yAction: Hashable {
    case menu(AvatarMenuRole)
    case viewStory

    var name: String {
        switch self {
        case .menu(let role): role.label
        case .viewStory: String(localized: "bubble.avatar.viewStory", defaultValue: "Voir la story", bundle: .main)
        }
    }
}

/// Ce que VoiceOver dit de l'avatar d'une ligne.
enum ConversationAvatarSpeech {
    /// « Voir le profil de X » quand il ouvre un profil, « Détails de Y »
    /// sinon — verrouillée comprise : le PIN est une étape, pas une
    /// destination. Le nom garde ce que l'avatar disait de lui-même : son
    /// humeur (#10528) et « dans la conversation » (#8892).
    static func label(route: ConversationAvatarRoute, name: String, moodEmoji: String?, isHere: Bool) -> String {
        let spoken = MeeshyAvatar.spokenName(name: name, moodEmoji: moodEmoji, isHere: isHere)
        let format = route.opensProfile
            ? String(localized: "conversation.row.avatar.a11y.profile", defaultValue: "Voir le profil de %@", bundle: .main)
            : String(localized: "conversation.row.avatar.a11y.details", defaultValue: "Détails de %@", bundle: .main)
        return String(format: format, spoken)
    }

    /// Les entrées du menu de l'avatar, dans son ordre, puis sa story.
    static func actions(roles: [AvatarMenuRole], hasStory: Bool) -> [ConversationAvatarA11yAction] {
        roles.map(ConversationAvatarA11yAction.menu) + (hasStory ? [.viewStory] : [])
    }
}

/// L'élément VoiceOver de l'avatar : transparent au doigt, qui atteint
/// l'avatar dessiné dessous (story, profil, humeur, menu), et au moins aussi
/// large qu'une cible tactile.
struct ConversationRowAvatarAccessibilityProxy: View {
    let label: String
    let actions: [ConversationAvatarA11yAction]
    let bandWidth: CGFloat
    let onActivate: () -> Void
    let perform: (ConversationAvatarA11yAction) -> Void

    var body: some View {
        Color.clear
            .frame(width: bandWidth)
            .frame(minHeight: MeeshyControlSize.tapTarget, maxHeight: .infinity)
            .contentShape(Rectangle())
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onActivate() }
            .accessibilityActions {
                ForEach(actions, id: \.self) { action in
                    Button(action.name) { perform(action) }
                }
            }
    }
}
