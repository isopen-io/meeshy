import Foundation

/// Les sept genres du bouton libellé.
public nonisolated enum MeeshyButtonKind: String, Sendable, Equatable, CaseIterable {
    case primary
    case accent
    case tinted
    case glass
    case outline
    case danger
    case text
}

/// Les quatre hauteurs de la capsule (le rang est la hauteur en points).
public nonisolated enum MeeshyButtonSize: Int, Sendable, Equatable, CaseIterable {
    case s56 = 56
    case s50 = 50
    case s44 = 44
    case s36 = 36
}

/// La capsule libellée, le disque plein de l'action phare, le disque qu'on maintient.
public nonisolated enum MeeshyButtonShape: String, Sendable, Equatable, CaseIterable {
    case capsule
    case round
    case hold
}

public nonisolated enum MeeshyButtonWidth: String, Sendable, Equatable, CaseIterable {
    case fit
    case fill
}

/// L'état d'un maintien, remis par l'hôte : le bouton ne connaît ni micro ni réseau.
public nonisolated enum MeeshyButtonHoldState: String, Sendable, Equatable, CaseIterable {
    case idle
    case held
    case live
    case refused
}

/// Le fond d'un genre : un rôle, jamais une couleur. La vue le traduit en matière.
public nonisolated enum MeeshyButtonSurface: String, Sendable, Equatable {
    case brand
    case accent
    case tintedSoft
    case glass
    case clear
    case dangerSoft
}

/// L'encre d'un genre, avec son contraste garanti par la vue.
public nonisolated enum MeeshyButtonInk: String, Sendable, Equatable {
    case onBrand
    case onAccent
    case tint
    case onGlass
    case neutral
    case danger
}

/// **La recette de K40 en VALEURS** : hauteur, marges, glyphe et corps du
/// libellé par taille, les formes round et hold, les états. Aucune vue, aucune
/// couleur : le fond et l'encre sont des rôles que la vue habille.
public nonisolated struct MeeshyButtonRecipe: Sendable, Equatable {

    /// La cible ne descend jamais sous 44 : en 36, elle déborde de 4 de chaque côté.
    public static let minimumTapHeight: Double = 44
    public static let pressedScale: Double = 0.94
    public static let disabledOpacity: Double = 0.45
    public static let glyphGap: Double = 8
    /// La marge de fin se réduit de 6 quand un emplacement de fin est là.
    public static let trailingMarginReduction: Double = 6
    public static let outlineStroke: Double = 1.5
    public static let roundDiameter: Double = 56
    public static let roundGlyph: Double = 28
    public static let holdDiameter: Double = 96
    public static let holdGlyph: Double = 36
    /// Les genres que round et hold acceptent ; tout autre devient `primary`.
    public static let roundKinds: [MeeshyButtonKind] = [.primary, .accent, .tinted]

    public let kind: MeeshyButtonKind
    public let shape: MeeshyButtonShape
    public let height: Double
    public let tapHeight: Double
    public let diameter: Double?
    public let horizontalMargin: Double
    public let glyphSize: Double
    public let fontSize: Double
    public let scale: Double
    public let isDarkened: Bool
    public let contentOpacity: Double
    public let isActionable: Bool
    public let showsIndicator: Bool
    public let showsDeferredClock: Bool
    public let surface: MeeshyButtonSurface
    public let ink: MeeshyButtonInk
    public let outlineWidth: Double

    public static func resolve(kind: MeeshyButtonKind,
                               size: MeeshyButtonSize,
                               shape: MeeshyButtonShape,
                               isPressed: Bool,
                               isEnabled: Bool,
                               isPending: Bool,
                               isDeferred: Bool,
                               isDestructive: Bool,
                               reduceMotion: Bool) -> MeeshyButtonRecipe {
        let resolvedKind = shape == .capsule || roundKinds.contains(kind) ? kind : .primary
        let measures = measures(size: size, shape: shape)
        return MeeshyButtonRecipe(
            kind: resolvedKind,
            shape: shape,
            height: measures.height,
            tapHeight: max(measures.height, minimumTapHeight),
            diameter: shape == .capsule ? nil : measures.height,
            horizontalMargin: measures.margin,
            glyphSize: measures.glyph,
            fontSize: measures.font,
            scale: isPressed && !reduceMotion ? pressedScale : 1,
            isDarkened: isPressed,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            isActionable: isEnabled && !isPending,
            showsIndicator: isPending,
            showsDeferredClock: isDeferred && isEnabled,
            surface: surface(of: resolvedKind),
            ink: ink(of: resolvedKind, isDestructive: isDestructive),
            outlineWidth: resolvedKind == .outline ? outlineStroke : 0
        )
    }

    private static func measures(size: MeeshyButtonSize, shape: MeeshyButtonShape)
        -> (height: Double, margin: Double, glyph: Double, font: Double) {
        switch shape {
        case .round: return (roundDiameter, 0, roundGlyph, 0)
        case .hold: return (holdDiameter, 0, holdGlyph, 0)
        case .capsule:
            switch size {
            case .s56: return (56, 26, 22, 16)
            case .s50: return (50, 22, 22, 15)
            case .s44: return (44, 16, 16, 13.5)
            case .s36: return (36, 12, 16, 12.5)
            }
        }
    }

    private static func surface(of kind: MeeshyButtonKind) -> MeeshyButtonSurface {
        switch kind {
        case .primary: return .brand
        case .accent: return .accent
        case .tinted: return .tintedSoft
        case .glass: return .glass
        case .outline, .text: return .clear
        case .danger: return .dangerSoft
        }
    }

    private static func ink(of kind: MeeshyButtonKind, isDestructive: Bool) -> MeeshyButtonInk {
        switch kind {
        case .primary: return .onBrand
        case .accent: return .onAccent
        case .tinted, .outline: return .tint
        case .glass: return .onGlass
        case .danger: return .danger
        case .text: return isDestructive ? .danger : .neutral
        }
    }
}

