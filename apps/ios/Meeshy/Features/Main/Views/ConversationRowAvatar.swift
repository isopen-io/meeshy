import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Avatar d'une ligne de conversation (partagé par les deux rangs)

/// Avatar des DEUX rangs de la liste de conversations (`ThemedConversationRow`,
/// `LentilleConversationRow`) : mêmes propriétés, même menu contextuel (rôles
/// de `ConversationAvatarMenu`), même appel à `MeeshyAvatar`. Ce qui diffère
/// d'un rang à l'autre se range dans `Style`, jamais dans une seconde copie.
///
/// Struct extraite (et non une propriété calculée du rang) pour éviter les
/// problèmes PAC entre `@State` et les closures échappantes.
struct ConversationRowAvatar: View {

    /// Les quatre réglages qui distinguent les deux rangs.
    struct Style {
        /// Contexte d'avatar passé à `MeeshyAvatar` (taille de l'avatar).
        let context: AvatarContext
        /// `true` : la présence n'est servie qu'aux conversations directes ;
        /// `false` : un groupe reçoit aussi son agrégat de présence.
        let presenceOnlyForDirect: Bool
        /// `nil` : le défaut du contexte ; `false` : jamais de pulsation au repos.
        let enablePulse: Bool?
        /// Le tap sur le point « en ligne » affiche « vu il y a … ».
        let showsLastSeenTooltip: Bool

        /// Rang historique (`ThemedConversationRow`) : 52 pt, présence des directes seules.
        static let classic = Style(
            context: .conversationList,
            presenceOnlyForDirect: true,
            enablePulse: nil,
            showsLastSeenTooltip: true
        )

        /// Rang plat Lentille : 44 pt, présence aussi pour les groupes, aucune pulsation (#9868).
        static let lentille = Style(
            context: LentilleMetrics.Avatar.context,
            presenceOnlyForDirect: false,
            enablePulse: false,
            showsLastSeenTooltip: false
        )
    }

    let style: Style
    let conversation: Conversation
    let palette: ConversationColorPalette
    let presenceState: PresenceState?
    let isPeerHere: ConversationHere
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil
    var avatarRoute: ConversationAvatarRoute = .info

    @State private var showLastSeenTooltip = false

    private var isDirect: Bool { conversation.type == .direct }

    private var listenedUserId: String? { ConversationRowListening.userId(for: conversation) }

    private var servedPresenceState: PresenceState? {
        style.presenceOnlyForDirect && !isDirect ? nil : presenceState
    }

    private var contextMenuItems: [AvatarContextMenuItem] {
        ConversationAvatarMenu.roles(
            type: conversation.type, opensProfile: avatarRoute.opensProfile, hasShareAction: onCreateShareLink != nil
        ).map { menuItem(for: $0) }
    }

    private func menuItem(for role: AvatarMenuRole) -> AvatarContextMenuItem {
        let action: (() -> Void)? = switch role {
        case .conversationInfo: onViewConversationInfo
        case .profile: onViewProfile
        case .shareLink: onCreateShareLink
        }
        return AvatarContextMenuItem(label: role.label, icon: role.icon) { action?() }
    }

    private var onlineTapAction: (() -> Void)? {
        guard style.showsLastSeenTooltip else { return nil }
        return {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                showLastSeenTooltip = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation(.easeOut(duration: 0.2)) {
                    showLastSeenTooltip = false
                }
            }
        }
    }

    var body: some View {
        ZStack {
            MeeshyAvatar(
                name: conversation.name,
                context: style.context,
                accentColor: palette.primary,
                secondaryColor: palette.secondary,
                avatarURL: isDirect ? conversation.participantAvatarURL : conversation.avatar,
                storyState: storyRingState,
                moodEmoji: moodStatus?.moodEmoji,
                // behaviour-matrix:L10 — la règle « un seul coin, mood gagne, présence
                // sinon » vit dans MeeshyAvatar (§1.3, frozen) ; `presenceState` porte
                // déjà `.offline` = aucun dot. Le style décide seulement si un groupe
                // reçoit son agrégat (Lentille) ou non (rang historique).
                presenceState: servedPresenceState,
                isHere: isDirect ? isPeerHere : .absent,
                // LE CONTOUR DU PAIR (#10713, #10757) — l'avatar le pose dans son empreinte,
                // l'anneau de story concentrique à l'intérieur (#10714).
                ring: isDirect ? conversation.participantRing : nil,
                enablePulse: style.enablePulse,
                // Tap → story (si non lue) sinon ce que la loi décide (#15887) : le
                //   profil du pair, sinon les détails — jamais rien. Le handler profil
                //   passe par `onTap` (et NON `onViewProfile`) pour ne pas déclencher
                //   l'auto-injection d'une entrée « Voir le profil » codée en dur
                //   par MeeshyAvatar. L'entrée localisée vient de `contextMenuItems`.
                onTap: avatarRoute.opensProfile ? onViewProfile : onViewConversationInfo,
                onViewProfile: nil,
                onViewStory: (isDirect && storyRingState != .none) ? onViewStory : nil,
                onMoodTap: onMoodBadgeTap,
                onOnlineTap: onlineTapAction,
                contextMenuItems: contextMenuItems
            )
            // Ce qu'écoute le pair d'un direct (#16733), sur les DEUX rangs : le bandeau que le serveur a servi.
            .overlay { AvatarListeningOverlay(userId: listenedUserId, avatarSize: style.context.size) }

            if showLastSeenTooltip, let text = conversation.lastSeenLabel {
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xs)
                    .background(
                        Capsule()
                            .fill(Color.black.opacity(MeeshyOpacity.heavy))
                    )
                    .offset(x: 0, y: -34)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityHidden(true)
            }
        }
        // Hors de la fusion VoiceOver de la ligne : l'élément frère posé par
        // `ConversationRowItem` parle pour lui (#15887).
        .accessibilityHidden(true)
    }
}
