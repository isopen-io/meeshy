import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'avatar de MON profil, avec mon humeur (#10529).
///
/// `ProfileView` peignait l'avatar nu : l'humeur que tous les autres écrans
/// montrent sur mon avatar manquait sur le seul écran qui me présente. Elle
/// vient des résolveurs de chrome social (`meeshySocialChrome`), déjà servis
/// par le cache des statuts — aucune requête. Absents, ils DÉGRADENT : pas de
/// pastille.
struct ProfileOwnAvatar: View {
    let user: MeeshyUser?
    let accentColor: String
    /// En édition, le crayon occupe le coin de la pastille.
    let isEditing: Bool

    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver

    /// L'humeur peinte : la mienne, sauf pendant l'édition.
    static func shownMood(_ emoji: String?, isEditing: Bool) -> String? {
        isEditing ? nil : emoji
    }

    var body: some View {
        let userId = user?.id ?? ""
        let mood = Self.shownMood(moodEmojiResolver?(userId), isEditing: isEditing)
        MeeshyAvatar(
            name: user?.displayName ?? user?.username ?? "?",
            context: .profileBanner,
            accentColor: accentColor,
            secondaryColor: MeeshyColors.indigo300Hex,
            avatarURL: user?.avatar,
            moodEmoji: mood,
            onMoodTap: mood == nil ? nil : moodTapResolver?(userId)
        )
        .avatarRing(ProfileDecorResolver.ring(user?.profileDecor?.avatarRing), avatarSize: AvatarContext.profileBanner.size)
    }
}