/// **La loi du maintien** : `true` au doigt posé, `false` au doigt levé, sorti
/// ou si le bouton disparaît ; jamais deux `true` de suite, jamais deux `false`.
public nonisolated struct MeeshyButtonHoldLaw: Sendable, Equatable {
    /// La marge autour du disque avant qu'un doigt qui glisse soit « sorti ».
    public static let exitSlop: Double = 16

    public private(set) var isHeld = false
    private var isTouchSpent = false

    public init() {}

    /// Le point du doigt est-il sur le disque, marge comprise ? Un point non fini est dehors.
    public static func isInside(x: Double, y: Double, diameter: Double) -> Bool {
        guard x.isFinite, y.isFinite, diameter.isFinite else { return false }
        let radius = diameter / 2
        let dx = x - radius
        let dy = y - radius
        return (dx * dx + dy * dy).squareRoot() <= radius + exitSlop
    }

    /// Le doigt posé ou qui glisse : sur la cible d'un bouton allumé, il arme une
    /// fois ; sorti, ou le bouton éteint, il relâche, et ce toucher ne réarme plus
    /// jusqu'au doigt levé.
    public mutating func track(isInside: Bool, isEnabled: Bool) -> Bool? {
        guard !isTouchSpent else { return nil }
        guard isInside, isEnabled else {
            isTouchSpent = true
            return release()
        }
        return press()
    }

    /// Le doigt levé, ou le geste annulé par le système : relâche ce qui tient, et
    /// le toucher suivant repart de zéro.
    public mutating func endTouch() -> Bool? {
        isTouchSpent = false
        return release()
    }

    /// Le bouton cesse d'être disponible (éteint, occupé) pendant qu'on le tient :
    /// relâche sans attendre que le doigt bouge, et un doigt encore posé ne
    /// réarme plus jusqu'à ce qu'il se lève.
    public mutating func revoke(isTouching: Bool) -> Bool? {
        if isTouching { isTouchSpent = true }
        return release()
    }

    /// Le doigt se pose : `true` une seule fois, `nil` s'il tenait déjà.
    public mutating func press() -> Bool? {
        guard !isHeld else { return nil }
        isHeld = true
        return true
    }

    /// Le doigt se lève : `false` une seule fois, `nil` s'il ne tenait pas.
    public mutating func release() -> Bool? {
        guard isHeld else { return nil }
        isHeld = false
        return false
    }

    /// Le doigt sort ou le bouton disparaît : même effet qu'un doigt levé.
    public mutating func cancel() -> Bool? {
        release()
    }

    /// L'action du lecteur d'écran : relâche ce qui tient ; n'arme qu'un bouton allumé.
    public mutating func toggle(isEnabled: Bool) -> Bool? {
        if isHeld { return release() }
        return isEnabled ? press() : nil
    }
}

/// Le retour d'un changement d'état du maintien : un tic ferme, ou une erreur.
public nonisolated enum MeeshyButtonHoldFeedback: String, Sendable, Equatable {
    case firm
    case error
}

