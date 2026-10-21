import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que le toucher de l'avatar de l'en-tête ouvre (#10300)

/// L'avatar de l'en-tête d'une conversation OUVRE SA FICHE, comme dans la liste
/// (`ThemedConversationRow`) : le profil du pair d'un direct, les détails de toute
/// autre conversation (groupe, public, global, communauté). Un visiteur sans
/// compte n'ouvre rien de neuf (#10205 — ni détails, ni effectif) : l'avatar garde
/// la bascule de l'en-tête. Miroir de `conversationAvatarDoor`
/// (`apps/web/src/lib/view/thread-header-offer.ts`).
enum ConversationHeaderAvatarDoor: Equatable {
    case profile
    case details
    case toggle

    static func resolve(isDirect: Bool, isGuest: Bool, peerUserId: String?, hasConversation: Bool) -> ConversationHeaderAvatarDoor {
        guard !isGuest, hasConversation else { return .toggle }
        guard isDirect else { return .details }
        guard let peerUserId, !peerUserId.isEmpty else { return .details }
        return .profile
    }

    /// Quand l'avatar ouvre une fiche, la bascule de l'en-tête passe à sa BANDE :
    /// l'espace libre replié, la colonne du titre dépliée. L'aperçu n'a rien à déplier.
    func bandToggles(isPreview: Bool) -> Bool {
        self != .toggle && !isPreview
    }
}

// MARK: - La zone libre de la bande, qui déplie ou replie l'en-tête

/// Posée en FOND d'un contenu de la bande : elle reçoit le toucher là où aucun
/// contrôle ne le prend (l'espace avant la grappe d'actions, la colonne du titre
/// autour du bouton-titre), et prend la taille du contenu — jamais plus.
struct HeaderBandToggleArea: ViewModifier {
    let onToggle: (() -> Void)?

    func body(content: Content) -> some View {
        if let onToggle {
            content.background(
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        HapticFeedback.light()
                        onToggle()
                    }
                    .accessibilityHidden(true)
            )
        } else {
            content
        }
    }
}

// MARK: - Ce que VoiceOver dit de l'avatar

/// L'avatar porte UN élément d'accessibilité : son libellé dit ce que le toucher
/// ouvre (« Voir le profil de Awa », « Voir la conversation Les Amis »), l'action
/// par défaut l'ouvre, et la bascule de l'en-tête — que la zone libre porte à
/// l'œil — ainsi que les entrées du menu d'appui long restent atteignables en
/// actions nommées.
struct HeaderAvatarDoorAccessibility: ViewModifier {
    let label: String
    let toggleLabel: String?
    let menuItems: [AvatarContextMenuItem]
    let onOpen: () -> Void
    let onToggle: () -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onOpen() }
            .accessibilityActions {
                if let toggleLabel {
                    Button(toggleLabel, action: onToggle)
                }
                ForEach(menuItems) { item in
                    Button(item.label, action: item.action)
                }
            }
    }
}

extension ConversationHeaderAvatarDoor {
    /// Le libellé du toucher. `expanded` ne sert qu'à la bascule (visiteur sans compte).
    func accessibilityLabel(name: String, expanded: Bool) -> String {
        switch self {
        case .profile:
            return String(format: String(localized: "conversation.header.avatar.viewProfile", defaultValue: "Voir le profil de %@", bundle: .main), name)
        case .details:
            return String(format: String(localized: "conversation.header.avatar.viewConversation", defaultValue: "Voir la conversation %@", bundle: .main), name)
        case .toggle:
            return Self.toggleLabel(expanded: expanded)
        }
    }

    static func toggleLabel(expanded: Bool) -> String {
        expanded
            ? String(localized: "conversation.header.collapse", defaultValue: "Replier l’en-tête", bundle: .main)
            : String(localized: "conversation.header.expand", defaultValue: "Déplier l’en-tête", bundle: .main)
    }
}
