import SwiftUI

/// **La recette de K54 en VALEURS** : le trait, son liseré, le sens, la tête de lecture,
/// l'état périmé. Aucune couleur (la teinte vient de l'hôte), aucun fournisseur de carte.
public nonisolated struct MeeshyMapTraceRecipe: Sendable, Equatable {

    public static let staleOpacity: Double = 0.6
    public static let casingOpacity: Double = 0.55
    public static let lightMapCasingOpacity: Double = 0.7
    public static let historyHaloOpacity: Double = 0.16
    public static let headDiameter: Double = 18
    public static let headRing: Double = 3
    public static let headHalo: Double = 5
    public static let nodeDiameter: Double = 14
    public static let nodeRing: Double = 3
    public static let flowDistance: Double = 20
    public static let flowSeconds: Double = 1.4
    public static let historyStops: [(location: Double, opacity: Double)] = [(0, 0.12), (0.4, 0.45), (1, 1)]

    public let strokeWidth: Double
    public let casingWidth: Double
    public let casingOpacity: Double
    public let dotGap: Double
    public let dotsFlow: Bool
    public let progress: Double?
    public let showsHead: Bool
    public let isDesaturated: Bool
    public let opacity: Double
    public let kind: MeeshyMapTraceKind

    public static func resolve(kind: MeeshyMapTraceKind,
                               weight: MeeshyMapTraceWeight,
                               progress: Double?,
                               isStale: Bool,
                               onLightMap: Bool,
                               isAnimated: Bool,
                               reduceMotion: Bool) -> MeeshyMapTraceRecipe {
        let large = weight == .large
        let clamped = progress.map { $0.isFinite ? min(max($0, 0), 1) : 0 }
        return MeeshyMapTraceRecipe(
            strokeWidth: strokeWidth(kind: kind, large: large),
            casingWidth: casingWidth(kind: kind, large: large),
            casingOpacity: onLightMap ? lightMapCasingOpacity : casingOpacity,
            dotGap: large ? 11 : 10,
            dotsFlow: kind != .history && isAnimated && !isStale && !reduceMotion,
            progress: clamped,
            showsHead: clamped != nil,
            isDesaturated: isStale,
            opacity: isStale ? staleOpacity : 1,
            kind: kind
        )
    }

    private static func strokeWidth(kind: MeeshyMapTraceKind, large: Bool) -> Double {
        switch kind {
        case .route: return large ? 4.5 : 4
        case .link: return 2.5
        case .history: return 7
        }
    }

    private static func casingWidth(kind: MeeshyMapTraceKind, large: Bool) -> Double {
        switch kind {
        case .route: return large ? 8 : 7
        case .link: return 5
        case .history: return 16
        }
    }

    /// Le tracé se dessine par un ressort `travel` de 600 ms ; posé d'emblée sous mouvement réduit.
    public static func drawAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .easeOut(duration: 0.6)
    }
}