/// **Le décor du maintien** : tant que l'hôte dit « en émission », deux ondes
/// partent du disque (2,6 s, décalées de 1,3 s, de 1 à 1,85 fois, de 0,75 à 0) ;
/// sous mouvement réduit, un anneau plein de 6 à leur place. Un tic ferme à
/// l'ouverture et à la fermeture de l'émission, une erreur au refus.
public nonisolated struct MeeshyButtonHoldDecor: Sendable, Equatable {
    public static let liveWaveCount = 2
    public static let wavePeriodSeconds: Double = 2.6
    public static let waveStartOpacity: Double = 0.75
    public static let waveEndScale: Double = 1.85
    public static let waveStroke: Double = 2
    public static let stillRingWidth: Double = 6

    public let waveCount: Int
    public let showsStillRing: Bool

    public static func resolve(holdState: MeeshyButtonHoldState, reduceMotion: Bool) -> MeeshyButtonHoldDecor {
        let isLive = holdState == .live
        return MeeshyButtonHoldDecor(waveCount: isLive && !reduceMotion ? liveWaveCount : 0,
                                     showsStillRing: isLive && reduceMotion)
    }

    /// L'onde `index` sur `count` après `elapsed` secondes : échelle et opacité.
    public static func wave(index: Int, count: Int, elapsed: Double) -> MeeshyMedallionWave {
        let share = count > 0 ? Double(min(max(index, 0), count - 1)) / Double(count) : 0
        let turns = (elapsed.isFinite ? elapsed : 0) / wavePeriodSeconds + share
        let progress = turns - turns.rounded(.down)
        return MeeshyMedallionWave(scale: 1 + (waveEndScale - 1) * progress,
                                   opacity: waveStartOpacity * (1 - progress))
    }

    /// Le retour à jouer quand l'hôte change l'état : `nil` quand rien ne s'ouvre,
    /// ne se ferme ni n'est refusé.
    public static func feedback(from old: MeeshyButtonHoldState,
                                to new: MeeshyButtonHoldState) -> MeeshyButtonHoldFeedback? {
        guard old != new else { return nil }
        if new == .refused { return .error }
        return old == .live || new == .live ? .firm : nil
    }
}

/// **La paire** : deux boutons sur une ligne, écart 8, le principal prend 1,6
/// part et l'autre 1, même hauteur ; elle s'empile aux très grandes polices.
public nonisolated enum MeeshyButtonPairLaw {
    public static let primaryShare: Double = 1.6
    public static let secondaryShare: Double = 1.0
    public static let spacing: Double = 8

    public static func widths(total: Double) -> (primary: Double, secondary: Double) {
        let available = max(total.isFinite ? total - spacing : 0, 0)
        let primary = available * primaryShare / (primaryShare + secondaryShare)
        return (primary, available - primary)
    }

    public static func stacks(isAccessibilitySize: Bool) -> Bool {
        isAccessibilitySize
    }

    /// La largeur qu'il faut pour que chaque bouton tienne entier dans sa part.
    public static func neededWidth(primaryIdeal: Double, secondaryIdeal: Double) -> Double {
        let whole = primaryShare + secondaryShare
        return max(primaryIdeal * whole / primaryShare, secondaryIdeal * whole / secondaryShare) + spacing
    }

    /// La paire s'empile aux très grandes polices, et dès qu'un libellé ne tient
    /// pas dans sa part : un libellé ne se coupe ni ne déborde sur son voisin.
    public static func stacks(isAccessibilitySize: Bool,
                              total: Double,
                              primaryIdeal: Double,
                              secondaryIdeal: Double) -> Bool {
        guard !isAccessibilitySize else { return true }
        return neededWidth(primaryIdeal: primaryIdeal, secondaryIdeal: secondaryIdeal) > total + 1e-6
    }
}

/// Les mots de K40 : la valeur dite et la raison d'un bouton éteint. Le nom du
/// bouton est son `title`, déjà traduit par l'hôte.
public enum MeeshyButtonWords {

    /// « En cours » quand occupé, « Sera envoyé » quand différé, sinon rien.
    public static func spokenValue(isPending: Bool,
                                   isDeferred: Bool,
                                   bundle: Bundle? = nil,
                                   locale: Locale = .current) -> String? {
        if isPending {
            return String(localized: "kit.button.busy", defaultValue: "En cours",
                          bundle: bundle ?? .module, locale: locale)
        }
        if isDeferred {
            return String(localized: "kit.button.deferred", defaultValue: "Sera envoyé",
                          bundle: bundle ?? .module, locale: locale)
        }
        return nil
    }

    /// La raison d'un bouton éteint, lue après son nom ; absente si vide ou si le
    /// bouton est allumé.
    public static func hint(disabledReason: String?, isEnabled: Bool = false) -> String? {
        guard !isEnabled, let disabledReason, !disabledReason.isEmpty else { return nil }
        return disabledReason
    }
}
