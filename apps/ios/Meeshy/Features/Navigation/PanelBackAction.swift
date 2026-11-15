import SwiftUI

// MARK: - Panel Dismiss Environment
//
// `iPadRootView` pose ses écrans secondaires (Réglages, Stats, Liens…) dans la
// colonne de droite — hors `NavigationStack`, hors sheet. Dans ce contexte
// `@Environment(\.dismiss)` est un NO-OP silencieux : chaque bouton retour de
// ces écrans était mort sur iPad.
//
// Cette clé transporte « comment fermer le panneau » depuis `iPadRootView`
// jusqu'aux écrans, sans EnvironmentObject (une sheet n'hérite pas des
// EnvironmentObject mais hérite des EnvironmentValues — cf. le crash
// UserProfileSheet documenté dans iPadRootView+Sheets).

private struct MeeshyPanelDismissKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// Ferme le panneau droit iPad qui héberge la vue. `nil` partout ailleurs
    /// (iPhone `NavigationStack`, sheets) : l'absence de valeur EST le signal
    /// « je ne suis pas dans un panneau ».
    var meeshyPanelDismiss: (() -> Void)? {
        get { self[MeeshyPanelDismissKey.self] }
        set { self[MeeshyPanelDismissKey.self] = newValue }
    }
}

// MARK: - Resolver (pur, testable)

// `nonisolated` sur le TYPE (pas seulement sur les membres) : la cible compile
// sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, ce qui isolerait jusqu'à la
// conformance `Equatable` — inutilisable depuis un test synchrone nonisolated.
nonisolated enum PanelBackTarget: Equatable {
    case dismiss
    case panel
}

nonisolated enum PanelBackResolver {
    /// `isPresented` prime sur la closure de panneau : une sheet ouverte depuis
    /// le panneau hérite de `meeshyPanelDismiss`, et fermer le panneau au lieu
    /// de la sheet laisserait la modale orpheline au-dessus du vide.
    static func resolve(isPresented: Bool, hasPanelDismiss: Bool) -> PanelBackTarget {
        if isPresented { return .dismiss }
        return hasPanelDismiss ? .panel : .dismiss
    }
}

// MARK: - Action

/// Retour arrière qui fonctionne dans les trois contextes de présentation.
/// Usage :
/// ```swift
/// @Environment(\.isPresented) private var isPresented
/// @Environment(\.dismiss) private var dismiss
/// @Environment(\.meeshyPanelDismiss) private var panelDismiss
/// private var back: PanelBackAction { .init(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss) }
/// ...
/// Button { back() } label: { Image(systemName: "chevron.backward") }
/// ```
@MainActor
struct PanelBackAction {
    let isPresented: Bool
    let dismiss: DismissAction
    let panelDismiss: (() -> Void)?

    func callAsFunction() {
        switch PanelBackResolver.resolve(isPresented: isPresented, hasPanelDismiss: panelDismiss != nil) {
        case .panel:
            panelDismiss?()
        case .dismiss:
            dismiss()
        }
    }
}
