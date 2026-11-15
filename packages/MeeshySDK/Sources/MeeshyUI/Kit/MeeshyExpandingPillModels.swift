import SwiftUI

/// **L'option ouverte dans la pilule** (K11) : une valeur, donc comparable. Son
/// `id` décide du fondu enchaîné (même `id`, aucun mouvement) ; `title` est à la
/// fois le nom dit du panneau et le titre peint quand `showsHeader` ; `keepsRow`
/// garde la rangée de la pilule en pied.
public nonisolated struct MeeshyExpandingPillOption: Equatable, Sendable {
    public let id: String
    public let title: String
    public let showsHeader: Bool
    public let keepsRow: Bool

    public init(id: String, title: String, showsHeader: Bool = true, keepsRow: Bool = true) {
        assert(!title.isEmpty, "MeeshyExpandingPillOption : le titre est obligatoire et non vide")
        self.id = id
        self.title = title
        self.showsHeader = showsHeader
        self.keepsRow = keepsRow
    }

    /// Une confirmation n'a ni en-tête ni rangée : elle se pose dans la pilule seule.
    public var isConfirmation: Bool { !showsHeader && !keepsRow }
}

/// Le rôle d'un choix de confirmation : le neutre garde, le destructif détruit.
public nonisolated enum MeeshyPillChoiceRole: String, Sendable, Equatable, CaseIterable {
    case neutral
    case destructive
}

/// **Un choix d'une confirmation** : son libellé (déjà traduit), son rôle, un
/// indice pour le lecteur d'écran et ce qu'il fait. Les fermetures restent hors
/// de la comparaison : l'hôte les garde stables.
public nonisolated struct MeeshyPillChoice {
    public let title: String
    public let role: MeeshyPillChoiceRole
    public let hint: String?
    public let action: () -> Void

    public init(
        title: String,
        role: MeeshyPillChoiceRole = .neutral,
        hint: String? = nil,
        action: @escaping () -> Void
    ) {
        assert(!title.isEmpty, "MeeshyPillChoice : le libellé est obligatoire et non vide")
        self.title = title
        self.role = role
        self.hint = hint
        self.action = action
    }
}

nonisolated extension MeeshyPillChoice: Equatable {
    public static func == (lhs: MeeshyPillChoice, rhs: MeeshyPillChoice) -> Bool {
        lhs.title == rhs.title && lhs.role == rhs.role && lhs.hint == rhs.hint
    }
}
