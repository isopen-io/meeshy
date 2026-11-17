import SwiftUI

// MARK: - « Carte » dans la grille « Parler » (#18872, loi 6)

/// L'action « Carte » de la fiche d'un autre (K32) : elle ouvre en plein écran la carte que l'app fournit, la fiche y
/// devenant la feuille basse. Elle tient sa propre présentation : la fiche ne porte que la requête.
struct ProfileLocationMapAction: View {
    let map: ProfileLocationMap
    let request: ProfileLocationMapRequest
    let tint: Color

    @State private var isOpen = false

    var body: some View {
        MeeshyLabeledAction(title: Self.title, systemImage: "map", tint: tint, hint: Self.hint, action: { isOpen = true })
            .keyboardShortcut("m", modifiers: .command)
            .fullScreenCover(isPresented: $isOpen) { map.destination(request) }
    }

    static var title: String {
        String(localized: "profile.relation.action.map", defaultValue: "Carte", bundle: .module)
    }

    static var hint: String {
        String(localized: "profile.relation.action.map.hint", defaultValue: "Voir sur la carte", bundle: .module)
    }
}

/// La carte comme action (#18872) : ce que la fiche remet à la carte, et la même fiche posée à côté de la carte sur
/// iPad (planche iPad-Split) ; l'hôte lui retire « Carte », déjà ouverte.
enum ProfileBesideTheMap {
    static func request(of sheet: UserProfileSheet, onCall: (() -> Void)?) -> ProfileLocationMapRequest? {
        guard let userId = sheet.resolvedUserId, !userId.isEmpty, !sheet.isCurrentUser else { return nil }
        return ProfileLocationMapRequest(userId: userId, displayName: sheet.displayUser.resolvedDisplayName,
                                         onWrite: sheet.isInteractionDisabled ? nil : { sheet.openConversation() },
                                         onCall: onCall,
                                         profile: { view(of: sheet) })
    }

    static func view(of sheet: UserProfileSheet) -> UserProfileSheet {
        UserProfileSheet(
            user: sheet.user,
            onDismiss: sheet.onDismiss,
            onNavigateToConversation: sheet.onNavigateToConversation,
            onSendMessage: sheet.onSendMessage,
            moodEmoji: sheet.moodEmoji,
            onMoodTap: nil,
            presenceProvider: sheet.presenceProvider,
            storyRingState: sheet.storyRingState,
            onViewStory: sheet.onViewStory,
            postsContent: sheet.postsContent,
            onCall: sheet.onCall,
            dependencies: sheet.dependencies
        )
    }
}

// MARK: - Bloquer, signaler

/// Bloquer (ou débloquer) et signaler, séparés en bas de la face Actions, en couleur d'erreur (K40 destructif).
struct ProfileSafetyButtons: View {
    let isBlocked: Bool
    let onUnblock: () -> Void
    let onBlock: () -> Void
    let onReport: () -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            if isBlocked {
                MeeshyButton(
                    String(localized: "profile.action.unblockUser", defaultValue: "Débloquer l'utilisateur", bundle: .module),
                    systemImage: "hand.raised.slash", kind: .outline, width: .fill, action: onUnblock
                )
            } else {
                MeeshyButton(
                    String(localized: "profile.action.blockUser", defaultValue: "Bloquer cet utilisateur", bundle: .module),
                    systemImage: ProfileRelationAction.block.systemImage, kind: .danger, width: .fill, isDestructive: true,
                    action: onBlock
                )
            }
            MeeshyButton(
                String(localized: "profile.action.report", defaultValue: "Signaler", bundle: .module),
                systemImage: ProfileRelationAction.report.systemImage, kind: .danger, width: .fill, isDestructive: true,
                action: onReport
            )
        }
        .padding(.top, MeeshySpacing.md)
    }
}
