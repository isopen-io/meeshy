import SwiftUI

/// Les trois formes : la rangée, la tuile d'une grille, la mention en ligne.
public nonisolated enum MeeshyLockedRowForm: String, Sendable, Equatable, CaseIterable {
    case row
    case tile
    case inline
}

/// Le geste pour obtenir ce qui est fermé : « Demander », « Voir le pack ». L'envoi de
/// la demande reste à l'hôte ; `isPending` et `isDone` lui sont remis, jamais gardés.
public struct MeeshyLockedRowAction {
    public let title: String
    public let isPending: Bool
    public let isDone: Bool
    public let perform: () -> Void

    public init(title: String, isPending: Bool = false, isDone: Bool = false, perform: @escaping () -> Void) {
        self.title = title
        self.isPending = isPending
        self.isDone = isDone
        self.perform = perform
    }
}

/// **La recette de K37 en VALEURS** : forme, pointillé, cadenas, geste, ouverture.
/// La rangée ne reçoit que trois textes ; aucune valeur, image ou compte protégé n'a
/// de place dans cette recette.
public nonisolated struct MeeshyLockedRowRecipe: Sendable, Equatable {

    public enum UnlockStep: String, Sendable, Equatable {
        case rest = "repos"
        case play = "joue"
    }

    public let cornerRadius: Double
    public let minimumHeight: Double
    public let showsThingGlyph: Bool
    public let thingGlyphSize: Double
    public let strokeWidth: Double
    public let dash: [Double]
    public let lockSize: Double
    public let actionHeight: Double
    public let showsLock: Bool
    public let isDashed: Bool
    public let showsAction: Bool
    public let actionIsActive: Bool
    public let isButton: Bool
    public let pressedScale: Double
    public let unlockFadeMilliseconds: Int
    public let animatesDash: Bool

    public static func resolve(form: MeeshyLockedRowForm,
                               hasAction: Bool,
                               isPending: Bool,
                               isDone: Bool,
                               isOpen: Bool,
                               isPressable: Bool,
                               isPressed: Bool,
                               isEnabled: Bool,
                               isUnlocking: Bool = false,
                               reduceMotion: Bool) -> MeeshyLockedRowRecipe {
        let isButton = isPressable && isEnabled
        return MeeshyLockedRowRecipe(
            cornerRadius: cornerRadius(form),
            minimumHeight: form == .row ? 58 : 0,
            showsThingGlyph: form == .tile,
            thingGlyphSize: 28,
            strokeWidth: 1.5,
            dash: [5, 4.4],
            lockSize: form == .inline ? 16 : 22,
            actionHeight: 44,
            showsLock: !isOpen,
            isDashed: !isOpen,
            showsAction: hasAction && form != .inline,
            actionIsActive: hasAction && !isPending && !isDone,
            isButton: isButton,
            pressedScale: isButton && isPressed ? 0.98 : 1,
            unlockFadeMilliseconds: reduceMotion ? MeeshyMotionRecipe.reducedFadeMilliseconds : 280,
            animatesDash: isUnlocking && !reduceMotion
        )
    }

    private static func cornerRadius(_ form: MeeshyLockedRowForm) -> Double {
        switch form {
        case .row: return 20
        case .tile: return 24
        case .inline: return 0
        }
    }

    /// L'ouverture se joue UNE fois : un second rendu à valeur égale ne rejoue rien.
    public static func unlockStep(isUnlocking: Bool, hasPlayed: Bool) -> UnlockStep {
        isUnlocking && !hasPlayed ? .play : .rest
    }
}

/// Les mots dits : l'état fermé est écrit et dit, jamais seulement atténué.
public nonisolated enum MeeshyLockedRowWords {

    /// « Présence, verrouillé, dès Ami » ; ouvert : « Présence, déverrouillé ».
    public static func spokenLabel(title: String, requirement: String, isOpen: Bool,
                                   bundle: Bundle? = nil, locale: Locale = .current) -> String {
        guard !isOpen else {
            let open = String(localized: "kit.locked_row.unlocked", defaultValue: "déverrouillé",
                              bundle: bundle ?? .module, locale: locale)
            return "\(title), \(open)"
        }
        let locked = String(localized: "kit.locked_row.locked", defaultValue: "verrouillé",
                            bundle: bundle ?? .module, locale: locale)
        return "\(title), \(locked), \(requirement)"
    }

    /// « En cours » pendant que la demande part ; `nil` sinon (fait se dit désactivé).
    public static func actionValue(isPending: Bool, isDone: Bool,
                                   bundle: Bundle? = nil, locale: Locale = .current) -> String? {
        guard isPending else { return nil }
        return String(localized: "kit.button.busy", defaultValue: "En cours", bundle: bundle ?? .module, locale: locale)
    }
}
