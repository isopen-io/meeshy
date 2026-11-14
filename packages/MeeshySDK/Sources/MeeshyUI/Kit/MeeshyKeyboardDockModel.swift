import CoreGraphics
import Foundation

/// Ce que le champ montre sous la barre : le clavier du système, ou le panneau d'un outil. Jamais les deux.
public nonisolated enum MeeshyKeyboardDockInput: Equatable, Sendable {
    case keyboard
    case panel(String)

    public var panelID: String? {
        if case .panel(let id) = self { return id }
        return nil
    }
}

/// Un outil de la barre : un panneau qui prend la place du clavier, ou une action simple (`opensPanel` faux).
/// L'identifiant est opaque, le nom est obligatoire et jamais peint.
public nonisolated struct MeeshyKeyboardDockItem: Hashable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let systemImage: String
    public let opensPanel: Bool
    public let isEnabled: Bool
    public let hint: String?
    public let value: String?

    public init(
        id: String,
        label: String,
        systemImage: String,
        opensPanel: Bool = true,
        isEnabled: Bool = true,
        hint: String? = nil,
        value: String? = nil
    ) {
        self.id = id
        self.label = label
        self.systemImage = systemImage
        self.opensPanel = opensPanel
        self.isEnabled = isEnabled
        self.hint = hint
        self.value = value
    }
}

/// La validation « OK » : son texte, le nom dit au lecteur d'écran, l'action. K17 ne termine rien lui-même.
/// Comparable sur ses valeurs : la fermeture n'en fait pas partie.
public nonisolated struct MeeshyKeyboardDockConfirm: Equatable {
    public let title: String
    public let label: String
    public let hint: String?
    public let isEnabled: Bool
    public let action: () -> Void

    public init(
        title: String,
        label: String,
        hint: String? = nil,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.label = label
        self.hint = hint
        self.isEnabled = isEnabled
        self.action = action
    }

    /// L'action part une fois ; rien si la validation est désactivée.
    public func perform() {
        guard isEnabled else { return }
        action()
    }

    public static func == (lhs: MeeshyKeyboardDockConfirm, rhs: MeeshyKeyboardDockConfirm) -> Bool {
        lhs.title == rhs.title && lhs.label == rhs.label && lhs.hint == rhs.hint && lhs.isEnabled == rhs.isEnabled
    }
}

/// La place que le dock occupe, publiée à l'hôte une fois par mouvement du clavier : l'hôte réduit sa scène
/// de `reserve` (recouvrement du clavier, accessoire compris, plus l'écart de scène ; 0 quand le clavier
/// flotte ou est rangé), dans le mouvement de `durationMs`.
public nonisolated struct MeeshyKeyboardDockPlace: Equatable, Sendable {
    public let reserve: CGFloat
    public let keyboard: CGFloat
    public let durationMs: Int
    public let isFloating: Bool

    public init(reserve: CGFloat, keyboard: CGFloat, durationMs: Int, isFloating: Bool) {
        self.reserve = reserve
        self.keyboard = keyboard
        self.durationMs = durationMs
        self.isFloating = isFloating
    }
}

/// Une valeur par mouvement : une place identique à la précédente n'est pas republiée.
public nonisolated struct MeeshyKeyboardDockPlaceGate: Sendable {
    private var last: MeeshyKeyboardDockPlace?

    public init() {}

    public mutating func publish(_ place: MeeshyKeyboardDockPlace) -> MeeshyKeyboardDockPlace? {
        guard place != last else { return nil }
        last = place
        return place
    }
}
