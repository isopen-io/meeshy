import SwiftUI

// MARK: - « Carte » dans la grille « Parler » (#18872, loi 6)

/// L'action « Carte » de la fiche d'un autre (K32) : elle ouvre en plein écran la carte que l'app fournit, la fiche y
/// devenant la feuille basse. Elle tient sa propre présentation : la fiche ne porte que la requête. ⌘M y est donné une
/// fois, et sa touche se montre sous le libellé sur iPad quand un clavier est branché (#19515).
struct ProfileLocationMapAction: View {
    let map: ProfileLocationMap
    let request: ProfileLocationMapRequest
    let tint: Color
    /// Hors ligne, « dernière position connue » : la carte s'ouvre sur ce qu'on sait déjà (planche `Etat-HorsLigne`).
    var value: String? = nil

    @State private var isOpen = false

    var body: some View {
        MeeshyLabeledAction(title: Self.title, systemImage: "map", value: value, valueKind: .quiet, tint: tint,
                            shortcut: ProfileKeyShortcuts.map, action: { isOpen = true })
            .meeshyHardwareKeyboardHost()
            .fullScreenCover(isPresented: $isOpen) { map.destination(request) }
    }

    static var title: String {
        String(localized: "profile.relation.action.map", defaultValue: "Carte", bundle: .module)
    }

    /// Le nom du raccourci ⌘M, que montre la liste des raccourcis du clavier.
    static var openTitle: String {
        String(localized: "profile.relation.action.map.open", defaultValue: "Voir sur la carte", bundle: .module)
    }
}

/// La position servie d'une fiche, à sa place : l'action « Carte » de « Parler », ou la section « Où il est ».
/// Rien quand la place demandée n'est pas celle que la fiche résout.
struct ProfileWhereSlot: View {
    let map: ProfileLocationMap?
    let request: ProfileLocationMapRequest?
    let tint: Color
    let isDisabled: Bool
    let placement: ProfileWherePlacement

    /// Tout se lit dans le corps de la fiche ; la place ne reçoit que des valeurs.
    static func of(_ sheet: UserProfileSheet, _ placement: ProfileWherePlacement) -> ProfileWhereSlot {
        let onCall: (() -> Void)? = sheet.offersCall ? { sheet.requestCall(isVideo: false) } : nil
        return ProfileWhereSlot(map: sheet.locationMap, request: ProfileBesideTheMap.request(of: sheet, onCall: onCall),
                                tint: sheet.accentTint, isDisabled: sheet.isInteractionDisabled, placement: placement)
    }

    var body: some View {
        if let map, let request, map.placement(for: request.userId) == placement {
            switch placement {
            case .action: ProfileLocationMapAction(map: map, request: request, tint: tint)
            case .card: ProfileWhereSection(map: map, request: request).disabled(isDisabled).padding(.bottom, MeeshySpacing.xxl)
            case .none: EmptyView()
            }
        }
    }
}

/// « Où il est » (#18872, planche Autre-Actions) : la carte de la position servie que l'app dessine (K43), qui ouvre la
/// carte en plein écran par « Voir sur la carte » ou ⌘M. Elle remplace l'action « Carte » de « Parler ».
struct ProfileWhereSection: View {
    let map: ProfileLocationMap
    let request: ProfileLocationMapRequest

    @State private var isOpen = false

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: Self.title)
            if let preview = map.preview {
                preview(request, { isOpen = true })
            }
        }
        .background {
            Button(ProfileLocationMapAction.openTitle) { isOpen = true }
                .meeshyKeyShortcut(ProfileKeyShortcuts.map)
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        }
        .meeshyHardwareKeyboardHost()
        .fullScreenCover(isPresented: $isOpen) { map.destination(request) }
    }

    static var title: String {
        String(localized: "profile.relation.section.where", defaultValue: "Où il est", bundle: .module)
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
