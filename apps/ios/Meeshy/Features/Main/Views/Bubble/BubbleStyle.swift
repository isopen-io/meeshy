import Foundation
import MeeshySDK
import MeeshyUI

/// Toutes les valeurs visuelles dérivées du contexte (theme, conversation,
/// position dans le groupe). Passées en `let` aux sous-vues — aucune sous-vue
/// ne doit observer un singleton ThemeManager. Conformément au principe
/// "Zero Unnecessary Re-render" des Instant App Principles.
struct BubbleStyle: Equatable {
    let isDark: Bool
    let accentColorHex: String              // contactColor (was)
    let isLastInGroup: Bool
    let isLastReceivedMessage: Bool
    let showAvatar: Bool
    let isDirect: Bool
    let presenceState: PresenceState?
    let senderMoodEmoji: String?
    let senderStoryRingState: StoryRingState
    let highlightSearchTerm: String?
    let mentionDisplayNames: [String: String]
    let userLanguages: UserLanguages

    struct UserLanguages: Equatable {
        let regional: String?
        let custom: String?
    }
}
