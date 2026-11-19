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
    /// Le diamètre que l'en-tête repliable (K28) lui donne : 112 sous la bannière, 36 dans la barre (#19589).
    var size: CGFloat = ProfileOwnAvatar.size
    /// Le cadre équipé se pose ici, sauf quand l'hôte le pose lui-même hors d'un conteneur qui découpe (#19925).
    var wearsRing = true

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
            context: .custom(size),
            accentColor: accentColor,
            secondaryColor: MeeshyColors.indigo300Hex,
            avatarURL: user?.avatar,
            moodEmoji: mood,
            onMoodTap: mood == nil ? nil : moodTapResolver?(userId)
        )
        .modifier(ProfileOwnRing(ring: wearsRing ? ring : nil, size: size))
    }

    static let size: CGFloat = AvatarContext.profileBanner.size

    private var ring: AvatarRingDesign? { Self.ring(of: user) }

    static func ring(of user: MeeshyUser?) -> AvatarRingDesign? {
        ProfileDecorResolver.ring(user?.profileDecor?.avatarRing)
    }

    /// #15157 — ce que le cadre illustré peint sous un avatar de `avatarSize` : l'écran le réserve avant le nom.
    /// Vers le haut, le cadre déborde sur la bannière ; sur les côtés, l'écran est libre.
    static func reserveBelow(_ user: MeeshyUser?, avatarSize: CGFloat) -> CGFloat {
        AvatarRingLayout.paintBeyondAvatar(ring(of: user), avatarSize: avatarSize)
    }
}

/// Le cadre équipé, avec toute la place que son film demande autour de sa boîte : il se voit en entier (#15157).
struct ProfileOwnRing: ViewModifier {
    let ring: AvatarRingDesign?
    let size: CGFloat

    func body(content: Content) -> some View {
        content.avatarRing(ring, avatarSize: size, decorRoom: AvatarRingLayout.fullSpill(ring, box: size * 100 / 84))
    }
}
