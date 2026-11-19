import Foundation

/// Les sept mouvements de l'app : une liste fermée, des verbes (jamais un écran).
public nonisolated enum MeeshyMotionToken: String, Sendable, Equatable, CaseIterable {
    case morph
    case travel
    case flip
    case collapse
    case rise
    case float
    case pulse
}

/// Comment la valeur d'un jeton se lit : un ressort, une durée posée, un
/// avancement piloté par le défilement, ou une boucle d'ambiance.
public nonisolated enum MeeshyMotionNature: String, Sendable, Equatable {
    case spring
    case timed
    case driven
    case loop
}

/// Le retour haptique d'un jeton : un seul, à un instant précis. `none` laisse
/// l'hôte jouer le sien.
public nonisolated enum MeeshyMotionHaptic: String, Sendable, Equatable {
    case light
    case medium
    case rigid
    case none
}

/// Ce que devient un jeton sous « Réduire les animations » : un fondu court, ou
/// l'arrêt sur l'image de repos pour une boucle.
public nonisolated enum MeeshyMotionReduced: Sendable, Equatable {
    case fade(milliseconds: Int)
    case stop
}

/// La forme que prend `morph` : la pastille pleine, la goutte de fusion ou le
/// contour organique.
public nonisolated enum MeeshyMotionShape: String, Sendable, Equatable, CaseIterable {
    case plain
    case drop
    case organic
}

/// Les trois recettes nommées : elles composent les sept jetons, n'en ajoutent
/// aucun.
public nonisolated enum MeeshyMotionNamed: String, Sendable, Equatable, CaseIterable {
    case reveal
    case shimmer
    case celebrate
}

/// Une recette nommée résolue : les jetons qu'elle compose, et si elle est
/// réduite (échange sec, aplat fixe, repli fixe sans particule).
public nonisolated struct MeeshyMotionNamedRecipe: Sendable, Equatable {
    public let name: MeeshyMotionNamed
    public let tokens: [MeeshyMotionToken]
    public let isReduced: Bool
}

/// **La recette de K26 en VALEURS** : la table des sept jetons, la seule source
/// des ressorts, des durées et des retours haptiques de l'app. Aucune vue,
/// aucune horloge, aucun singleton : l'hôte lit « réduire les animations » et le
/// passe en `reduce`.
public nonisolated struct MeeshyMotionRecipe: Sendable, Equatable {

    /// Le fondu qui remplace tout mouvement sous « réduire les animations ».
    public static let reducedFadeMilliseconds = 160
    /// Aucun jeton hors boucle ne dure plus.
    public static let nonLoopCeilingMilliseconds = 600
    /// Le décalage d'une cascade, par rang.
    public static let cascadeStepMilliseconds = 80
    /// Le rang le plus loin d'une cascade : une cascade entière tient en 600 ms.
    public static let cascadeMaxRank = 3
    /// La plage du repli piloté par le défilement, en points.
    public static let collapseRange = 220

    public let token: MeeshyMotionToken
    public let nature: MeeshyMotionNature
    public let durationMilliseconds: Int
    public let driveRange: Int
    public let response: Double?
    public let damping: Double?
    public let delayStepMilliseconds: Int
    public let haptic: MeeshyMotionHaptic
    public let reduced: MeeshyMotionReduced
    public let isReduced: Bool

    /// La durée réellement vécue : celle du jeton, le fondu sous réduction, 0
    /// pour une boucle arrêtée.
    public var effectiveDurationMilliseconds: Int {
        guard isReduced else { return durationMilliseconds }
        switch reduced {
        case .fade(let milliseconds): return milliseconds
        case .stop: return 0
        }
    }

    /// Le décalage de cascade réellement vécu : aucun sous réduction.
    public var effectiveDelayStepMilliseconds: Int {
        isReduced ? 0 : delayStepMilliseconds
    }

    /// La raideur Android d'un ressort : `(2π / réponse)²`, jamais un littéral.
    public var androidStiffness: Double? {
        guard let response, response > 0 else { return nil }
        let omega = 2 * Double.pi / response
        return omega * omega
    }

    public static func resolve(token: MeeshyMotionToken, reduce: Bool = false) -> MeeshyMotionRecipe {
        let entry = row(of: token)
        return MeeshyMotionRecipe(
            token: token,
            nature: entry.nature,
            durationMilliseconds: entry.duration,
            driveRange: entry.nature == .driven ? collapseRange : 0,
            response: entry.response,
            damping: entry.damping,
            delayStepMilliseconds: entry.delayStep,
            haptic: entry.haptic,
            reduced: entry.nature == .loop ? .stop : .fade(milliseconds: reducedFadeMilliseconds),
            isReduced: reduce
        )
    }

    /// Pulse : un à trois anneaux.
    public static func pulseRings(_ requested: Int) -> Int {
        min(max(requested, 1), 3)
    }

    /// Les recettes nommées : les jetons qu'elles composent.
    public static func named(_ name: MeeshyMotionNamed, reduce: Bool) -> MeeshyMotionNamedRecipe {
        let tokens: [MeeshyMotionToken]
        switch name {
        case .reveal: tokens = [.rise]
        case .shimmer: tokens = [.pulse, .rise]
        case .celebrate: tokens = [.morph, .rise]
        }
        return MeeshyMotionNamedRecipe(name: name, tokens: tokens, isReduced: reduce)
    }

    private struct Row {
        let nature: MeeshyMotionNature
        let duration: Int
        let response: Double?
        let damping: Double?
        let delayStep: Int
        let haptic: MeeshyMotionHaptic
    }

    private static func row(of token: MeeshyMotionToken) -> Row {
        switch token {
        case .morph:
            return Row(nature: .spring, duration: 420, response: 0.42, damping: 0.7, delayStep: 0, haptic: .light)
        case .travel:
            return Row(nature: .spring, duration: 560, response: 0.56, damping: 0.82, delayStep: 0, haptic: .medium)
        case .flip:
            return Row(nature: .spring, duration: 500, response: 0.5, damping: 0.86, delayStep: 0, haptic: .rigid)
        case .collapse:
            return Row(nature: .driven, duration: 0, response: nil, damping: nil, delayStep: 0, haptic: .light)
        case .rise:
            return Row(nature: .spring, duration: 360, response: 0.36, damping: 0.86,
                       delayStep: cascadeStepMilliseconds, haptic: .none)
        case .float:
            return Row(nature: .loop, duration: 9000, response: nil, damping: nil, delayStep: 0, haptic: .none)
        case .pulse:
            return Row(nature: .loop, duration: 2200, response: nil, damping: nil, delayStep: 0, haptic: .none)
        }
    }
}
