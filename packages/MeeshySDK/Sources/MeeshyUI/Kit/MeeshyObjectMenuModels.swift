import SwiftUI

// MARK: - Les ordres de l'hôte

/// Le rôle d'une ligne. La ligne destructive est TOUJOURS rangée en dernier par
/// le kit, quel que soit l'ordre que l'hôte remet.
public nonisolated enum MeeshyObjectMenuRole: String, Sendable, Equatable, CaseIterable {
    case normal
    case destructive
}

/// Le bord de l'ancre où le menu se pose de préférence. Il bascule de l'autre
/// côté quand la place manque.
public nonisolated enum MeeshyObjectMenuEdge: String, Sendable, Equatable, CaseIterable {
    case above
    case below
}

/// L'alignement horizontal : `end` pose le bord de fin du menu près de celui de
/// la référence (le (…) en fin de pilule), `center` le centre sur le contrôle
/// (un point : clic droit, touche Menu).
public nonisolated enum MeeshyObjectMenuAlignment: String, Sendable, Equatable, CaseIterable {
    case end
    case center
}

/// Le fond derrière le menu : `clear` ne se voit pas mais absorbe le toucher,
/// `dim` pose le voile doux sur tout le conteneur.
public nonisolated enum MeeshyObjectMenuBackdrop: String, Sendable, Equatable, CaseIterable {
    case clear
    case dim
}

/// Le retour haptique du choix d'une ligne. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyObjectMenuHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

// MARK: - Une ligne

/// **Une ligne du menu** : une valeur, donc comparable. Ni rappel ni état : l'hôte
/// reçoit l'`id` choisi. Un titre vide retire la ligne ; sans glyphe, le titre
/// seul, sans trou ; `hint` est l'indication lue par le lecteur d'écran.
public nonisolated struct MeeshyObjectMenuItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let systemImage: String?
    public let role: MeeshyObjectMenuRole
    public let hint: String?

    public init(
        id: String,
        title: String,
        systemImage: String? = nil,
        role: MeeshyObjectMenuRole = .normal,
        hint: String? = nil
    ) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.role = role
        self.hint = hint
    }
}

// MARK: - L'ancre

/// Où le menu s'ancre, en coordonnées de la vue qui porte `.meeshyObjectMenu` :
/// le contrôle qui l'ouvre, et la surface de verre qui le porte (jamais
/// recouverte : le menu se pose à côté d'elle, pas dessus).
public nonisolated struct MeeshyObjectMenuAnchor: Sendable, Equatable {
    public let control: CGRect
    public let surface: CGRect?

    public init(control: CGRect, surface: CGRect? = nil) {
        self.control = control
        self.surface = surface
    }

    /// Un point (clic droit, touche Menu) : un contrôle sans taille.
    public init(point: CGPoint) {
        self.init(control: CGRect(origin: point, size: .zero))
    }
}

/// Le rôle d'une vue ancre : le contrôle qui ouvre le menu, ou la surface de
/// verre qui le porte.
public nonisolated enum MeeshyObjectMenuAnchorRole: String, Sendable, Equatable, CaseIterable {
    case control
    case surface
}

/// Les deux cadres que le menu lit, publiés par les vues ancres.
public struct MeeshyObjectMenuAnchorSet: Equatable {
    public var control: Anchor<CGRect>?
    public var surface: Anchor<CGRect>?

    public init(control: Anchor<CGRect>? = nil, surface: Anchor<CGRect>? = nil) {
        self.control = control
        self.surface = surface
    }
}

/// La préférence qui porte les ancres vers l'hôte du menu.
public struct MeeshyObjectMenuAnchorKey: PreferenceKey {
    public static let defaultValue = MeeshyObjectMenuAnchorSet()

    public static func reduce(value: inout MeeshyObjectMenuAnchorSet, nextValue: () -> MeeshyObjectMenuAnchorSet) {
        let next = nextValue()
        if let control = next.control { value.control = control }
        if let surface = next.surface { value.surface = surface }
    }
}

public extension View {
    /// Déclare cette vue comme le contrôle (…) qui ouvre le menu, ou comme la
    /// surface de verre qui le porte (`.surface`).
    func meeshyObjectMenuAnchor(_ role: MeeshyObjectMenuAnchorRole = .control) -> some View {
        anchorPreference(key: MeeshyObjectMenuAnchorKey.self, value: .bounds) { bounds in
            role == .control
                ? MeeshyObjectMenuAnchorSet(control: bounds)
                : MeeshyObjectMenuAnchorSet(surface: bounds)
        }
    }
}
